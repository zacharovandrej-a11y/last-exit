// ===== LAST EXIT — 3D-мир (Three.js, low-poly), изометрическая камера над плоской картой =====
// Визуальные улицы: дороги берём из генератора мира (objs.roads — трассы, улицы, грунтовки с реальной шириной),
// от дверей к ближайшей дороге ведут короткие дорожки; перекрёстки ищем, чтобы не рисовать разметку поверх них.
function planStreets(objs) {
  const segs = [];
  (objs.roads || []).forEach((r, ri) => { for (let i = 1; i < r.pts.length; i++) segs.push([r.pts[i - 1], r.pts[i], r.w, r.k, ri]); });
  const proj = (p, [a, b]) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-6, dot(ab, ab)))); return add(a, ab, t); };
  // перекрёстки: пересечения отрезков разных дорог и концы дорог, упирающиеся в другую дорогу
  const junctions = [], addJ = (p, r) => { const j = junctions.find(q => dist(q.p, p) < 40); if (j) j.r = Math.max(j.r, r); else junctions.push({ p, r }); };
  for (let i = 0; i < segs.length; i++) for (let k = i + 1; k < segs.length; k++) { const A = segs[i], B = segs[k]; if (A[4] === B[4]) continue;
    const r = Math.max(A[2], B[2]) / 2 + 8, d1 = sub(A[1], A[0]), d2 = sub(B[1], B[0]), den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) > 1e-6) { const w = sub(B[0], A[0]), t = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den;
      if (t > -.02 && t < 1.02 && u > -.02 && u < 1.02) { addJ(add(A[0], d1, t), r); continue; } }
    for (const [S, O] of [[A, B], [B, A]]) for (const e of [S[0], S[1]]) { const q = proj(e, O); if (dist(e, q) < O[2] / 2 + 12) addJ(q, r); } }
  const walks = [], missed = [];
  for (const b of objs.blds) for (const d of b.doors) {
    const out = norm(sub(d.o, d.i)), gate = b.yard ? add(b.p, out, b.yard[1] / 2 + 6) : d.o;
    let best = null, bd = 1e9; for (const sg of segs) { const q = proj(gate, sg), dd = dist(gate, q) - sg[2] / 2; if (dd < bd) { bd = dd; best = [sg, q]; } }
    if (!best || bd > 420) { missed.push(b.id); continue; }
    const [sg, q] = best, end = bd > 4 ? add(q, norm(sub(gate, q)), sg[2] / 2 - 6) : gate;
    // дорожка не должна проходить сквозь дома (задние двери — без дорожки)
    let ok = true; for (let i = 8; i <= 100 && ok; i++) { const p = lerp(gate, end, i / 100); if (bldAt(objs.blds, p) >= 0) ok = false; }
    if (!ok) continue;
    walks.push({ bid: b.id, points: b.yard ? [lerp(d.i, d.o, .5), d.o, gate, end] : [lerp(d.i, d.o, .5), d.o, end] });
  }
  return { roads: segs.map(sg => [sg[0], sg[1]]), segs, junctions, walks, missed };
}
const G3 = (() => {
  const T = THREE;
  const glc = document.getElementById('g');
  const lowEnd = Math.min(screen.width, screen.height) < 500;
  // стиль «как в 90-х»: рендер в низком разрешении + растягивание по пикселям (#hd — чёткая картинка)
  // По умолчанию естественный свет окружения и toon-персонажи; #toonall — старый toon, #bright и #real — сравнение.
  const STYLE = /real/.test(location.hash) ? 'real' : /bright/.test(location.hash) ? 'bright' : 'toon', OUTLINE_ALL = /toonall/.test(location.hash);
  const GROUNDED = STYLE === 'toon' && !OUTLINE_ALL;
  const HD = /hd/.test(location.hash) || STYLE !== 'real', PIXH = 360;
  const renderer = new T.WebGLRenderer({ canvas: glc, antialias: HD, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = GROUNDED ? T.PCFSoftShadowMap : T.PCFShadowMap;
  if (!HD) glc.style.imageRendering = 'pixelated';
  const scene = new T.Scene(); scene.background = new T.Color(0x2a1a16);
  // ортогональная камера под постоянным углом (изометрия): карта не вращается, «вверх» на экране — всегда одно направление
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, -3000, 8000);
  const CAM_OFF = new T.Vector3(1, 1, 1).normalize().multiplyScalar(2500);
  const at = (p, h = 0) => new T.Vector3(p[0], h, p[1]);
  if (GROUNDED) scene.add(new T.HemisphereLight(0xe2d4bd, 0x656052, .85)); // закат: тёплое небо, бурая земля
  else scene.add(new T.AmbientLight(0xdfe6ff, STYLE === 'real' ? .5 : .62));
  // солнце с настоящими тенями; область теней ездит за камерой
  const SUN_DIR = new T.Vector3(-.8, .62, .42).normalize(); // низкое солнце — длинные тени
  const sun = new T.DirectionalLight(STYLE === 'real' ? 0xffe6c4 : GROUNDED ? 0xffbc84 : 0xfff3e0, STYLE === 'real' ? .95 : GROUNDED ? .9 : .85); scene.add(sun); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 10, far: 4000 }); sun.shadow.bias = -.0006;
  // общий «цветокор»: приглушённые цвета, чуть тёплый оттенок
  const GRADE = STYLE === 'real' ? 'float lum_=dot(gl_FragColor.rgb,vec3(.299,.587,.114));gl_FragColor.rgb=mix(vec3(lum_),gl_FragColor.rgb,.62)*vec3(1.03,1.,.88);'
    : GROUNDED ? 'float lum_=dot(gl_FragColor.rgb,vec3(.299,.587,.114));gl_FragColor.rgb=mix(vec3(lum_),gl_FragColor.rgb,.84)*vec3(1.06,.97,.88);' // постапокалипсис на закате: блёкло и тепло
    : 'float lum_=dot(gl_FragColor.rgb,vec3(.299,.587,.114));gl_FragColor.rgb=mix(vec3(lum_),gl_FragColor.rgb,1.18)*vec3(1.03,1.02,.98);';
  // мультяшный свет: 3 ступени вместо плавного
  const toonGrad = (() => { const d = new Uint8Array([90, 170, 255]), t = new T.DataTexture(d, 3, 1, T.LuminanceFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })();
  const MAT = o => STYLE === 'toon' ? new T.MeshToonMaterial(Object.assign({ gradientMap: toonGrad }, o)) : new T.MeshLambertMaterial(o);
  // общие параметры огня — их используют земля и все объекты (обугливание)
  const U = { zc: { value: new T.Vector2(0, 0) }, zrho: { value: 1e5 }, nc: { value: new T.Vector2(0, 0) }, nrho: { value: -1 }, t: { value: 0 } };
  function charrable(mat) { // объекты темнеют в огне
    mat.onBeforeCompile = sh => {
      sh.uniforms.zc = U.zc; sh.uniforms.zrho = U.zrho;
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvWP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;\n#else\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;\n#endif');
      sh.fragmentShader = 'varying vec3 vWP;uniform vec2 zc;uniform float zrho;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n'+GRADE+'if(length(vWP.xz-zc)>zrho)gl_FragColor.rgb=gl_FragColor.rgb*.16+vec3(.05,.02,.01);');
    };
    return mat;
  }
  // «грязь» на всех поверхностях — потёртости вместо плоского цвета
  const grunge = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 128, 128); const rnd = mkRng(77);
    for (let i = 0; i < 2600; i++) { const v = 150 + rnd() * 105 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 128 | 0, rnd() * 128 | 0, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,50,40,${.05 + rnd() * .1})`; g.beginPath(); g.arc(rnd() * 128, rnd() * 128, 6 + rnd() * 22, 0, 6.2832); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 124, 128, 4); g.fillRect(0, 0, 128, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const outlineMat = w => { const m = new T.MeshBasicMaterial({ color: 0x1b1612, side: T.BackSide }); m.customProgramCacheKey = () => 'outline-' + w;
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 p_=vec4(transformed,1.);mat3 nm_=mat3(1.);
#ifdef USE_INSTANCING
p_=instanceMatrix*p_;nm_=mat3(instanceMatrix);
#endif
vec4 wp_=modelMatrix*p_;vec3 wn_=normalize(mat3(modelMatrix)*normalize(nm_*normal));wp_.xyz+=wn_*${w.toFixed(2)};vec4 mvPosition=viewMatrix*wp_;gl_Position=projectionMatrix*mvPosition;`); }; return m; };
  const OUT_B = outlineMat(2.2), OUT_C = outlineMat(1.2), OUT_P = outlineMat(.25);
  function addOutline(mesh, mat) { if (STYLE !== 'toon') return; const o = mesh.isInstancedMesh ? new T.InstancedMesh(mesh.geometry, mat, mesh.count) : new T.Mesh(mesh.geometry, mat); if (mesh.isInstancedMesh) { o.instanceMatrix = mesh.instanceMatrix; o.frustumCulled = false; scene.add(o); mesh.userData.outline = o; } else mesh.add(o); }
  const matCache = {};
  const lam = (col, opt = {}) => { const k = col + JSON.stringify(opt); return matCache[k] || (matCache[k] = charrable(MAT(Object.assign({ color: col, map: grunge }, opt)))); };

  // Материалы окружения имеют плавное освещение; персонажи сохраняют читаемый toon-силуэт.
  const worldMats = {}, windMats = {};
  // бесшовная текстура листвы (оттенок даёт цвет экземпляра): тёмные промежутки + много листьев разной яркости
  const leafTile = (() => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = mkRng(909);
    g.fillStyle = '#4a4a40'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) { const x = r() * n, y = r() * n, a = r() * 6.28, l = 5 + r() * 7, b = 110 + r() * 145 | 0, w = r() < .15 ? 1.12 : 1;
      for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) { if (x + dx < -20 || x + dx > n + 20 || y + dy < -20 || y + dy > n + 20) continue;
        g.save(); g.translate(x + dx, y + dy); g.rotate(a); g.fillStyle = `rgb(${Math.min(255, b * w) | 0},${b},${b * .86 | 0})`; g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(-l * .2, -l * .48, l, 0); g.quadraticCurveTo(-l * .2, l * .48, -l, 0); g.fill(); g.restore(); } }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
  const foliageMats = {};
  const foliageMat = (opt = {}) => { const k = JSON.stringify(opt); if (foliageMats[k]) return foliageMats[k];
    const m = windMat(Object.assign({}, opt, { map: leafTile })), prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = sh => { prev(sh); sh.vertexShader = 'varying vec3 vFN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvFN=normalize(mat3(modelMatrix*instanceMatrix)*objectNormal);\n#else\nvFN=normalize(mat3(modelMatrix)*objectNormal);\n#endif');
      sh.fragmentShader = 'varying vec3 vFN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `vec3 bw_=pow(abs(normalize(vFN)),vec3(4.));bw_/=(bw_.x+bw_.y+bw_.z);
        vec4 tl_=texture2D(map,vWP.zy/22.)*bw_.x+texture2D(map,vWP.xz/22.)*bw_.y+texture2D(map,vWP.xy/22.)*bw_.z; diffuseColor.rgb*=mapTexelToLinear(tl_).rgb*1.35;`); };
    m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|foliage'; return foliageMats[k] = m; };
  // листва качается на ветру: смещение вершин в шейдере, сильнее у верхушки кроны (тени не качаются — это дёшево)
  const windMat = (opt = {}) => { const k = JSON.stringify(opt); if (windMats[k]) return windMats[k];
    const m = charrable((GROUNDED ? o => new T.MeshLambertMaterial(o) : MAT)(Object.assign({ color: 0xffffff, map: grunge }, opt))), prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = sh => { prev(sh); sh.uniforms.uT = U.t; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec3 ip_ = instanceMatrix[3].xyz; vec4 wp_ = instanceMatrix * vec4(transformed, 1.0); float sc_ = max(.001, length(instanceMatrix[0].xyz)); float h_ = clamp(wp_.y / 55.0, 0.0, 1.4); float ph_ = uT * 1.25 + ip_.x * .011 + ip_.z * .013;
        transformed.x += (sin(ph_) * 1.1 + sin(uT * 3.7 + wp_.y * .3 + wp_.x * .2) * .12) * h_ / sc_; transformed.z += (cos(ph_ * .83) * .8 + cos(uT * 3.1 + wp_.x * .25) * .1) * h_ / sc_; }
      #endif`); };
    m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|wind'; return windMats[k] = m; };
  const worldMat = (opt = {}) => { const k = JSON.stringify(opt); return worldMats[k] || (worldMats[k] = charrable((GROUNDED ? o => new T.MeshLambertMaterial(o) : MAT)(Object.assign({ color: 0xffffff, map: grunge }, opt)))); };

  // ===== земля =====
  const loader = new T.TextureLoader();
  // земля под травой: густая короткая трава и клевер (бесшовно), без нарисованных цветочков — живые цветы растут отдельно
  const grassTex = (() => { const n = 512, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = mkRng(3131);
    g.fillStyle = '#6f7a46'; g.fillRect(0, 0, n, n);
    const wrap = (x, y, f) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) if (x + dx > -30 && x + dx < n + 30 && y + dy > -30 && y + dy < n + 30) f(x + dx, y + dy); };
    for (let i = 0; i < 70; i++) { const x = r() * n, y = r() * n, rad = 30 + r() * 70, v = r(); wrap(x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, v < .5 ? 'rgba(150,140,80,.28)' : 'rgba(60,80,40,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); }); }
    for (let i = 0; i < 9000; i++) { const x = r() * n, y = r() * n, l = 3 + r() * 5, a = -1.57 + (r() - .5) * 1.2, b = r(); wrap(x, y, (X, Y) => { g.strokeStyle = b < .45 ? `rgba(40,55,25,${.35 + r() * .3})` : b < .85 ? `rgba(140,155,85,${.3 + r() * .3})` : `rgba(185,170,105,${.35})`; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); g.stroke(); }); }
    for (let i = 0; i < 260; i++) { const x = r() * n, y = r() * n, s = 2 + r() * 1.6, sh = .7 + r() * .4; wrap(x, y, (X, Y) => { g.fillStyle = `rgba(${70 * sh | 0},${105 * sh | 0},${50 * sh | 0},.8)`; for (let k = 0; k < 3; k++) { const a = k * 2.09 + x; g.beginPath(); g.arc(X + Math.cos(a) * s, Y + Math.sin(a) * s, s * .8, 0, 7); g.fill(); } }); } // клевер
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
  const crateTex = typeof ART === 'object' && ART.crate ? loader.load(ART.crate) : null;
  const gsize = HALF * 2 + 4000, gg = new T.PlaneGeometry(gsize, gsize, 1, 1); gg.rotateX(-Math.PI / 2);
  const ground = new T.Mesh(gg, new T.ShaderMaterial({
    uniforms: Object.assign(T.UniformsUtils.clone(T.UniformsLib.lights), { grass: { value: grassTex }, hasGrass: { value: grassTex ? 1 : 0 }, bc: { value: BIOMES.map(b => new T.Vector2(b.c[0], b.c[1])) }, bcol: { value: BIOMES.map(b => new T.Color(b.n === 'snow' ? '#7a6a48' : b.n === 'desert' ? '#8e8a52' : b.col)) }, brad: { value: BIOMES.map(b => b.r) }, hallC: { value: new T.Vector2(1e6, 1e6) }, hallU: { value: new T.Vector2(1, 0) }, hallHalf: { value: new T.Vector2() }, orderC: { value: new T.Vector2(1e6, 1e6) } }, U),
    lights: true,
    vertexShader: '#include <common>\n#include <shadowmap_pars_vertex>\nvarying vec2 vP;void main(){vec3 transformedNormal=normalMatrix*vec3(0.,1.,0.);vec4 worldPosition=modelMatrix*vec4(position,1.);vP=worldPosition.xz;gl_Position=projectionMatrix*viewMatrix*worldPosition;\n#include <shadowmap_vertex>\n}',
    fragmentShader: `
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform vec2 zc;uniform float zrho;uniform vec2 nc;uniform float nrho;uniform float t;
uniform vec2 bc[6];uniform vec3 bcol[6];uniform float brad[6];uniform sampler2D grass;uniform float hasGrass;
uniform vec2 hallC;uniform vec2 hallU;uniform vec2 hallHalf;uniform vec2 orderC;
varying vec2 vP;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float noise(vec2 x){vec2 i=floor(x);vec2 f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec3 grassBase=hasGrass>.5?texture2D(grass,vP/170.).rgb:vec3(.42,.74,.29);
 vec3 col=grassBase;
 float terrain=noise(vP*.012);
 col*=.88+.24*terrain;
 ${GROUNDED ? 'col=mix(vec3(.29,.36,.20),vec3(.53,.46,.27),terrain);col=mix(col,vec3(.31,.38,.21),smoothstep(.50,.79,noise(vP*.015))*.55);col=mix(col,grassBase*vec3(.73,.7,.50),.32);float meadow_=smoothstep(.18,.78,terrain);col=mix(col,col*vec3(.94,1.08,.85),meadow_*.54);' : ''}
 ${STYLE === 'real' ? 'col=mix(vec3(dot(col,vec3(.3,.59,.11))),col,.72)*vec3(.93,.9,.7);' : 'col*=vec3(1.02,1.05,.95);'} // трава: оливковая (реализм) или сочная
 float nb=noise(vP*.04);
 // вытоптанная земля и грязь пятнами
 float dn=noise(vP*.005)*.7+noise(vP*.021)*.45;
 col=mix(col,vec3(.47,.38,.27)*(.8+.35*nb),smoothstep(.72,.86,dn)*.85);
 col=mix(col,col*vec3(.78,.74,.6),smoothstep(.45,.7,noise(vP*.009)));
 for(int i=0;i<6;i++){float e=smoothstep(brad[i]+12.,brad[i]-12.,length(vP-bc[i])+(nb-.5)*30.);vec3 biome=bcol[i];${GROUNDED ? 'biome=mix(vec3(dot(biome,vec3(.3,.59,.11))),biome,.55)*vec3(.9,.92,.87);' : ''}col=mix(col,biome*(.9+.18*nb),e);}
 // Газон — часть той же земли: скруглённый неровный край, без отдельной плоскости и шва.
 vec2 hrel=vP-hallC;
 vec2 hp=vec2(dot(hrel,hallU),dot(hrel,vec2(-hallU.y,hallU.x)));
 vec2 he=abs(hp)-hallHalf+vec2(60.);
 float hedge=length(max(he,vec2(0.)))+min(max(he.x,he.y),0.)-60.;
 hedge+=(noise(vP*.035)-.5)*28.;
 float lawn=1.-smoothstep(-16.,34.,hedge);
 vec3 lawnCol=mix(vec3(.30,.38,.20),grassBase*vec3(.7,.64,.46),.42)*(.87+.24*nb);
 col=mix(col,lawnCol,lawn*.94);
 // Приглушённая земля кладбища, также на общей поверхности и с мягким краем.
 vec2 oe=abs(vP-orderC)-vec2(235.);
 float od=length(max(oe,vec2(0.)))+min(max(oe.x,oe.y),0.)-70.+(nb-.5)*22.;
 float cemetery=1.-smoothstep(-18.,38.,od);
 col=mix(col,vec3(.34,.33,.31)*(.9+.18*nb),cemetery*.94);
 // берег и вода по краю карты
 float e=max(abs(vP.x),abs(vP.y))-${HALF.toFixed(1)}+(noise(vP*.02)-.5)*40.;
 col=mix(col,vec3(.93,.84,.62)*(.92+.12*nb),smoothstep(-55.,-45.,e));
 vec3 water=vec3(.17,.37,.45)+.05*sin(t*1.5+vP.x*.03+vP.y*.02)+.06*smoothstep(10.,0.,e);
 col=mix(col,water,smoothstep(-6.,6.,e));
 float a=length(vP-zc);
 float burn=smoothstep(zrho-2.,zrho+4.,a);
 float cr=noise(vP*.05)*1.5;
 float lava=smoothstep(.86,.92,cr)*(1.-smoothstep(.95,1.02,cr));
 vec3 bcl=vec3(.1,.05,.04)*(.7+.5*nb)+vec3(1.,.38,.06)*lava*(.65+.35*sin(t*2.5+cr*30.));
 col=mix(col,bcl,burn);
 float d=a-zrho;
 col+=vec3(1.,.5,.1)*exp(-d*d/180.)*(1.3+.4*sin(t*9.+vP.x*.08+vP.y*.05));
 col+=vec3(.6,.15,0.)*exp(-pow(max(d,0.)/60.,2.))*.5*burn;
 if(nrho>=0.){float dd=abs(length(vP-nc)-nrho);float dash=step(.5,fract((vP.x+vP.y)*.02));col=mix(col,vec3(1.),smoothstep(6.,2.5,dd)*dash*.85);}
 gl_FragColor=vec4(col,1.);
 ${GRADE}
 float sh=1.;
 #if NUM_DIR_LIGHT_SHADOWS > 0
 DirectionalLightShadow s0=directionalLightShadows[0];
 sh=getShadow(directionalShadowMap[0],s0.shadowMapSize,s0.shadowBias,s0.shadowRadius,vDirectionalShadowCoord[0]);
 #endif
 gl_FragColor.rgb*=.58+.42*sh;
}`
  }));
  ground.receiveShadow = true; scene.add(ground);

  // ===== объекты мира (instanced) =====
  const geo = {
    box: new T.BoxGeometry(1, 1, 1), cyl6: new T.CylinderGeometry(1, 1, 1, 6), cyl10: new T.CylinderGeometry(1, 1, 1, 10),
    cone7: new T.ConeGeometry(1, 1, 7), ico1: new T.IcosahedronGeometry(1, 1), dod: new T.DodecahedronGeometry(1, 0), sph: new T.SphereGeometry(1, 10, 8),
    dome: new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    prism: (() => { const g = new T.CylinderGeometry(1, 1, 1, 3, 1); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); return g; })(), // треугольная призма: гребень вверх, длина по X
    lay: (() => { const g = new T.CylinderGeometry(1, 1, 1, 12); g.rotateZ(Math.PI / 2); return g; })(),
  };
  // prism: после поворотов — треугольник в плоскости YZ? подгоняем отдельно ниже
  geo.roof = (() => { const s = new T.Shape(); s.moveTo(-.5, 0); s.lineTo(.5, 0); s.lineTo(0, 1); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); g.rotateY(Math.PI / 2); return g; })(); // гребень вверх, длина по X, ширина по Z
  geo.pointedArch = (() => { const s = new T.Shape(); s.moveTo(-.5, 0); s.lineTo(-.5, .6); s.quadraticCurveTo(-.5, .8, 0, 1); s.quadraticCurveTo(.5, .8, .5, .6); s.lineTo(.5, 0); s.closePath(); return new T.ShapeGeometry(s, 6); })();
  geo.receiverRim = new T.TorusGeometry(1, .025, 4, 24); geo.receiverRim.rotateX(Math.PI / 2);
  geo.receiverDish = new T.LatheGeometry([new T.Vector2(1, .42), new T.Vector2(.7, .18), new T.Vector2(.3, .03), new T.Vector2(0, 0)], 16);
  // Низкополигональная кабина со скосами стоек, масштабируется под габариты авто.
  geo.foliage = geo.ico1.clone();
  const crown = geo.foliage.attributes.position, crownTones = [];
  for (let i = 0; i < crown.count; i++) {
    // Внутренняя и нижняя часть кроны темнее, чем наружный молодой прирост.
    const y = crown.getY(i), top = .68 + (y + 1) * .16;
    crownTones.push(top * .99, top, top * (y > .35 ? .94 : 1.01));
  }
  geo.foliage.setAttribute('color', new T.Float32BufferAttribute(crownTones, 3));
  geo.carCabin = new T.BoxGeometry(1, 1, 1);
  const cabinVertices = geo.carCabin.attributes.position;
  for (let i = 0; i < cabinVertices.count; i++) {
    if (cabinVertices.getY(i) > 0) cabinVertices.setXYZ(i, cabinVertices.getX(i) * .7,
      cabinVertices.getY(i), cabinVertices.getZ(i) * .83);
  }
  geo.carCabin.computeVertexNormals();
  geo.faceDetail = new T.IcosahedronGeometry(1, 0);
  geo.facePlane = new T.PlaneGeometry(1, 1);
  geo.tailoredTorso = new T.CylinderGeometry(.5, .42, 1, 8);
  geo.humanLimb = new T.CylinderGeometry(.5, .43, 1, 6);
  geo.slipperShoe = new T.CylinderGeometry(.5, .5, 1, 10);
  geo.slipperSole = (() => { const s = new T.Shape(); s.moveTo(-42, -21); s.quadraticCurveTo(-65, -21, -65, 0); s.quadraticCurveTo(-65, 21, -42, 21); s.lineTo(38, 24); s.quadraticCurveTo(66, 24, 66, 0); s.quadraticCurveTo(66, -24, 38, -24); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); return g; })();
  geo.slipperStrap = (() => { const s = new T.Shape(); s.moveTo(-24, 0); s.quadraticCurveTo(0, 48, 24, 0); s.lineTo(18, 0); s.quadraticCurveTo(0, 34, -18, 0); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: 30, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -15); g.rotateY(Math.PI / 2); return g; })();
  const M = (x, y, z, sx, sy, sz, ry = 0, rz = 0) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, rz)), new T.Vector3(sx, sy, sz));
  const MX = (x, y, z, sx, sy, sz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)), new T.Vector3(sx, sy, sz)); // цилиндр вдоль Z
  // ===== детальные модели мира: одна геометрия на тип (вершинные цвета), рисуются инстансами =====
  function mergeG(list) { // [[геометрия, матрица, цвет]] → одна геометрия с цветами вершин
    const pos = [], nor = [], col = [], uv = [], cc = new T.Color();
    for (const [g0, m, c] of list) { const g = g0.index ? g0.toNonIndexed() : g0.clone(); g.applyMatrix4(m); if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, VC = g.attributes.color; cc.set(c === undefined ? 0xffffff : c);
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
        if (VC) col.push(VC.getX(i) * cc.r, VC.getY(i) * cc.g, VC.getZ(i) * cc.b); else col.push(cc.r, cc.g, cc.b); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return g;
  }
  const RX = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  const extr = (pts, depth, bev, curves) => { const sh = new T.Shape(); curves(sh, pts); const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * .8, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, -depth / 2); return g; };
  const poly = (sh, pts) => { sh.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]); sh.closePath(); };
  // легковушка: длина 120, ширина 52 (масштаб под объект), арки колёс, капот, багажник, стойки
  geo.carBody = (() => {
    const body = extr(null, 48, 2, sh => { sh.moveTo(-57, 5); sh.lineTo(-48, 5); sh.absarc(-37, 5, 11, Math.PI, 0, true); sh.lineTo(26, 5); sh.absarc(37, 5, 11, Math.PI, 0, true); sh.lineTo(57, 5);
      sh.quadraticCurveTo(60.5, 5, 60.5, 9); sh.lineTo(60.5, 15); sh.quadraticCurveTo(60.5, 19.5, 56, 20); sh.lineTo(31, 22.4); sh.lineTo(22, 23); sh.lineTo(-31, 23); sh.lineTo(-49, 22.2); sh.quadraticCurveTo(-58.5, 21.5, -58.5, 16); sh.lineTo(-58.5, 9); sh.quadraticCurveTo(-58.5, 5, -57, 5); });
    const roof = extr([[-20.6, 35.3], [8.6, 35.7], [8, 37.8], [-20, 37.6]], 46, .8, poly);
    const bar = (a, b, z) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return [geo.box, RX((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, Math.hypot(dx, dy), 2.8, 2.2, 0, 0, Math.atan2(dy, dx))]; };
    const L = [[body, RX(0, 0, 0, 1, 1, 1)], [roof, RX(0, 0, 0, 1, 1, 1)]];
    for (const z of [-22.6, 22.6]) L.push(bar([22, 23], [8.2, 36.4], z), bar([-30, 23], [-20.2, 36], z), [geo.box, RX(-6, 29.6, z, 3.2, 13.4, 2.2)]);
    L.push([geo.box, RX(26, 23.2, 0, 8, .5, 44)]); // линия капота
    return mergeG(L.map(([g, m]) => [g, m, 0xffffff]));
  })();
  geo.carTrim = (() => { const D = 0x1c1c1c, L = [];
    // перед (+X): большое наклонное лобовое стекло, хромированная решётка, яркие фары сверху и спереди; зад (−X): короткое заднее стекло, широкая полоса красных фонарей
    L.push([extr([[-30, 23], [-20, 36], [8, 36.4], [22, 23]], 44, 1, poly), RX(0, 0, 0, 1, 1, 1), 0x24323c]);
    L.push([extr([[21.4, 23.4], [8.3, 35.9], [9.6, 36.1], [22.8, 23.4]], 44.6, 0, poly), RX(0, 0, 0, 1, 1, 1), 0x3e5464]); // светлый блик на лобовом
    L.push([geo.box, RX(0, 6, 0, 100, 3, 44), 0x141414]);
    L.push([geo.box, RX(61.8, 9, 0, 4.4, 6.4, 51), 0x9a9c9e], [geo.box, RX(64.1, 9.5, 0, .6, 3.6, 11), 0xe2ded2]); // передний бампер (хром), номер
    L.push([geo.box, RX(-60.8, 9, 0, 4, 6, 50), 0x2a2a2a], [geo.box, RX(-63, 9.5, 0, .6, 3.6, 11), 0xe2ded2]); // задний бампер, номер
    L.push([geo.box, RX(61, 15.5, 0, 1.2, 5.5, 24), 0x111111]); for (let k = -2; k <= 2; k++) L.push([geo.box, RX(61.5, 15.5, k * 4.4, .5, 5, .8), 0xa8aaa8]); // решётка с хромом
    for (const z of [-1, 1]) { L.push([geo.box, RX(60.9, 16.6, z * 17.5, 1.6, 4.2, 10), 0xfff4c8], [geo.box, RX(58.5, 19.2, z * 17.5, 4.5, .8, 10, 0, 0, -.12), 0xfff4c8]); // фары: видны и спереди, и сверху
      L.push([geo.box, RX(-59.3, 17.4, z * 14, 1.6, 3.8, 20), 0xc01c1c], [geo.box, RX(-57.4, 21, z * 14, 3.6, .8, 20, 0, 0, .1), 0xb01818]); } // широкие задние фонари
    for (const z of [-26, 26]) { L.push([geo.box, RX(19, 25, z, 4, 3, 2.6), D], [geo.box, RX(-5, 7.2, z * .985, 70, 2.4, 1), D]);
      L.push([geo.box, RX(56, 15, z * .99, 6, 2.2, 1), 0xd89a2a]); // поворотники спереди на крыльях
      for (const x of [-6, 16]) L.push([geo.box, RX(x, 15, z * 1.005, .6, 14, .4), 0x141414]);
      for (const x of [-2, 20]) L.push([geo.box, RX(x, 19.6, z * 1.008, 4, 1, .6), 0x8a8a86]); }
    for (const z of [-7, 7]) L.push([geo.box, RX(24, 23.6, z, 1, .6, 11, 0, .3, 0), 0x101010]);
    L.push([geo.cyl6, RX(-61, 6.5, 15, 1.3, 5, 1.3, 0, 0, Math.PI / 2), 0x4a4a46]);
    const g = mergeG(L), C = g.attributes.color; // фары светятся: цвет вершин ярче единицы
    for (let i = 0; i < C.count; i++) { const r = C.getX(i), gg = C.getY(i), b = C.getZ(i); if (r > .95 && gg > .9 && b > .7) C.setXYZ(i, 1.9, 1.8, 1.45); else if (r > .7 && gg < .15) C.setXYZ(i, 1.6, .18, .16); }
    return g;
  })();
  geo.wheel = (() => { const tire = new T.LatheGeometry([[5.6, -3.7], [8.2, -3.95], [9.1, -3.1], [9.45, -1.6], [9.5, 0], [9.45, 1.6], [9.1, 3.1], [8.2, 3.95], [5.6, 3.7]].map(([x, y]) => new T.Vector2(x, y)), 16);
    const L = [[tire, RX(0, 0, 0, 1, 1, 1, Math.PI / 2), 0x1b1b1b], [geo.cyl10, RX(0, 0, 0, 5.8, 7.2, 5.8, Math.PI / 2), 0x3a3a38], [geo.cyl10, RX(0, 0, 0, 5.4, 7.6, 5.4, Math.PI / 2), 0x9a9890], [geo.cyl10, RX(0, 0, 0, 1.6, 8.2, 1.6, Math.PI / 2), 0x6a6862]];
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; for (const z of [-3.95, 3.95]) L.push([geo.box, RX(Math.cos(a) * 2.9, Math.sin(a) * 2.9, z, 4.2, 1.4, .5, 0, 0, a), 0x5a5852]); } // спицы диска
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.28; L.push([geo.box, RX(Math.cos(a) * 9.45, Math.sin(a) * 9.45, 0, 1, .9, 7.4, 0, 0, a), 0x232323]); } // протектор
    return mergeG(L); })();
  // ===== разнообразный транспорт: хэтчбек, внедорожник, микроавтобус, пикап; грузовики (фургон, армейский), автобус =====
  // кузов легковушки по профилю: арки колёс, капот, лобовое, багажник (длина 120, ширина 52)
  function carShape({ rear, front, bot, belt, hood, ws, wx, wr }, depth = 48) { return extr(null, depth, 2, sh => { sh.moveTo(rear + 3, bot); sh.lineTo(wx[0] - wr - 1, bot); sh.absarc(wx[0], bot, wr + 1, Math.PI, 0, true); sh.lineTo(wx[1] - wr - 1, bot); sh.absarc(wx[1], bot, wr + 1, Math.PI, 0, true);
    sh.lineTo(front - 3, bot); sh.quadraticCurveTo(front, bot, front, bot + 4); sh.lineTo(front, hood - 5); sh.quadraticCurveTo(front, hood - .5, front - 4, hood); sh.lineTo(ws, belt); sh.lineTo(rear + 8, belt); sh.quadraticCurveTo(rear, belt - .5, rear, belt - 6); sh.lineTo(rear, bot + 4); sh.quadraticCurveTo(rear, bot, rear + 3, bot); }); }
  // общие детали: бамперы, фары (яркие), фонари, номера, зеркала, ручки, пороги
  function carTrim(L, { rear, front, bot, belt, hood, ws, W = 52, chrome = 0x9a9c9e }) { const hw = W / 2;
    L.push([geo.box, RX(front + 1.4, bot + 4, 0, 4, 6, W - 1), chrome], [geo.box, RX(rear - 1.2, bot + 4, 0, 4, 6, W - 2), 0x2a2a2a], [geo.box, RX(front + 3.6, bot + 4.5, 0, .6, 3.6, 11), 0xe2ded2], [geo.box, RX(rear - 3.4, bot + 4.5, 0, .6, 3.6, 11), 0xe2ded2]);
    L.push([geo.box, RX(front + .2, (bot + hood) / 2 + 1, 0, 1, (hood - bot) * .35, W * .42), 0x111111]);
    for (const z of [-1, 1]) { L.push([geo.box, RX(front + .2, hood - 4, z * hw * .66, 1.4, 4, W * .17), 0xfff4c8], [geo.box, RX(rear - .2, belt - 6, z * hw * .62, 1.4, 4, W * .2), 0xc01c1c], [geo.box, RX(ws - 3, belt + 2, z * (hw + .8), 4, 3, 2.6), 0x1c1c1c], [geo.box, RX((rear + front) / 2, bot + 2, z * hw * .985, (front - rear) * .55, 2.4, 1), 0x1c1c1c]);
      for (const x of [ws - 26, ws - 6]) L.push([geo.box, RX(x, belt - 3.4, z * hw * 1.006, 4, 1, .6), 0x8a8a86]); } }
  const glow = g => { const C = g.attributes.color; for (let i = 0; i < C.count; i++) { const r = C.getX(i), gg = C.getY(i), b = C.getZ(i); if (r > .95 && gg > .9 && b > .7) C.setXYZ(i, 1.9, 1.8, 1.45); else if (r > .7 && gg < .15) C.setXYZ(i, 1.6, .18, .16); } return g; };
  // кузов «лофтом»: поперечные сечения (скруглённый прямоугольник) вдоль длины — округлые борта, заваленные к крыше стойки, арки колёс;
  // стёкла, стойки, швы дверей, решётка кузова пикапа — цветом вершин (одна геометрия на модель)
  const lerpK = (kp, x) => { if (x <= kp[0][0]) return kp[0][1]; for (let i = 1; i < kp.length; i++) if (x <= kp[i][0]) { const [x0, y0] = kp[i - 1], [x1, y1] = kp[i], t = (x - x0) / (x1 - x0), e = t * t * (3 - 2 * t); return y0 + (y1 - y0) * (t * .35 + e * .65); } return kp[kp.length - 1][1]; };
  function loftCar(P) { const S = 90, Mr = 28, x0 = P.top[0][0], x1 = P.top[P.top.length - 1][0], pos = [], col = [], idx = [], W2 = P.W / 2, xc = (x0 + x1) / 2, hl = (x1 - x0) / 2, n = 4;
    const glassC = [.1, .12, .14], seamC = [.3, .3, .3], bedC = [.2, .2, .2];
    for (let i = 0; i <= S; i++) { const x = x0 + (x1 - x0) * i / S, top = lerpK(P.top, x); let bot = P.bot; for (const wx of P.wx) { const d = Math.abs(x - wx), R = P.wr + 1.8; if (d < R) bot = Math.max(bot, P.wr * .95 + Math.sqrt(R * R - d * d) * .55); }
      const u = Math.abs(x - xc) / hl, hw = W2 * (.7 + .3 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 9)))), mid = (bot + top) / 2, half = (top - bot) / 2, inGH = x > P.gh[0] && x < P.gh[1];
      for (let j = 0; j < Mr; j++) { const th = j / Mr * 6.2832, c = Math.cos(th), sn = Math.sin(th), yy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n); let y = mid + yy * half, z = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * hw;
        if (y > P.belt && inGH) z *= 1 - .2 * Math.min(1, (y - P.belt) / Math.max(1, top - P.belt)); // заваливание стоек к крыше
        pos.push(x, y, z); let cl = [1, 1, 1];
        const side = Math.abs(z) / hw, roof = x > P.roof[0] && x < P.roof[1] && y > top - 1.4;
        if (inGH && y > P.belt + .8 && !roof && y < (P.gTop || 999) && !(Math.abs(x - P.bx) < 2.2 && side > .5) && !(x > P.roof[1] - 1 && side > .86) && !(x < P.roof[0] + 1 && side > .86) && !(x - P.gh[0] < 2.5) && !(P.gh[1] - x < 2.5)) cl = glassC;
        else if (y < P.belt - 1 && y > bot + 2 && side > .9 && P.seams.some(sx => Math.abs(x - sx) < .55)) cl = seamC;
        else if (P.bed && x > P.bed[0] && x < P.bed[1] && y > top - .6 && side < .86) cl = bedC;
        col.push(...cl); } }
    for (let i = 0; i < S; i++) for (let j = 0; j < Mr; j++) { const a = i * Mr + j, b = i * Mr + (j + 1) % Mr, c = a + Mr, d = b + Mr; idx.push(a, c, b, b, c, d); }
    for (const [ring, flip] of [[0, 0], [S, 1]]) { const ci = pos.length / 3, base = ring * Mr; let cx = 0, cy = 0; for (let j = 0; j < Mr; j++) { cy += pos[(base + j) * 3 + 1]; } pos.push(pos[base * 3], cy / Mr, 0); col.push(1, 1, 1); for (let j = 0; j < Mr; j++) flip ? idx.push(ci, base + j, base + (j + 1) % Mr) : idx.push(ci, base + (j + 1) % Mr, base + j); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals(); return g.toNonIndexed(); }
  const CARP = {
    sedan: { top: [[-60, 14], [-59, 20], [-52, 22.6], [-36, 23.2], [-27, 34.5], [-18, 37.2], [4, 37.6], [11, 35.6], [24, 23.8], [40, 22.4], [55, 20.4], [60, 15.5]], bot: 6, W: 52, belt: 23.4, gh: [-35, 24], roof: [-19, 6], bx: -6, seams: [-6, 16], wx: [-37, 37], wr: 9.4 },
    hatch: { top: [[-55, 15], [-54.5, 22], [-52, 32], [-46, 36.6], [4, 37], [11, 35], [22, 23.6], [40, 22.2], [53, 20.2], [58, 15.2]], bot: 6, W: 52, belt: 23.2, gh: [-53, 22], roof: [-45, 5], bx: -10, seams: [-10, 14], wx: [-34, 36], wr: 10 },
    suv: { top: [[-60, 20], [-59.5, 30], [-58, 45.5], [-53, 48], [10, 48.2], [16, 46], [26, 31.5], [44, 30.2], [57, 28.6], [61, 21]], bot: 9, W: 54, belt: 31.4, gh: [-57.5, 26], roof: [-52, 11], bx: -14, seams: [-14, 8], wx: [-37, 38], wr: 12 },
    van: { top: [[-60, 20], [-60, 50], [-57, 54.6], [28, 55], [34, 52], [46, 31], [56, 28.8], [61, 21]], bot: 8, W: 54, belt: 37, gTop: 50, gh: [-56, 46], roof: [-56, 30], bx: 10, seams: [-2, 18], wx: [-38, 40], wr: 11 },
    pickup: { top: [[-60, 22], [-59, 26], [-15, 26.3], [-12, 27], [-9, 41.6], [13, 42], [16, 40], [26, 26.5], [44, 25.4], [57, 23.2], [61, 16]], bot: 8, W: 54, belt: 27, gh: [-11, 26], roof: [-8, 13], bx: 99, seams: [3], wx: [-38, 38], wr: 11, bed: [-58, -16] },
  };
  function makeCar(kind) { const C = CARP[kind], T_ = [], x0 = C.top[0][0], x1 = C.top[C.top.length - 1][0], hood = lerpK(C.top, x1 - 6), back = lerpK(C.top, x0 + 4), hw = C.W / 2;
    // бамперы, решётка, фары (горят), фонари, номера, зеркала, ручки, дворники, выхлоп, антенна
    T_.push([geo.lay, RX(x1 + .6, C.bot + 4, 0, 4, 3.2, C.W * .48), 0x9a9c9e], [geo.lay, RX(x0 - .6, C.bot + 4, 0, 4, 3.2, C.W * .47), 0x2a2a2a]);
    T_.push([geo.box, RX(x1 + 1.6, C.bot + 4.8, 0, .6, 3.6, 11), 0xe2ded2], [geo.box, RX(x0 - 1.6, C.bot + 4.8, 0, .6, 3.6, 11), 0xe2ded2]);
    T_.push([geo.box, RX(x1 - .2, (C.bot + hood) / 2 + 2, 0, 1.6, (hood - C.bot) * .3, C.W * .34), 0x111111]); for (let k = -2; k <= 2; k++) T_.push([geo.box, RX(x1 + .3, (C.bot + hood) / 2 + 2, k * 3.6, .5, (hood - C.bot) * .26, .7), 0x9a9c9e]);
    for (const z of [-1, 1]) { T_.push([geo.sph, RX(x1 - 1.4, hood - 3.4, z * hw * .66, 2, 2.6, 5.6), 0xfff4c8], [geo.box, RX(x0 + .4, back - 4, z * hw * .64, 2, 3.4, 9), 0xc01c1c], [geo.box, RX(x1 - 5, hood - 3, z * hw * .9, 3, 1.4, 3), 0xd89a2a]);
      T_.push([geo.sph, RX(C.gh[1] - 3, C.belt + 2.4, z * (hw + 1.6), 2.4, 2, 1.4), 0x1c1c1c], [geo.box, RX(C.gh[1] - 4, C.belt + 1.4, z * (hw - .4), 2, 1, 3), 0x1c1c1c]);
      for (const sx of C.seams) T_.push([geo.box, RX(sx - 5, C.belt - 3.2, z * (hw - 2.6), 4, 1, 1.2), 0x8a8a86]); }
    for (const z of [-7, 7]) T_.push([geo.box, RX(C.gh[1] + .5, C.belt + .8, z, 1, .6, 11, 0, .3, 0), 0x101010]);
    T_.push([geo.cyl6, RX(x0 - 1, C.bot + 1.5, hw * .5, 1.3, 5, 1.3, 0, 0, Math.PI / 2), 0x4a4a46], [geo.cyl6, RX(C.roof[0] + 2, lerpK(C.top, C.roof[0] + 2) + 5, -hw * .4, .25, 10, .25), 0x222222]);
    if (kind === 'suv') { for (const z of [-17, 17]) T_.push([geo.box, RX(-20, 49.4, z, 56, 1.4, 1.6), 0x2a2a2a]); T_.push([geo.cyl10, RX(x0 - 2.6, 22, 0, 9, 4, 9, 0, 0, Math.PI / 2), 0x1d1d1d]); }
    const PB = [[loftCar(C), new T.Matrix4(), 0xffffff]]; if (kind === 'pickup') { for (const z of [-1, 1]) PB.push([geo.box, RX(-37, 29.5, z * (hw - 1.6), 44, 6, 2.2), 0xffffff]); PB.push([geo.box, RX(-58.6, 29.5, 0, 2.2, 6, C.W - 3), 0xffffff]); } // борта кузова — в цвет машины
    return { paint: mergeG(PB), trim: glow(mergeG(T_)), wheels: C.wx.flatMap(x => [-1, 1].map(sd => [x, sd * (hw - 4.5), C.wr / 9.4])) }; }
  // грузовики и автобус (длина 170, ширина 62)
  function makeTruck(kind) { const P = [], T_ = []; let wheels;
    const S = (fn, depth, bev = 0) => extr(null, depth, bev, fn), B = (c, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => T_.push([geo.box, RX(x, y, z, sx, sy, sz, rx, ry, rz), c]);
    const C = (c, x, y, z, r, l, ax = 'y', seg = 10) => T_.push([seg > 6 ? geo.cyl10 : geo.cyl6, RX(x, y, z, r, l, r, ax === 'z' ? Math.PI / 2 : 0, 0, ax === 'x' ? Math.PI / 2 : 0), c]);
    const GL = 0x22303a, BK = 0x1c1c1c, CH = 0x9a9ea2, AM = new T.Color(2.2, 1.3, .3), HL = new T.Color(2.4, 2.3, 2), RL = new T.Color(1.8, .15, .1);
    const arch = (x, r, sd, c = BK) => T_.push([S(sh => { sh.moveTo(x - r - 3, 9); sh.absarc(x, 9, r + 3, Math.PI, 0, true); sh.lineTo(x + r + 3, 9); sh.lineTo(x + r + 1.5, 9); sh.absarc(x, 9, r + 1.5, 0, Math.PI, false); sh.closePath(); }, 14), RX(0, 0, sd * 24, 1, 1, 1), c]);
    // кабина над двигателем: скруглённые рёбра, наклонное лобовое, двери, подножки, зеркала на кронштейнах, решётка, фары, бампер, козырёк, маркерные огни
    const cab = (x0, x1, top) => {
      P.push([S(sh => { sh.moveTo(x0, 10); sh.lineTo(x1 - 1, 10); sh.quadraticCurveTo(x1 + .6, 10, x1 + .6, 13); sh.lineTo(x1 + .6, 32); sh.quadraticCurveTo(x1 + .6, 35, x1 - .4, 36.5); sh.lineTo(x1 - 3.2, top - 4.5);
        sh.quadraticCurveTo(x1 - 4, top, x1 - 8.5, top); sh.lineTo(x0 + 4, top); sh.quadraticCurveTo(x0, top, x0, top - 4); sh.closePath(); }, 56, 2.4), RX(0, 0, 0, 1, 1, 1)]);
      T_.push([S(sh => { sh.moveTo(x1 + .2, 37.5); sh.lineTo(x1 - 2.6, top - 5.5); sh.lineTo(x1 - 1.6, top - 5.5); sh.lineTo(x1 + 1.3, 37.5); sh.closePath(); }, 54), RX(0, 0, 0, 1, 1, 1), GL]);
      B(BK, x1 - 1.4, top - 5.3, 0, 1.4, 1.2, 56); B(0x2a2a2a, x1 - 1.6, top - 2.6, 0, 6, 1, 58, 0, 0, -.25); for (const z of [-18, -6, 6, 18]) B(AM, x1 - 4, top + 2.6, z, 1.6, 1, 2.6);
      for (const z of [-1, 1]) { const sz = z * 30.6; B(GL, (x0 + x1) / 2 + 6, top - 11, sz, (x1 - x0) * .42, 13, .5); B(BK, (x0 + x1) / 2 + 6, top - 11, sz * 1.003, (x1 - x0) * .44, .8, .3);
        B(BK, x0 + 13, 30, sz * 1.004, .6, top - 14, .3); B(BK, x1 - 4, 30, sz * 1.004, .6, top - 14, .3); B(CH, x0 + 17, 33, sz * 1.012, 5, 1.4, .8);
        B(BK, x0 + 20, 13, z * 31, 14, 1.6, 4); B(BK, x0 + 20, 6.5, z * 31, 12, 1.4, 4); // подножки
        B(BK, x1 + 2, top - 6, z * 31.5, 2, 1.2, 8); B(BK, x1 + 6, top - 9, z * 35, 1.2, 1.2, 1.2); B(0x2a2a2a, x1 + 5.4, top - 16, z * 36, 1.6, 15, 4.8); B(0x6a7680, x1 + 6.25, top - 16, z * 36, .2, 13.6, 4); // зеркала
        B(HL, x1 + 1.3, 16, z * 21, 1, 5.6, 8.6); B(0x2a2a2a, x1 + 1, 16, z * 21, .8, 6.8, 10); B(AM, x1 + 1.3, 16, z * 26.6, 1, 4.4, 2.6); B(HL, x1 + 3.2, 7, z * 17, 1, 2.6, 4.4); }
      B(0x2a2a2a, x1 + .9, 25.5, 0, 1, 10, 34); for (let i = 0; i < 6; i++) B(0x111111, x1 + 1.45, 21.5 + i * 1.6, 0, .4, .6, 33); B(CH, x1 + 1.5, 31.6, 0, .5, 1.2, 10);
      B(BK, x1 + 2.2, 7.6, 0, 4.4, 6.4, 62); B(0xe0dcd0, x1 + 4.45, 7.4, 0, .2, 3, 13); B(0x2a2a2a, x1 + 4.5, 7.4, 0, .1, 3.2, 13.4); for (const z of [-24, 24]) B(0xb03a2a, x1 + 4.6, 5, z, 1.4, 1.4, 2.4);
      B(0x111111, x0 - .6, top / 2 + 5, 0, 1, top - 12, 52); C(BK, x0 - 3, top - 8, 26, 1.2, 38); C(0x2a2a2a, x0 - 3, top + 11.5, 26, 1.6, 2); C(0x777777, x0 - 3, top + 12.8, 26, 1.5, .5); // выхлоп
      C(0x7a7c78, x0 + 18, 13.5, -26, 4.2, 22, 'x', 12); for (const x of [x0 + 11, x0 + 25]) B(BK, x, 13.5, -26, 1.2, 9, 9); B(0x2a2a2a, x0 + 18, 13.5, 26, 16, 8, 6);
    };
    const frame = (x0, x1) => { for (const z of [-11, 11]) B(0x222222, (x0 + x1) / 2, 10.5, z, x1 - x0, 5.5, 3); for (let x = x0 + 8; x < x1; x += 22) B(0x222222, x, 10.5, 0, 2.5, 4, 22); };
    const rear = (x, y0) => { B(0x2a2a2a, x - 1, 9, 0, 3, 3, 56); for (const z of [-24, 24]) { B(RL, x - 1.2, 14, z, 1, 3.4, 6); B(AM, x - 1.2, 14, z - Math.sign(z) * 4.4, 1, 3.4, 2.6); B(BK, x + 2, 5, z, .6, 8, 9); } B(0xe0dcd0, x - 1.3, 17.5, 0, .3, 3, 11); };
    if (kind === 'box') { cab(38, 85, 60); frame(-86, 40);
      const bx0 = -84, bx1 = 34, L = bx1 - bx0, mx = (bx0 + bx1) / 2;
      T_.push([geo.box, RX(mx, 45, 0, L, 64, 61), 0xe6e4de]); for (let x = bx0 + 2; x <= bx1 - 2; x += 11.8) for (const z of [-1, 1]) B(0xc8c6c0, x, 45, z * 30.8, 1.6, 63, .8);
      for (const y of [13.4, 76.6]) for (const z of [-1, 1]) B(0x9a9890, mx, y, z * 30.9, L + 1, 2, 1.2); B(0x9a9890, mx, 77.2, 0, L + 1, 1.2, 62);
      for (const z of [-1, 1]) { B(0xb03a2a, mx, 32, z * 31.2, L - 6, 6, .3); B(0x1e3a6a, mx + 18, 52, z * 31.2, 34, 9, .3); for (let x = bx0 + 8; x < bx1; x += 24) B(AM, x, 15.5, z * 31.4, 2.4, 1.6, .5); B(0x2a2a2a, mx, 8.5, z * 29, L - 40, 2, 1.4); }
      B(0xd8d6d0, bx0 - .6, 45, 0, 1.2, 62, 60); B(0x111111, bx0 - 1.3, 45, 0, .3, 62, .5); for (const z of [-15, 15]) for (const y of [24, 66]) B(0x777777, bx0 - 1.6, y, z * 1.85, .8, 3, 3);
      for (const z of [-9, 9]) { C(0x8a8a8a, bx0 - 2, 45, z, .45, 60); for (const y of [30, 60]) B(0x555555, bx0 - 2, y, z, 1.2, 2.4, 2.4); }
      B(0x2a2a2a, bx0 - 1, 4.5, 0, 2, 2, 54); for (const z of [-22, 22]) B(0x2a2a2a, bx0 + 1, 7, z, 2, 6, 2); rear(bx0, 0);
      B(0x9a9890, 34, 70, 0, 8, 14, 58, 0, 0, .7); wheels = [64, -40, -60]; arch(64, 9.5, -1); arch(64, 9.5, 1);
    } else if (kind === 'army') { cab(42, 86, 57); frame(-86, 44); const OL = 0x4a5233, OL2 = 0x5a5e3e, OD = 0x3a4128;
      B(OD, -22, 17.5, 0, 126, 3, 62); for (const z of [-1, 1]) for (let i = 0; i < 3; i++) B(i % 2 ? OL : 0x556040, -22, 21 + i * 4.2, z * 30.6, 124, 3.6, 1.6);
      for (let x = -82; x <= 38; x += 20) for (const z of [-1, 1]) B(OD, x, 25, z * 31, 2.4, 13, 2.2);
      const bow = S(sh => { sh.moveTo(-1, 0); sh.absarc(0, 0, 1, Math.PI, 0, true); sh.lineTo(.94, 0); sh.absarc(0, 0, .94, 0, Math.PI, false); sh.closePath(); }, 1); bow.rotateY(Math.PI / 2);
      const tent = S(sh => { sh.moveTo(-1, 0); sh.absarc(0, 0, 1, Math.PI, 0, true); sh.closePath(); }, 1); tent.rotateY(Math.PI / 2);
      T_.push([tent, RX(-22, 31, 0, 122, 28, 31.5), OL2]); for (let x = -78; x <= 34; x += 18.5) T_.push([bow, RX(x, 31, 0, 2.2, 28.6, 32.2), 0x4e5236]);
      for (let x = -82; x <= 38; x += 7) for (const z of [-1, 1]) B(0x8a7a58, x, 30.6, z * 31.9, .5, 3.6, .5); for (const z of [-1, 1]) B(0x50543a, -22, 30, z * 31.7, 124, 1.6, .6);
      B(0x2a2a20, -83.6, 44, 0, .6, 22, 56); B(OL, -84, 24, 0, 2.4, 10, 62); for (const z of [-20, 20]) { C(0x666666, -85.6, 22, z, .3, 8); }
      for (const z of [-26, -18]) { B(OL, 40, 26, z, 3, 11, 7); B(OD, 40, 32, z, 3.4, 1.4, 4); } C(0x1a1a1a, 40, 32, 10, 9, 5, 'x', 12); C(0x444444, 40, 32, 10, 4, 5.4, 'x', 10);
      rear(-86, 0); wheels = [64, -40, -60]; arch(64, 9.5, -1); arch(64, 9.5, 1);
      for (const z of [-1, 1]) for (const x of [-40, -60]) T_.push([S(sh => { sh.moveTo(x - 13, 17); sh.absarc(x, 17, 13, Math.PI, 0, true); sh.lineTo(x + 12, 17); sh.absarc(x, 17, 12, 0, Math.PI, false); sh.closePath(); }, 10), RX(0, 0, z * 26, 1, 1, 1), OD]);
    } else { // автобус: скруглённое тело, лобовое из двух стёкол с перегородкой, табло маршрута, складная дверь, окна со стойками, люки, арки колёс, бамперы
      P.push([S(sh => { sh.moveTo(-86, 9); sh.lineTo(84, 9); sh.quadraticCurveTo(87.5, 9, 87.5, 13); sh.lineTo(87.5, 54); sh.quadraticCurveTo(87, 64, 78, 64.5); sh.lineTo(-78, 64.5); sh.quadraticCurveTo(-86, 64, -86, 56); sh.closePath(); }, 58, 2.2), RX(0, 0, 0, 1, 1, 1)]);
      for (const z of [-1, 1]) { const sz = z * 31.3; B(GL, -8, 45.5, sz, 148, 15, .6); for (let k = 0; k < 9; k++) B(BK, -76 + k * 17.6, 45.5, sz * 1.002, 1.8, 16, .4); B(BK, -8, 37.4, sz * 1.002, 150, 1.2, .4); B(BK, -8, 53.6, sz * 1.002, 150, 1.2, .4);
        B(0xb03a2a, -6, 31, sz * 1.003, 170, 3, .3); B(0x2a2a2a, -6, 12.5, sz * 1.003, 170, 6, .3); B(0x9a9890, -6, 61, sz * 1.002, 166, 1, .6);
        for (const x of [55, -55]) T_.push([S(sh => { sh.moveTo(x - 14, 9); sh.absarc(x, 9, 14, Math.PI, 0, true); sh.lineTo(x + 12.2, 9); sh.absarc(x, 9, 12.2, 0, Math.PI, false); sh.closePath(); }, 1.5), RX(0, 0, sz, 1, 1, 1), BK]); }
      for (const [x, w] of [[64, 14], [-12, 14]]) { B(0x1e262c, x, 33, 31.4, w + 2, 44, .5); B(GL, x - w / 4, 37, 31.55, w / 2 - 1.2, 34, .3); B(GL, x + w / 4, 37, 31.55, w / 2 - 1.2, 34, .3); B(CH, x, 33, 31.6, .5, 42, .3); }
      B(GL, 87.9, 40, 12.6, .6, 26, 23); B(GL, 87.9, 40, -12.6, .6, 26, 23); B(BK, 88.1, 40, 0, .8, 27, 1.6); B(BK, 88.1, 52.6, 0, .8, 1.4, 52); B(BK, 88.1, 27.6, 0, .8, 1.4, 52);
      B(0x111111, 88.2, 57.6, 0, .6, 5.6, 34); B(new T.Color(2.4, 1.6, .3), 88.4, 57.6, 0, .3, 3.6, 24);
      for (const z of [-1, 1]) { B(0x2a2a2a, 88.4, 31, z * 9, .2, 9, .6, 0, 0, .1 * z); B(BK, 90, 48, z * 31, 4, 1, 1); B(BK, 92, 44, z * 33, 1, 10, 1); B(0x2a2a2a, 92.4, 38, z * 33.4, 1.4, 9, 4); B(0x6a7680, 93.15, 38, z * 33.4, .2, 8.4, 3.4);
        B(HL, 88.6, 19, z * 21, .8, 5, 9); B(AM, 88.6, 19, z * 27, .8, 5, 2.6); B(RL, -86.7, 22, z * 24, .8, 6, 6); B(AM, -86.7, 29, z * 24, .8, 3, 6); }
      B(0x2a2a2a, 88.4, 22.5, 0, .6, 7, 18); for (let i = 0; i < 4; i++) B(0x111111, 88.8, 20 + i * 1.7, 0, .3, .6, 17); B(BK, 89.4, 11, 0, 3.6, 6, 60); B(0xe0dcd0, 91.25, 11, 0, .2, 3, 12);
      B(GL, -86.9, 44, 0, .6, 15, 46); B(BK, -86.6, 11.5, 0, 3.4, 6, 60); B(0xe0dcd0, -88.4, 11.5, 0, .2, 3, 12); C(0x2a2a2a, -80, 6, -24, 1.2, 8, 'x');
      for (const x of [30, -30]) { B(0x8a8a86, x, 66.2, 0, 20, 3, 18); B(0x6a6a66, x, 67.8, 0, 18, .6, 16); }
      wheels = [55, -55]; }
    return { paint: mergeG(P.map(([g, m]) => [g, m, 0xffffff])), trim: glow(mergeG(T_)), wheels: wheels.flatMap(x => [-1, 1].map(sd => [x, sd * 25, 1.35])) }; }
  // деревья: ствол с корнями и ветками (одна геометрия на вариант), крона из неровных «облаков» листвы
  const hash3 = (x, y, z, s) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.17) * 43758.5453; return v - Math.floor(v); };
  const limbGeo = new T.LatheGeometry([[1, 0], [.94, .3], [.78, .7], [.6, 1]].map(([x, y]) => new T.Vector2(x, y)), 7);
  const trunkGeo = new T.LatheGeometry([[1.7, 0], [1.15, .05], [.95, .16], [.85, .5], [.72, .85], [.62, 1]].map(([x, y]) => new T.Vector2(x, y)), 8);
  const limb = (from, to, r0, r1) => { const d = new T.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]), l = d.length(), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    const g = new T.LatheGeometry([[r0, 0], [(r0 + r1) / 2, .5], [r1, 1]].map(([x, y]) => new T.Vector2(x, y)), 6); return [g, new T.Matrix4().compose(new T.Vector3(...from), q, new T.Vector3(1, l, 1))]; };
  // ствол: изогнутый из нескольких сегментов, с наклоном, расширением у земли, корнями по земле, сучками и ветками, уходящими в крону; мох у основания (цвет вершин)
  function makeWood(seed, H, R, opt = {}) { const r = mkRng(seed), L = [], lean = opt.lean ?? .08, seg = 4, pts = [[0, 0, 0]], la = r() * 6.28;
    for (let i = 1; i <= seg; i++) { const t = i / seg, p = pts[i - 1], bend = Math.sin(t * Math.PI) * (r() - .5) * R * 1.2; pts.push([p[0] + Math.cos(la) * lean * H / seg + bend * .4, H * t, p[2] + Math.sin(la) * lean * H / seg + bend * .4]); }
    for (let i = 0; i < seg; i++) { const t0 = i / seg, t1 = (i + 1) / seg, r0 = R * (1 - t0 * .45) * (i === 0 ? 1.15 : 1), r1 = R * (1 - t1 * .45); L.push(limb(pts[i], pts[i + 1], r0, r1)); }
    L.push([trunkGeo, RX(0, 0, 0, R * .95, H * .16, R * .95)]); // расширение у земли
    const roots = opt.roots ?? 5; for (let i = 0; i < roots; i++) { const a = i / roots * 6.28 + r() * .6, l = R * (2.6 + r() * 1.8); L.push(limb([Math.cos(a) * R * .5, 3.2, Math.sin(a) * R * .5], [Math.cos(a) * l, .2, Math.sin(a) * l], R * .42, R * .1)); }
    const top = pts[seg], nb = opt.branches ?? 4;
    for (let i = 0; i < nb; i++) { const a = i / nb * 6.28 + r() * .8, h0 = H * (.62 + r() * .3), len = (opt.blen ?? 9) * (.8 + r() * .5), base = [top[0] * h0 / H, h0, top[2] * h0 / H], tip = [base[0] + Math.cos(a) * len, h0 + len * (opt.bup ?? 1.1), base[2] + Math.sin(a) * len];
      L.push(limb(base, tip, R * .45, R * .22)); L.push(limb(tip, [tip[0] + Math.cos(a) * len * .4, tip[1] + len * .7, tip[2] + Math.sin(a) * len * .4], R * .22, R * .08)); }
    L.push(limb(top, [top[0], top[1] + H * .25, top[2]], R * .55, R * .15));
    const g = mergeG(L.map(([g, m]) => [g, m, 0xffffff])), P = g.attributes.position, C = g.attributes.color;
    if (!opt.birch) for (let i = 0; i < P.count; i++) { const y = P.getY(i), mz = Math.max(0, 1 - y / (R * 2.4)) * (P.getZ(i) > 0 ? .7 : .25); C.setXYZ(i, 1 - mz * .45, 1 - mz * .15, 1 - mz * .6); } // мох у основания с одной стороны
    g.userData.bark = 1; if (opt.birch) g.userData.birch = 1; return g; }
  geo.treeWood = [0, 1, 2].map(v => makeWood(71 + v * 13, 40, 3.6));
  geo.deadWood = [0, 1, 2].map(v => { const r = mkRng(301 + v * 29), L = [[trunkGeo, RX(0, 0, 0, 3, 44, 3, 0, r() * 6)]], top = [(r() - .5) * 4, 44, (r() - .5) * 4];
    L.push(limb([0, 40, 0], top, 1.8, .9));
    const grow = (p, dir, len, r0, depth) => { const e = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len]; L.push(limb(p, e, r0, r0 * .55)); if (depth <= 0) return;
      for (let k = 0; k < 2; k++) { const a = r() * 6.28, d = new T.Vector3(dir[0] + Math.cos(a) * .7, dir[1] * .8 + .25, dir[2] + Math.sin(a) * .7).normalize(); grow(e, [d.x, d.y, d.z], len * (.55 + r() * .2), r0 * .55, depth - 1); } };
    for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + r(), d = new T.Vector3(Math.cos(a) * .8, .6 + r() * .5, Math.sin(a) * .8).normalize(); grow([0, 20 + i * 6 + r() * 4, 0], [d.x, d.y, d.z], 13 + r() * 6, 1.4, 2); }
    grow(top, [0, 1, 0], 8, .9, 1);
    const g = mergeG(L.map(([g, m]) => [g, m, 0xffffff])); g.userData.bark = 1; return g; });
  geo.clump = [0, 1, 2].map(v => { const g = new T.IcosahedronGeometry(1, 1), P = g.attributes.position, cols = [];
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = .78 + .4 * hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100), v); P.setXYZ(i, x * k, y * k * .86, z * k);
      const t = .56 + (y + 1) * .24 + (hash3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), v + 9) - .5) * .14; cols.push(t, t * 1.02, t * .9); }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    // мягкие нормали: смесь «шара» и граней — крона читается объёмной массой листвы, а не гранёным камнем
    const N = g.attributes.normal; for (let i = 0; i < N.count; i++) { const n = new T.Vector3(P.getX(i), P.getY(i) * 1.2, P.getZ(i)).normalize().multiplyScalar(.7).add(new T.Vector3(N.getX(i), N.getY(i), N.getZ(i)).multiplyScalar(.3)).normalize(); N.setXYZ(i, n.x, n.y, n.z); }
    return g; });
  // крона: раскладка облаков на вариант (центр, размер, оттенок)
  // варианты: 0 — круглая крона, 1 — высокая узкая, 2 — широкая раскидистая; низ кроны тёмный, верх — светлый
  const CROWN = [[13, 16, 60, 1], [10, 24, 70, .9], [18, 11, 54, 1.15]].map(([R, Y, top, s], v) => { const r = mkRng(911 + v * 7), out = [[0, 44, 0, 21 * s, 'leaf2']];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + r() * .5, rr = R + r() * 5, y = 38 + r() * Y; out.push([Math.cos(a) * rr, y, Math.sin(a) * rr, (10.5 + r() * 4.5) * s, y < 50 ? 'leaf2' : 'leaf']); }
    out.push([(r() - .5) * 6, top - 2 + r() * 3, (r() - .5) * 6, 11.5 * s, 'leaf']); return out; });
  // листовые карточки: плоскости с рисунком листьев (вырез по альфе) по поверхности кроны — даёт «лиственный» край вместо гладких комков
  const leafCardTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = mkRng(77);
    for (let i = 0; i < 190; i++) { const x = 24 + r() * 208, y = 24 + r() * 208, d = Math.hypot(x - 128, y - 128); if (d > 112 - r() * 14) continue; const a = r() * 6.28, l = 11 + r() * 10, sh = .5 + r() * .5, yel = r() < .12 ? 1.18 : 1;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = `rgb(${Math.min(255, 188 * sh * yel) | 0},${215 * sh | 0},${140 * sh | 0})`;
      g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(-l * .2, -l * .5, l, 0); g.quadraticCurveTo(-l * .2, l * .5, -l, 0); g.fill(); // лист с острым кончиком
      g.strokeStyle = `rgba(50,60,30,.45)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l * .9, 0); g.stroke(); g.restore(); }
    const t = new T.CanvasTexture(c); t.anisotropy = 2; return t; })();
  // карточки с листьями по поверхности эллипсоида (центр cy, радиусы rxz/ry); нормали — от центра кроны (мягкий объёмный свет: солнечная сторона светлее),
  // цвет вершин — «затенение» внутри и снизу кроны
  function leafShell(seed, cy, ry, rxz, n, s0, s1) { const r = mkRng(seed), L = [], quad = new T.PlaneGeometry(1, 1);
    for (let i = 0; i < n; i++) { const a = r() * 6.28, el = -.35 + Math.acos(1 - r() * 1.6) / Math.PI * 1.9, d = new T.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), sz = s0 + r() * s1;
      const pos = new T.Vector3(d.x * rxz * .92, cy + d.y * ry * .95, d.z * rxz * .92), nn = new T.Vector3(d.x, d.y + .9, d.z).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), nn).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), r() * 6.28));
      L.push([quad, new T.Matrix4().compose(pos, q, new T.Vector3(sz, sz, 1)), 0xffffff]); }
    const g = mergeG(L), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nv = new T.Vector3(x / rxz, (y - cy) / ry + .25, z / rxz).normalize(); N.setXYZ(i, nv.x, nv.y, nv.z);
      const h = Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))), out = Math.min(1, Math.hypot(x / rxz, (y - cy) / ry)), ao = .5 + .32 * h + .28 * out; C.setXYZ(i, ao, ao, ao * .97); }
    g.userData.cards = 1; return g; }
  geo.leafCards = [[13, 16, 60], [10, 24, 70], [18, 11, 54]].map((cr, v) => leafShell(1201 + v * 17, (32 + cr[2]) / 2, (cr[2] - 32) / 2 + 4, cr[0] + 7, 52, 14, 8));
  geo.bushCards = [0, 1, 2].map(v => leafShell(1601 + v * 11, 9, 8, 15, 20, 9, 5));
  // сплошная крона (без висящих плоскостей): ядро + много мелких «шапок» листвы, слитых в одну геометрию;
  // нормали смешаны с направлением от центра кроны — мягкий объёмный свет; низ и середина темнее (цвет вершин)
  function solidCrown(seed, cy, ry, rxz, lobes, lr, fringe) { const r = mkRng(seed), L = [], src = new T.IcosahedronGeometry(1, 1), src0 = new T.IcosahedronGeometry(1, 0);
    const lobe = (cx, y, cz, rad, v, small) => { const g = (small ? src0 : src).clone(), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), yy = P.getY(i), z = P.getZ(i), k = .82 + .3 * hash3(Math.round(x * 90), Math.round(yy * 90), Math.round(z * 90), v); P.setXYZ(i, x * k, yy * k * .85, z * k); }
      return [g, RX(cx, y, cz, rad, rad, rad, 0, r() * 6.28)]; };
    L.push(lobe(0, cy, 0, Math.min(rxz, ry) * .9, seed));
    for (let i = 0; i < lobes; i++) { const a = r() * 6.28, el = -.25 + Math.acos(1 - r() * 1.7) / Math.PI * 1.85, d = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], rad = lr * (.75 + r() * .5);
      L.push(lobe(d[0] * (rxz - rad * .55), cy + d[1] * (ry - rad * .5), d[2] * (rxz - rad * .55), rad, seed + i, i >= 10)); }
    const g = mergeG(L.map(([g, m]) => [g, m, 0xffffff])), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), rv = new T.Vector3(x / rxz, (y - cy) / ry + .2, z / rxz).normalize(), n = new T.Vector3(N.getX(i), N.getY(i), N.getZ(i)).multiplyScalar(.4).add(rv.multiplyScalar(.6)).normalize(); N.setXYZ(i, n.x, n.y, n.z);
      const h = Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))), out = Math.min(1, Math.hypot(x / rxz, (y - cy) / ry)), ao = .42 + .3 * h + .3 * out * out; C.setXYZ(i, ao, ao * 1.01, ao * .95); }
    g.userData.foliage = 1; return g; }
  // мелкая бахрома из листьев прямо на поверхности кроны: рваный край вместо гладкого шара (под ней — непрозрачная листва, просветов на землю нет)
  function fringe(seed, cy, ry, rxz, n, s0) { const r = mkRng(seed), L = [], quad = new T.PlaneGeometry(1, 1);
    for (let i = 0; i < n; i++) { const a = r() * 6.28, el = -.3 + Math.acos(1 - r() * 1.7) / Math.PI * 1.85, d = new T.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), sz = s0 * (.75 + r() * .5);
      const pos = new T.Vector3(d.x * (rxz + 1.5), cy + d.y * (ry + 1.5), d.z * (rxz + 1.5)), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(d.x, d.y + .6, d.z).normalize()).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), r() * 6.28));
      L.push([quad, new T.Matrix4().compose(pos, q, new T.Vector3(sz, sz, 1)), 0xffffff]); }
    const g = mergeG(L), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nv = new T.Vector3(x / rxz, (y - cy) / ry + .2, z / rxz).normalize(); N.setXYZ(i, nv.x, nv.y, nv.z); const h = Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))), ao = .6 + .4 * h; C.setXYZ(i, ao, ao, ao * .96); }
    g.userData.cards = 1; return g; }
  const CROWNP = [[13, 16, 60], [10, 24, 70], [18, 11, 54]].map(cr => [(34 + cr[2]) / 2 + 2, (cr[2] - 34) / 2 + 6, cr[0] + 8]);
  geo.crownSolid = CROWNP.map(([cy, ry, rxz], v) => solidCrown(501 + v * 7, cy, ry, rxz, 34, 5));
  geo.crownFringe = CROWNP.map(([cy, ry, rxz], v) => fringe(551 + v * 7, cy, ry, rxz, 46, 9));
  geo.bushSolid = [0, 1, 2].map(v => solidCrown(701 + v * 5, 9, 8, 15, 14, 4));
  // породы деревьев (как в Европе): [ствол, крона, бахрома, цвет коры, оттенок листвы]
  const sp = (wood, cy, ry, rxz, lobes, lr, seed, bark) => ({ wood, crown: solidCrown(seed, cy, ry, rxz, lobes, lr), fringe: fringe(seed + 50, cy, ry, rxz, Math.round(lobes * 1.35), lr * 1.7), bark });
  const SPECIES = {
    linden: [0, 1, 2].map(v => ({ wood: geo.treeWood[v], crown: geo.crownSolid[v], fringe: geo.crownFringe[v], bark: 0x7a6650 })),
    oak: [0, 1].map(v => sp(makeWood(901 + v * 9, 34, 5.2, { blen: 14, bup: .6, branches: 5, lean: .05, roots: 7 }), 50, 15, 30, 44, 6, 911 + v, 0x5a4a3c)), // дуб: толстый, раскидистый
    birch: [0, 1].map(v => sp(makeWood(1001 + v * 9, 50, 2.4, { blen: 8, bup: 1.4, branches: 4, lean: .12, roots: 3, birch: 1 }), 56, 19, 17, 30, 4.4, 1011 + v, 0xffffff)), // берёза: тонкая, белая
    poplar: [0, 1].map(v => sp(makeWood(1101 + v * 9, 50, 3, { blen: 5, bup: 2.2, branches: 4, lean: .03 }), 62, 28, 11, 34, 4.6, 1111 + v, 0x6e6a5e)), // тополь: высокий, узкий
  };
  const speciesOf = id => { const r = rh(id, 50); return r < .22 ? 'birch' : r < .42 ? 'oak' : r < .56 ? 'poplar' : 'linden'; };
  const BIRCHLEAF = [0xa8b064, 0x9eaa5c, 0xb8b25a];
  geo.bushFringe = [0, 1, 2].map(v => fringe(751 + v * 5, 9, 8, 15, 18, 7));
  // у каждого дерева свой оттенок: в основном зелёные, часть желтеет, редкие — рыжие (конец лета)
  const LEAFC = [0x8c9c5c, 0x80965a, 0x98a462, 0x7e8e50, 0x8a9a56, 0xb0a24e, 0xa89846, 0xb8763c];
  const leafOf = id => { const r = rh(id, 41); return LEAFC[r < .72 ? Math.floor(rh(id, 42) * 5) : r < .92 ? 5 + Math.floor(rh(id, 43) * 2) : 7]; };
  // ===== мебель по назначению: модель в своих осях — W вдоль стены, D в глубину, спинка у -z, лицом к +z =====
  const WD = 0x6b4a2e, WDD = 0x4a3220, WHT = 0xd8d4c8, MET = 0x7a7e80, DRK = 0x26282a, BK = [0x8a2a24, 0x2a4a6a, 0x5a6a3a, 0xb8a060, 0x4a3a5a, 0xa86a3a];
  const legs4 = (W, D, h, c, inset = .42) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => [geo.box, c, M(x * W * inset, h / 2, z * D * inset, 2, h, 2)]);
  const FURN = {
    bed: (W, D, o) => [[geo.box, WDD, M(0, 5, 0, W, 10, D)], [geo.box, WD, M(0, 14, -D / 2 + 2, W, 20, 3)], [geo.box, 0xe0dace, M(0, 12, 1, W * .92, 4, D * .9)], [geo.box, [0x6b7a5a, 0x7a5a5a, 0x5a6a7a][o.id % 3], M(0, 14.5, D * .14, W * .94, 2.4, D * .6, rh(o.id, 3) * .2 - .1)], [geo.box, 0xf0ece2, M(-W * .22, 15.5, -D * .36, W * .36, 3.5, D * .14)], [geo.box, 0xf0ece2, M(W * .22, 15.5, -D * .36, W * .36, 3.5, D * .14)]],
    bedL: (W, D, o) => [[geo.box, WDD, M(0, 5, 0, W, 10, D)], [geo.box, WD, M(-W / 2 + 2, 14, 0, 3, 20, D)], [geo.box, 0xe0dace, M(1, 12, 0, W * .9, 4, D * .92)], [geo.box, [0x6b7a5a, 0x7a5a5a, 0x5a6a7a][o.id % 3], M(W * .14, 14.5, 0, W * .6, 2.4, D * .96)], [geo.box, 0xf0ece2, M(-W * .36, 15.5, 0, W * .14, 3.5, D * .7)]],
    tv: (W, D) => [[geo.box, WDD, M(0, 6, 0, W, 12, D)], [geo.box, 0x3a2a1c, M(0, 6, D / 2, W * .9, 8, .4)], [geo.box, DRK, M(0, 13.5, -D * .1, 8, 3, 6)], [geo.box, 0x111214, M(0, 24, -D * .1, W * .8, 19, 2)], [geo.box, 0x1c2a30, M(0, 24, -D * .1 + 1.1, W * .74, 15, .3)]],
    bookcase: (W, D, o) => { const r = [[geo.box, WD, M(0, 26, -D / 2 + 1, W, 52, 2)], [geo.box, WD, M(-W / 2 + 1, 26, 0, 2, 52, D)], [geo.box, WD, M(W / 2 - 1, 26, 0, 2, 52, D)], [geo.box, WD, M(0, 51, 0, W, 2, D)]];
      for (let i = 0; i < 4; i++) { const y = 2 + i * 12.5; r.push([geo.box, WDD, M(0, y, 0, W - 2, 1.6, D)]); let x = -W / 2 + 3; while (x < W / 2 - 4) { const bw = 2 + rh(o.id + i * 13 + x, 7) * 2.5, bh = 7 + rh(o.id + x, 8) * 3.5; if (rh(o.id * 3 + i + x, 9) > .2) r.push([geo.box, BK[Math.floor(rh(o.id + x * 7, i) * 6)], M(x + bw / 2, y + .8 + bh / 2, 0, bw, bh, D * .8)]); x += bw + .4; } }
      return r; },
    armchair: (W, D) => [[geo.box, 0x4a5a6a, M(0, 6, 1, W, 10, D - 2)], [geo.box, 0x3e4c5a, M(0, 14, -D / 2 + 3, W, 18, 6)], [geo.box, 0x3e4c5a, M(-W / 2 + 2.5, 11, 1, 5, 10, D - 2)], [geo.box, 0x3e4c5a, M(W / 2 - 2.5, 11, 1, 5, 10, D - 2)], [geo.box, 0x56687a, M(0, 11.5, 3, W - 10, 3, D - 10)]],
    ctable: (W, D, o) => [[geo.box, WD, M(0, 8, 0, W, 2, D)], ...legs4(W, D, 7, WDD), [geo.box, 0xe8e4da, M(-W * .2, 9.3, 0, 8, .4, 10, .3)], [geo.cyl10, 0xd8d4c8, M(W * .25, 10.5, D * .1, 2.2, 3, 2.2)]],
    counter: (W, D) => { const r = [[geo.box, 0xc8c0b0, M(0, 12, 0, W, 24, D)], [geo.box, 0x4a4844, M(0, 24.8, 0, W + 1, 1.6, D + 1)], [geo.box, 0x2a2826, M(0, .8, D / 2 - 1, W, 1.6, 1)]];
      for (let x = -W / 2 + 7; x < W / 2 - 4; x += 14) { r.push([geo.box, 0xb0a898, M(x + 7, 12, D / 2 + .2, .5, 20, .3)]); r.push([geo.box, MET, M(x + 3, 20, D / 2 + .5, 4, .8, .8)]); }
      r.push([geo.box, 0x8a9294, M(-W * .2, 25, 1, 14, .6, 10)], [geo.box, 0x5a6264, M(-W * .2, 24.8, 1, 11, .6, 7)], [geo.cyl10, MET, M(-W * .2, 28, -D / 2 + 4, .7, 7, .7)]); // мойка и кран
      r.push([geo.box, 0xc8c0b0, M(0, 46, -D / 2 + 5, W, 16, 10)], [geo.box, 0x9a9080, M(0, 38, -D / 2 + 10.1, W, .4, .4)]); // навесные шкафы
      return r; },
    stove: (W, D) => [[geo.box, 0xe2ded6, M(0, 12, 0, W, 24, D)], [geo.box, 0x2a2a2a, M(0, 24.6, 0, W - 1, 1, D - 1)], ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [geo.cyl10, 0x111111, M(x * W * .22, 25.4, z * D * .22, 3.4, .8, 3.4)]), [geo.box, 0x1a1a1a, M(0, 10, D / 2 + .2, W * .8, 11, .4)], [geo.box, MET, M(0, 17, D / 2 + .8, W * .7, .8, .8)], [geo.box, 0xd8d4cc, M(0, 28, -D / 2 + 1.5, W, 8, 3)]],
    fridge: (W, D, o) => [[geo.box, 0xe8e6e0, M(0, 28, 0, W, 56, D)], [geo.box, 0xb8b6b0, M(0, 38, D / 2 + .1, W - 1, .4, .4)], [geo.box, MET, M(W * .36, 46, D / 2 + .8, 1, 8, 1)], [geo.box, MET, M(W * .36, 26, D / 2 + .8, 1, 10, 1)], [geo.box, 0xd8a838, M(-W * .15, 44, D / 2 + .2, 3, 3, .3)], [geo.box, 0x4a9ad8, M(W * .05, 50, D / 2 + .2, 2.5, 2.5, .3)], [geo.box, 0xe8e4da, M(-W * .1, 32, D / 2 + .2, 5, 6, .2)]],
    chair: (W, D, o) => { const tip = rh(o.id, 12) < .35, P = [[geo.box, WD, M(0, 11, 0, W * .9, 1.6, D * .9)], ...legs4(W, D, 11, WDD), [geo.box, WD, M(0, 18, -D * .42, W * .9, 12, 1.4)]];
      return tip ? P.map(([g, c, m]) => [g, c, new T.Matrix4().makeTranslation(0, 0, -D * .45).multiply(new T.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new T.Matrix4().makeTranslation(0, 0, D * .45)).multiply(m)]) : P; }, // часть стульев опрокинута
    wardrobe: (W, D, o) => [[geo.box, 0x5e4228, M(0, 29, 0, W, 58, D)], [geo.box, 0x4a3420, M(0, 58.5, 0, W + 2, 1.6, D + 1)], [geo.box, 0x3a2818, M(0, 29, D / 2 + .1, .6, 54, .4)], [geo.box, 0xc8b070, M(-2.5, 32, D / 2 + .7, .8, 5, .8)], [geo.box, 0xc8b070, M(2.5, 32, D / 2 + .7, .8, 5, .8)], ...(rh(o.id, 13) < .4 ? [[geo.box, 0x5e4228, M(W * .45, 29, D / 2 + W * .22, 1, 52, W * .44, 0, 0)], [geo.box, 0x8a6a8a, M(-W * .1, 12, D * .2, 10, 4, 8, .5)]] : [])], // иногда дверца распахнута, вещи на полу
    dresser: (W, D) => [[geo.box, WD, M(0, 11, 0, W, 22, D)], ...[5, 11, 17].map(y => [geo.box, WDD, M(0, y, D / 2 + .1, W - 3, .5, .4)]), ...[5, 11, 17].map(y => [geo.box, 0xc8b070, M(0, y + 2.5, D / 2 + .6, 5, .8, .8)]), [geo.box, 0xa8b8c0, M(0, 32, -D / 2 + 1, W * .6, 18, .6)], [geo.box, WDD, M(0, 32, -D / 2 + .6, W * .64, 19.5, .4)]],
    bath: (W, D) => [[geo.box, 0xe8e6e2, M(0, 8, 0, W, 16, D)], [geo.box, 0x8a8a7e, M(0, 15.6, 0, W - 5, 1, D - 5)], [geo.box, 0x5a6a5a, M(W * .1, 15.8, 0, W * .5, .6, D * .5)], [geo.cyl10, MET, M(W / 2 - 4, 24, -D / 2 + 2, .7, 14, .7)], [geo.box, 0xd8e0e4, M(0, 40, -D / 2 + .5, W, 50, .4)]],
    toilet: (W, D) => [[geo.cyl10, 0xeeece8, M(0, 6, D * .1, W * .4, 12, D * .38)], [geo.cyl10, 0xd8d6d2, M(0, 12.4, D * .1, W * .42, 1, D * .4)], [geo.box, 0xeeece8, M(0, 16, -D / 2 + 3, W, 14, 6)], [geo.box, 0xd8d6d2, M(0, 23.4, -D / 2 + 3, W + 1, 1, 7)]],
    sink: (W, D) => [[geo.cyl10, 0xeeece8, M(0, 11, -D * .1, 2.4, 22, 2.4)], [geo.box, 0xeeece8, M(0, 22, 0, W, 4, D)], [geo.box, 0x8a9294, M(0, 23.8, 1, W - 5, .6, D - 6)], [geo.cyl10, MET, M(0, 27, -D / 2 + 2, .6, 6, .6)], [geo.box, 0xa8b8c0, M(0, 40, -D / 2 + .5, W * .8, 16, .5)], [geo.box, MET, M(0, 40, -D / 2 + .2, W * .84, 17, .3)]],
    filing: (W, D, o) => { const op = Math.floor(rh(o.id, 14) * 4); return [[geo.box, 0x7a8084, M(0, 18, 0, W, 36, D)], ...[0, 1, 2].flatMap(i => { const y = 6 + i * 11.5, ex = i === op ? 9 : 0; return [[geo.box, 0x8a9094, M(0, y, D / 2 + ex / 2, W - 2, 10, ex + .6)], [geo.box, 0x3a3c3e, M(0, y + 2, D / 2 + ex + .6, 6, 1, .8)], ...(ex ? [[geo.box, 0xe8e4da, M(0, y + 4, D / 2 + ex / 2, W - 5, 2, ex)]] : [])]; })]; },
    locker: (W, D) => [[geo.box, 0x55603a, M(0, 27, 0, W, 54, D)], [geo.box, 0x3e4628, M(0, 27, D / 2 + .1, .5, 50, .4)], ...[-1, 1].flatMap(s => [[geo.box, 0x2e3420, M(s * W * .25, 46, D / 2 + .2, W * .3, 4, .3)], [geo.box, MET, M(s * 2.5, 30, D / 2 + .6, .8, 5, .8)]])],
    gunrack: (W, D) => [[geo.box, WD, M(0, 3, 0, W, 6, D)], [geo.box, WD, M(0, 38, -D / 2 + 1, W, 4, 2)], [geo.box, WDD, M(0, 22, -D / 2 + .5, W, 40, 1)], ...[-1, 0, 1].flatMap(i => [[geo.box, 0x2a2a28, M(i * W * .3, 21, -D / 2 + 3, 2.2, 34, 2)], [geo.box, 0x4a3624, M(i * W * .3, 9, -D / 2 + 3, 3, 10, 2.4)]])],
  };
  const CARK = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'van', 'pickup'], TRUCKK = ['box', 'army', 'bus', 'bus'];
  const VEH = { sedan: makeCar('sedan'), hatch: makeCar('hatch'), suv: makeCar('suv'), van: makeCar('van'), pickup: makeCar('pickup'), box: makeTruck('box'), army: makeTruck('army'), bus: makeTruck('bus') };
  // приглушённые реальные цвета; у каждого экземпляра свой оттенок
  const VAR = {
    house: [0xd8cfbe, 0xc9b79c, 0xb9b3a6, 0xe0d5c0, 0xc4a98a], roof: [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34],
    car: [0x2f4a63, 0x6e2626, 0x8a7d5e, 0xaeb0ab, 0x3a4a3a, 0x232323, 0x5e6266, 0xc8c4b8, 0x7a5a2a, 0x2a4a3a], bus: [0xd8c25a, 0xe8e4da, 0xc8c0a8, 0x6a8aa8, 0xd8d0b8], cab: [0x7a2a24, 0x2a4a6a, 0xd8d4c8, 0x4a5a3a, 0x3a4a2a], house2: [0xbdb5a6, 0xa9a39a, 0xc8bfae, 0x9c958a],
    leaf: [0x778850, 0x85874a, 0x717c42, 0x9a874e, 0x577346],
    leaf2: [0x4e6038, 0x646539, 0x485d37], leafTip: [0x9ba066, 0xb1a063, 0x839356], pine: [0x435e42, 0x4c6849, 0x566744],
    rock: [0x7d7b74, 0x8a857a, 0x6e6c66],
  };
  // части каждого типа: [геометрия, цвет (или ключ VAR), матрица в единицах w/h объекта]
  // ===== реквизит: ящики, бочки, мешки с песком, бетонные блоки, палатка — детальные геометрии с цветами вершин =====
  const PROP = (() => { const H = Math.PI / 2, hs = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    const tint = (g, f) => { const P = g.attributes.position, C = g.attributes.color; for (let i = 0; i < P.count; i++) { const k = f(P.getX(i), P.getY(i), P.getZ(i), i); C.setXYZ(i, C.getX(i) * k[0], C.getY(i) * k[1], C.getZ(i) * k[2]); } return g; };
    // деревянный ящик 26: рама по рёбрам, доски с щелями, диагональные распорки, верх из досок
    const crateW = (() => { const L = [], W = 0x8a6a40, D = 0x5e4528, F = 0x6e5030, s = 13;
      L.push([geo.box, RX(0, 13, 0, 24.6, 24.6, 24.6), 0x3a2a18]);
      for (const [fx, fz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, H], [-1, 0, H]]) { for (let i = 0; i < 3; i++) L.push([geo.box, RX(fx * 12.5, 4.6 + i * 8.2, fz * 12.5, 22, 7.2, .9, 0, ry), [W, 0x947246, 0x7e5f38][(i + fx + 2) % 3]]);
        L.push([geo.box, RX(fx * 13.1, 13, fz * 13.1, 29, 2.6, .9, 0, ry, (fz || fx) > 0 ? .78 : -.78), F]); }
      for (const x of [-1, 1]) for (const z of [-1, 1]) L.push([geo.box, RX(x * 12.4, 13, z * 12.4, 3, 26, 3), D]);
      for (const y of [1.4, 24.6]) for (const [x, z, sx, sz] of [[0, 12.4, 26, 3], [0, -12.4, 26, 3], [12.4, 0, 3, 26], [-12.4, 0, 3, 26]]) L.push([geo.box, RX(x, y, z, sx, 2.8, sz), D]);
      for (let i = 0; i < 4; i++) L.push([geo.box, RX(-8.4 + i * 5.6, 25.6, 0, 5, .9, 22.4), [W, 0x9a7a4c][i % 2]]);
      L.push([geo.box, RX(0, 14, 13.2, 9, 5, .2), 0x1c1712]); // маркировка трафаретом
      return mergeG(L); })();
    // армейский ящик для патронов: зелёный, крышка с рёбрами, защёлки, ручки, жёлтая маркировка
    const crateA = (() => { const L = [], G = 0x4a5532, G2 = 0x3c4628, M_ = 0x2a2c2a;
      L.push([geo.box, RX(0, 7, 0, 30, 14, 18), G]); L.push([geo.box, RX(0, 14.8, 0, 31, 2.2, 19), G2]); for (let i = 0; i < 3; i++) L.push([geo.box, RX(-9 + i * 9, 16.2, 0, 6, .8, 15), G]);
      for (const x of [-1, 1]) { L.push([geo.box, RX(x * 9, 11.5, 9.2, 3, 4, 1), M_]); L.push([geo.box, RX(x * 15.3, 9, 0, .8, 2, 8), M_]); }
      L.push([geo.box, RX(0, 6.5, 9.05, 16, 2.4, .2), 0xc8a830]); L.push([geo.box, RX(-8, 3, 9.05, 8, 1.2, .2), 0xd8d0b0]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) L.push([geo.box, RX(x * 14.6, 7, z * 8.6, 1.4, 14.2, 1.4), G2]);
      return mergeG(L); })();
    // большой фанерный ящик: светлые стенки, тёмный брус по рёбрам, «FRAGILE»-полоса
    const crateB = (() => { const L = [], P = 0xb89a68, D = 0x6a5232;
      L.push([geo.box, RX(0, 15, 0, 33, 30, 33), P]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) L.push([geo.box, RX(x * 16, 15, z * 16, 3.2, 30.4, 3.2), D]);
      for (const y of [1.6, 15, 28.4]) for (const [x, z, sx, sz] of [[0, 16.2, 33, 2.6], [0, -16.2, 33, 2.6], [16.2, 0, 2.6, 33], [-16.2, 0, 2.6, 33]]) L.push([geo.box, RX(x, y, z, sx, 3.2, sz), D]);
      L.push([geo.box, RX(0, 22, 17.6, 14, 3, .2), 0x8a2a20]); L.push([geo.box, RX(17.6, 8, 0, .2, 4, 10), 0x222]);
      return mergeG(L); })();
    const pallet = (() => { const L = []; for (let i = 0; i < 5; i++) L.push([geo.box, RX(-14 + i * 7, 4.2, 0, 5.4, 1.2, 36), 0x9c7f55]); for (const z of [-14, 0, 14]) L.push([geo.box, RX(0, 2, z, 36, 3.6, 4), 0x7a6040]); for (let i = 0; i < 3; i++) L.push([geo.box, RX(-14 + i * 14, .4, 0, 5.4, .8, 36), 0x8a6e48]); return mergeG(L); })();
    // бочка 200 л: тело с рёбрами жёсткости, ободья, крышка с пробками; ржавчина и потёки — цветом вершин
    const drumG = new T.CylinderGeometry(1, 1, 1, 18, 8, false);
    const barrel = (col, opt = {}) => { const L = [], R = 9.4, Hh = 26.5, rim = 0x2a2624;
      L.push([drumG, RX(0, Hh / 2, 0, R, Hh, R), col]);
      for (const y of [8.8, 17.7]) L.push([geo.lay, RX(0, y, 0, 1.3, R + .45, R + .45, 0, 0, H), col]);
      for (const y of [.5, Hh - .3]) L.push([geo.lay, RX(0, y, 0, 1, R + .3, R + .3, 0, 0, H), rim]);
      if (opt.open) { L.push([geo.cyl10, RX(0, Hh - 1.4, 0, R - .4, .2, R - .4), 0x0e0a08]); for (let i = 0; i < 7; i++) { const a = i * .9; L.push([geo.box, RX(Math.cos(a) * R, 4.5 + (i % 2) * 2.6, Math.sin(a) * R, 1.7, 1.7, 1.7, 0, -a), 0x120c08]); } }
      else { L.push([geo.cyl10, RX(0, Hh + .1, 0, R - .3, .3, R - .3), col]); L.push([geo.cyl6, RX(4.4, Hh + .5, 2, 1.3, 1, 1.3), rim]); L.push([geo.cyl6, RX(-5.4, Hh + .4, -1, .8, .8, .8), rim]); }
      if (opt.band) for (const y of [12.6, 14]) L.push([drumG, RX(0, y, 0, R + .05, 1.2, R + .05), opt.band]);
      const g = mergeG(L); return tint(g, (x, y, z) => { const a = Math.atan2(z, x), n = hs(Math.floor(a * 3), Math.floor(y / 3)), streak = Math.max(0, Math.sin(a * 7 + 1.3)) * Math.max(0, 1 - y / 20), rust = (opt.rust || .4) * (n * .5 + streak * .8 + (y < 4 ? .5 : 0)), k = Math.min(1, rust);
        return [1 - k * .25, 1 - k * .5, 1 - k * .68].map((v, j) => v * (opt.soot && y > 18 ? .45 : 1) * (.93 + n * .1)); }); };
    const BARRELS = [barrel(0x6e4a30, { rust: .9 }), barrel(0x2f5d8a), barrel(0x8e2a20), barrel(0xc8a020, { band: 0x161616, rust: .3 }), barrel(0x4a5532, { rust: .3 }), barrel(0x4a3a2e, { open: 1, rust: 1, soot: 1 })];
    // мешок с песком: «подушка» (сфера, раздутая к углам), шов на конце
    const bag = (() => { const g = new T.SphereGeometry(1, 12, 8), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const v = new T.Vector3().fromBufferAttribute(P, i); const k = v.clone().set(Math.sign(v.x) * Math.pow(Math.abs(v.x), .55), Math.sign(v.y) * Math.pow(Math.abs(v.y), .9), Math.sign(v.z) * Math.pow(Math.abs(v.z), .6)); P.setXYZ(i, k.x, k.y * (1 - .12 * Math.abs(k.x)), k.z); } g.computeVertexNormals(); return g; })();
    // бетонный блок «нью-джерси»: профиль трапецией, светоотражающие полосы, сколы
    const jersey = (() => { const g = extr(null, 1, 0, sh => { sh.moveTo(-8, 0); sh.lineTo(8, 0); sh.lineTo(8, 2.6); sh.lineTo(5.2, 6.4); sh.lineTo(3.2, 22); sh.lineTo(-3.2, 22); sh.lineTo(-5.2, 6.4); sh.lineTo(-8, 2.6); sh.closePath(); }); g.rotateY(H);
      const C = 0x9a958a, L = [[g, RX(0, 0, 0, 1, 1, 1), C]];
      return (w) => { const k = w; const LL = [[g, RX(0, 0, 0, k, 1, 1), C], [geo.box, RX(-k * .22, 14, 4.2, k * .18, 4, .3, -.12), 0xb03a2a], [geo.box, RX(-k * .03, 14, 4.2, k * .18, 4, .3, -.12), 0xe8e4da], [geo.box, RX(k * .16, 14, 4.2, k * .18, 4, .3, -.12), 0xb03a2a],
        [geo.box, RX(-k * .35, 2, 0, 4, 2.6, 16.4), 0x6e6a62], [geo.box, RX(k * .35, 2, 0, 4, 2.6, 16.4), 0x6e6a62], [geo.box, RX(k * .49, 20, 2, 3, 4, 3, .4, .3), 0x7e7a70]];
        const gg = mergeG(LL); return tint(gg, (x, y, z) => { const n = hs(Math.floor(x / 4), Math.floor(y / 3) + Math.floor(z)); const d = y < 5 ? .82 : 1; return [d * (.92 + n * .12), d * (.92 + n * .1), d * (.9 + n * .1)]; }); }; })();
    const jerseyG = jersey(58);
    // палатка: провисший тент на кольях, растяжки, тёмный вход
    const tent = (() => { const L = [], C = 0x5d6340; const g = new T.CylinderGeometry(1, 1, 1, 3, 1, false, 0, Math.PI * 2); g.rotateZ(H); g.rotateY(H);
      const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i); } L.push([geo.roof, RX(0, 0, 0, 56, 30, 46), C]); L.push([geo.roof, RX(0, 3, 0, 57, 26, 40), 0x4e5436]);
      L.push([geo.box, RX(28.2, 9, 0, .6, 16, 10), 0x16140e]); for (const x of [-28.6, 28.6]) L.push([geo.cyl6, RX(x, 16, 0, .6, 32, .6), 0x4a3a28]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) L.push([geo.box, RX(x * 34, 14, z * 12, .25, .25, 34, Math.atan2(30, 22) * -z * .9, 0), 0xc8c0a0]);
      return mergeG(L); })();
    return { crateW, crateA, crateB, pallet, BARRELS, bag, jerseyG, tent };
  })();
  const PARTS = {
    shed: (w, h) => [[geo.box, 0x79614b, M(0, 30, 0, w, 60, h)], [geo.roof, 0x4c555a, M(0, 60, 0, w + 8, 24, h + 8)],
      [geo.box, 0x40352a, M(0, 24, h / 2 + .6, 38, 48, 1.2)], [geo.box, 0xb8aea0, M(14, 24, h / 2 + 1.4, 2, 3, 1.5)]],
    tree: (w, h, o) => {
      const kind = speciesOf(o.id), list = SPECIES[kind], S = list[o.id % list.length], k = w / 44 * (kind === 'oak' ? 1.25 : 1.15), tall = kind === 'linden' ? [1, 1.12, .9][o.id % 3] : 1;
      const leaf = kind === 'birch' ? BIRCHLEAF[o.id % 3] : leafOf(o.id), m = () => M(0, 0, 0, k, k * tall, k, o.id * .7);
      return [[S.wood, S.bark, m()], [S.crown, leaf, m()], [S.fringe, leaf, m()]];
    },
    pine: (w) => { const k = w / 40; return [[geo.cyl6, 0x4a3626, M(0, 8 * k, 0, 2.6 * k, 16 * k, 2.6 * k)], [geo.cone7, 'pine', M(0, 26 * k, 0, 21 * k, 30 * k, 21 * k)], [geo.cone7, 'pine', M(0, 44 * k, 0, 16 * k, 26 * k, 16 * k, .5)], [geo.cone7, 'pine', M(0, 60 * k, 0, 10 * k, 22 * k, 10 * k, 1)], [geo.cone7, 'pine', M(0, 66 * k, 0, 5 * k, 10 * k, 5 * k)]]; },
    rock: (w) => { const k = w / 36; return [[geo.dod, 'rock', M(0, 5 * k, 0, 18 * k, 12 * k, 15 * k, 0, .2)], [geo.dod, 'rock', M(9 * k, 3 * k, 6 * k, 9 * k, 7 * k, 8 * k, 1)]]; },
    hay: (w) => { const k = w / 30; return [[geo.lay, 0xbfa25a, M(0, 14 * k, 0, 21 * k, 14 * k, 14 * k)]]; },
    cactus: (w, h, o) => [[geo.bushSolid[(o ? o.id : 0) % 3], leafOf((o ? o.id : 0) + 3), M(0, 0, 0, w / 34, w / 34 * 1.1, w / 34, o ? o.id : 0)], [geo.bushFringe[(o ? o.id : 0) % 3], leafOf((o ? o.id : 0) + 3), M(0, 0, 0, w / 34, w / 34 * 1.1, w / 34, o ? o.id : 0)]], // в Европе нет кактусов — на их месте кусты
    cactusOld: (w) => { const k = w / 26; return [[geo.cyl6, 0x55703a, M(0, 22 * k, 0, 5 * k, 44 * k, 5 * k)], [geo.cyl6, 0x4f6a35, M(7 * k, 20 * k, 0, 3 * k, 6 * k, 3 * k, 0, 1.57)], [geo.cyl6, 0x4f6a35, M(10 * k, 28 * k, 0, 3 * k, 16 * k, 3 * k)],
      [geo.cyl6, 0x4f6a35, M(-6 * k, 16 * k, 0, 3 * k, 5 * k, 3 * k, 0, 1.57)], [geo.cyl6, 0x4f6a35, M(-8.5 * k, 22 * k, 0, 3 * k, 12 * k, 3 * k)]]; },
    snowman: (w) => { const k = w / 24; return [[geo.dod, 0x76746e, M(0, 5 * k, 0, 12 * k, 9 * k, 11 * k)], [geo.dod, 0x5e6a3e, M(0, 8 * k, 0, 11 * k, 6 * k, 10 * k, .4)]]; }, // валун со мхом (сезон один — без снега)
    igloo: (w) => [[geo.box, 0x6b4a2e, M(0, 13, 0, w * .7, 26, w * .7)], [geo.roof, 0x3e3328, M(0, 26, 0, w * .8, 18, w * .82)], [geo.box, 0x2e261e, M(0, 35, 0, w * .76, 1.5, w * .5)], [geo.box, 0x3a2a1c, M(0, 9, w * .35 + .6, 9, 18, 1.2)], [geo.box, 0x2e3a40, M(w * .2, 15, w * .35 + .6, 7, 6, 1.2)]], // бревенчатый домик
    house: (w, h) => [[geo.box, 'house', M(0, 20, 0, w * .75, 40, h * .75)], [geo.roof, 'roof', M(0, 40, 0, w * .86, 26, h * .9)],
      [geo.box, 0x4a3524, M(0, 12, h * .375 + .6, 11, 24, 1.5)], [geo.box, 0xe8e4da, M(w * .22, 25, h * .375 + .5, 13, 12, 1.2)], [geo.box, 0x2b363c, M(w * .22, 25, h * .375 + .8, 10, 9, 1.2)],
      [geo.box, 0xe8e4da, M(-w * .22, 25, h * .375 + .5, 13, 12, 1.2)], [geo.box, 0x2b363c, M(-w * .22, 25, h * .375 + .8, 10, 9, 1.2)], [geo.box, 0x2b363c, M(-w * .375 - .6, 25, 0, 1.2, 9, 12)], [geo.box, 0x7a4a3a, M(w * .2, 58, -h * .15, 7, 16, 7)], [geo.box, 0x6b6b66, M(0, 1.5, h * .375 + 4, 16, 3, 7)]],
    house2: (w, h) => [[geo.box, 'house2', M(0, 23, 0, w, 46, h)], [geo.box, 0x77726a, M(0, 47, 0, w * 1.02, 3, h * 1.02)], [geo.box, 0x8e8a82, M(-w * .2, 52, 0, 14, 8, 10)],
      [geo.box, 0x2b363c, M(-w * .22, 14, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w * .22, 14, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(-w * .22, 34, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w * .22, 34, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w / 2 + .6, 34, 0, 1.2, 10, 12)]],
    bunker: (w, h) => [[geo.box, 0x82827a, M(0, 13, 0, w, 26, h)], [geo.box, 0x6e6e66, M(0, 28, 0, w * .9, 4, h * .9)], [geo.box, 0x151515, M(0, 17, h / 2 + .6, w * .5, 4, 1)], [geo.box, 0xa8966e, M(0, 4, h / 2 + 4, w * 1.05, 8, 7)], [geo.box, 0x9c8a64, M(0, 11, h / 2 + 3.5, w * .9, 6, 6)]],
    barn: (w, h) => [[geo.box, 0x72302a, M(0, 23, 0, w, 46, h)], [geo.roof, 0x4e535a, M(0, 46, 0, w * 1.05, 28, h * 1.1)], [geo.box, 0xd6d2c8, M(0, 16, h / 2 + .6, 32, 32, 1.2)], [geo.box, 0x5a2520, M(0, 16, h / 2 + .9, 28, 28, 1.2)]],
    market: (w, h) => [[geo.box, 0xcfcac0, M(0, 26, 0, w, 52, h)], [geo.box, 0x7a2e38, M(0, 46, h / 2 + 1, w * .98, 9, 2)], [geo.box, 0x77726a, M(0, 53, 0, w * 1.01, 3, h * 1.01)], [geo.box, 0x34474f, M(0, 18, h / 2 + .6, w * .7, 22, 1.5)], [geo.box, 0x8e8a82, M(w * .3, 58, 0, 22, 9, 16)]],
    car: (w, h, o) => { const sx = w / 120, sz = h / 52, kind = CARK[Math.floor(rh(o ? o.id : 0, 60) * CARK.length)];
      if (kind !== 'sedan') { const V = VEH[kind]; /* кузов-лофт */ return [[V.paint, 'car', M(0, 0, 0, sx, 1, sz)], [V.trim, 0xffffff, M(0, 0, 0, sx, 1, sz)], ...V.wheels.map(([x, z, k]) => [geo.wheel, 0xffffff, M(x * sx, 9.4 * k, z * sz, k, k, k)])]; }
      const V = VEH.sedan; return [[V.paint, 'car', M(0, 0, 0, sx, 1, sz)], [V.trim, 0xffffff, M(0, 0, 0, sx, 1, sz)], ...V.wheels.map(([x, z, k]) => [geo.wheel, 0xffffff, M(x * sx, 9.4 * k, z * sz, k, k, k)])]; },
    truck: (w, h, o) => { const kind = o && dist(o.p, BIOMES[1].c) < BIOMES[1].r + 150 ? 'army' : TRUCKK[Math.floor(rh(o ? o.id : 0, 61) * TRUCKK.length)], /* на базе — только армейские */ V = VEH[kind], sx = w / 170, sz = h / 62;
      return [[V.paint, kind === 'bus' ? 'bus' : kind === 'army' ? 0x4a5233 : 'cab', M(0, 0, 0, sx, 1, sz)], [V.trim, 0xffffff, M(0, 0, 0, sx, 1, sz)], ...V.wheels.map(([x, z, k]) => [geo.wheel, 0xffffff, M(x * sx, 9.4 * k, z * sz, k, k, k)])]; },
    bus: (w, h, o) => { const V = VEH.bus, sx = w / 170, sz = h / 62; return [[V.paint, 'bus', M(0, 0, 0, sx, 1.08, sz)], [V.trim, 0xffffff, M(0, 0, 0, sx, 1.08, sz)], ...[55, -46, -64].flatMap(x => [-1, 1].map(sd => [geo.wheel, 0xffffff, M(x * sx, 12.7, sd * 25 * sz, 1.35, 1.35, 1.35)]))]; }, // большой городской автобус
    crate: (w, h, o) => { const vk = o.vk !== undefined ? o.vk : (o.id * 7) % 5 < 3 ? 0 : (o.id * 7) % 5 === 3 ? 1 : 2, g = [PROP.crateW, PROP.crateA, PROP.crateB][vk], ht = [26, 17, 30][vk], r = []; let y = 0;
      if (o.pal) { r.push([PROP.pallet, 0xffffff, M(0, 0, 0, 1, 1, 1)]); y = 4.8; }
      for (let i = 0; i < (o.lv || 1); i++) { const tw = i ? (((o.id + i) * 13) % 7 - 3) * .05 : 0, sx = i ? (((o.id + i) * 5) % 5 - 2) * .6 : 0; r.push([g, 0xffffff, M(sx, y, sx * .5, 1, 1, 1, tw)]); y += ht; }
      if (vk === 1 && !o.lv) r.push([g, 0xffffff, M(2, ht, -1, .92, .92, .92, .4)]); return r; },
    furn: (w, h, o) => { const k = o.fk;
      if (FURN[k]) { const fs = o.fs || 0, side = fs >= 2, W = side ? h : w, D = side ? w : h, ry = [0, Math.PI, Math.PI / 2, -Math.PI / 2][fs], R = new T.Matrix4().makeRotationY(ry);
        return FURN[k](W, D, o).map(([g, c, m]) => [g, c, R.clone().multiply(m)]); }
      if (k === 'bed') return [[geo.box, 0x5a4632, M(0, 5, 0, w, 10, h)], [geo.box, 0xcfc8b8, M(0, 11, h * .05, w * .9, 3, h * .8)], [geo.box, 0x6b7a5a, M(0, 11.5, h * .12, w * .92, 3, h * .5)], [geo.box, 0xe8e4da, M(0, 12.5, -h * .38, w * .7, 3, h * .14)]];
      if (k === 'bunk') return [[geo.box, 0x4a4f4a, M(0, 6, 0, w, 3, h)], [geo.box, 0x55603a, M(0, 8, 0, w * .9, 2, h * .9)], [geo.box, 0x4a4f4a, M(0, 24, 0, w, 3, h)], [geo.box, 0x55603a, M(0, 26, 0, w * .9, 2, h * .9)], [geo.box, 0x3a3d3a, M(w * .45, 14, h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(-w * .45, 14, -h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(w * .45, 14, -h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(-w * .45, 14, h * .45, 1.6, 28, 1.6)]];
      if (k === 'table') return [[geo.box, 0x6b4a2e, M(0, 13, 0, w, 2.5, h)], [geo.box, 0x4a3624, M(w * .4, 6, h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(-w * .4, 6, h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(w * .4, 6, -h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(-w * .4, 6, -h * .35, 2, 12, 2)], [geo.box, 0xe8e4da, M(w * .15, 15, 0, 6, 1.5, 5)]];
      if (k === 'desk') return [[geo.box, 0x5a4a3a, M(0, 13, 0, w, 2.5, h)], [geo.box, 0x4a3c2e, M(w * .3, 6, 0, w * .35, 12, h * .9)], [geo.box, 0x2a2a2a, M(-w * .1, 18, 0, 8, 7, 2)], [geo.box, 0x34342f, M(-w * .1, 7, h * .7, 8, 14, 8)]];
      if (k === 'sofa') return [[geo.box, 0x5a3a3a, M(0, 5, 0, w, 10, h)], [geo.box, 0x4a2e2e, M(0, 12, -h * .35, w, 14, h * .3)], [geo.box, 0x4a2e2e, M(w * .45, 9, 0, w * .1, 10, h)], [geo.box, 0x4a2e2e, M(-w * .45, 9, 0, w * .1, 10, h)]];
      if (k === 'dbox') return [[geo.box, 0x6b4a2e, M(0, 9, 0, w, 18, h)], [geo.box, 0x4a3220, M(0, 18.6, 0, w * 1.05, 1.5, h * 1.05)], [geo.box, 0x111111, M(0, 19.5, 0, w * .5, .6, 2)], [geo.box, 0xd4a017, M(w * .51, 12, 0, .6, 4, 4)]];
      if (k === 'bench') return [[geo.box, 0x6b4a2e, M(0, 8, 0, w, 2.5, h)], [geo.box, 0x5a3c24, M(-w * .42, 14, 0, 2, 12, h)], [geo.box, 0x4a3220, M(0, 4, h * .42, w * .8, 8, 2)], [geo.box, 0x4a3220, M(0, 4, -h * .42, w * .8, 8, 2)]];
      if (k === 'altar0') return [[geo.box, 0x9aa0a6, M(0, 7, 0, w, 3, h)], [geo.box, 0xf2f2ee, M(0, 11, 0, w * .95, 5, h * .95)], [geo.box, 0x7a1a1a, M(-2, 14, 3, w * .9, 1.5, h * .6)], [geo.box, 0xffffff, M(0, 14.5, -h * .36, w * .7, 3, 9)], [geo.box, 0x6a7078, M(0, 3, 0, w * .9, 6, 2)], [geo.box, 0x5a0808, M(3, 15, -4, 7, .6, 9)]]; // больничная койка в крови
      if (k === 'altar1') return [[geo.box, 0x5a5660, M(0, 8, 0, w, 16, h)], [geo.box, 0x6e6a76, M(0, 17, 0, w * 1.08, 3, h * 1.04)], [geo.box, 0x3a363e, M(0, 19, -h * .1, w * .5, 2, h * .5)], ...[-16, 16].map(z => [geo.cyl6, 0xe8dcc0, M(6, 22, z, 1.4, 6, 1.4)])]; // каменный саркофаг со свечами
      if (k === 'altar2') return [[geo.box, 0x4a4a42, M(0, 10, 0, w, 20, h)], [geo.box, 0x2a2a26, M(-2, 24, 0, w * .7, 8, h * .6)], [geo.box, 0x7a8a6a, M(-2, 24, h * .2, w * .5, 4, 2)], [geo.cyl6, 0x8a9096, M(-4, 36, -h * .3, .8, 22, .8)], [geo.box, 0xd02020, M(2, 30, 0, 1, 1, 1)]]; // рация военных
      if (k === 'altar3') return [[geo.box, 0x55595e, M(8, 30, -14, 2, 40, 2)], [geo.box, 0x55595e, M(8, 30, 14, 2, 40, 2)], [geo.box, 0xe8ddbd, M(8, 42, 0, 1.5, 24, h)], [geo.box, 0xb03030, M(7, 44, 4, .5, 2, h * .5)], [geo.box, 0x355f8a, M(7, 40, -6, .5, 8, 10)], [geo.box, 0x2a2a2a, M(0, 6, 0, w * .6, 12, h * .5)]]; // карта эвакуации
      return [[geo.box, 0x6e6a62, M(0, 15, 0, w, 30, h)], [geo.box, 0xa8543a, M(-w * .2, 21, 0, w * .35, 6, h * .8)], [geo.box, 0x5a7a8a, M(w * .22, 21, 0, w * .3, 6, h * .8)], [geo.box, 0xc9a85a, M(0, 9, 0, w * .8, 6, h * .8)]]; },
    barrel: (w, h, o) => { const vk = o.fire ? 5 : o.vk !== undefined ? o.vk : [0, 0, 1, 2, 3, 4][(o.id * 11) % 6], g = PROP.BARRELS[vk];
      return o.tip ? [[g, 0xffffff, new T.Matrix4().makeTranslation(0, 9.4, 0).multiply(new T.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new T.Matrix4().makeTranslation(0, -13, 0))]] : [[g, 0xffffff, M(0, 0, 0, 1, 1, 1)]]; },
    fence: (w) => [[geo.box, 0x6b5238, M(0, 10, 0, w, 2, 2)], [geo.box, 0x6b5238, M(0, 18, 0, w, 2, 2)], ...[-.5, -.25, 0, .25, .5].map(k => [geo.box, 0x5a4430, M(w * k * .96, 11, 0, 3, 22, 3)])],
    bush: (w, h, o) => {
      const k = w / 34, spread = o.id % 2 ? 1 : .84;
      return [[geo.bushSolid[o.id % 3], leafOf(o.id + 7), M(0, 0, 0, k * spread, k, k, o.id * .9)], [geo.bushFringe[o.id % 3], leafOf(o.id + 7), M(0, 0, 0, k * spread, k, k, o.id * .9)]];
    },
    wall: (w, h) => [[geo.box, 0x8d8d86, M(0, 11, 0, w, 22, h)], [geo.box, 0x76766f, M(0, 22.5, 0, w * 1.02, 2, h * 1.3)]],
    tent: (w, h) => [[PROP.tent, 0xffffff, M(0, 0, 0, w / 56, 1, h / 46)]],
    grave: (w, h, o) => { const v = o.id % 4, st = 0x8a8a84, mound = [geo.box, 0x5a4a36, M(0, 1.5, 12, 12, 3, 18)];
      if (v === 0) return [mound, [geo.box, st, M(0, 8, 0, 14, 16, 5)], [geo.cyl10, st, MX(0, 16, 0, 7, 5, 7)]];
      if (v === 1) return [mound, [geo.box, 0x6e6e6a, M(0, 3, 0, 12, 6, 8)], [geo.box, 0x7a7a76, M(0, 18, 0, 6, 26, 6)], [geo.cone7, 0x7a7a76, M(0, 34, 0, 4.5, 7, 4.5)]];
      if (v === 2) return [mound, [geo.box, 0x76746c, M(0, 7, 0, 14, 14, 4.5, 0, .25)]];
      return [mound, [geo.box, 0x9a968c, M(0, 9, 0, 13, 18, 4)], [geo.box, 0x6e5a8a, M(0, 3, 6, 3, 6, 3)]]; },
    deadtree: (w, h, o) => { const k = w / 34; return [[geo.deadWood[(o ? o.id : 0) % 3], 0x4a423c, M(0, 0, 0, k, k, k, o ? o.id * .9 : 0)]]; },
    ifence: (w) => [[geo.box, 0x1e1e22, M(0, 6, 0, w, 2, 2)], [geo.box, 0x1e1e22, M(0, 26, 0, w, 2, 2)], ...[...Array(12)].map((_, i) => [geo.box, 0x1e1e22, M((i / 11 - .5) * w * .96, 15, 0, 1.6, 30, 1.6)]), ...[...Array(12)].map((_, i) => [geo.cone7, 0x1e1e22, M((i / 11 - .5) * w * .96, 32, 0, 2, 5, 2)])],
    antenna: () => [[geo.box, 0x6a6e72, M(0, 2, 0, 12, 4, 12)], [geo.cyl6, 0x9aa0a6, M(0, 24, 0, 1.6, 44, 1.6, 0, .35)], [geo.box, 0x9aa0a6, M(-5, 30, 0, 22, 1.2, 1.2, 0, .55)], [geo.box, 0x9aa0a6, M(-9, 40, 0, 16, 1.2, 1.2, 0, .1)], [geo.cyl6, 0x9aa0a6, M(14, 1.5, 6, 1.4, 30, 1.4, 0, 1.5)]],
    dish: () => [[geo.cyl6, 0x777b80, M(0, 9, 0, 2, 18, 2)], [geo.dome, 0xd8dde2, M(2, 22, 0, 13, 4, 13, 0, 1.9)], [geo.cyl6, 0x555a60, M(-4, 21, 0, 1, 12, 1, 0, 1.2)]],
    junk: () => [[geo.box, 0x7a6a4a, M(0, 6, 0, 18, 12, 14, .4)], [geo.box, 0x8a8e92, M(8, 4, -6, 12, 8, 10, 1.1)], [geo.lay, 0x1c1c1c, M(-8, 4, 8, 4, 4, 10)], [geo.box, 0xd8dde2, M(-2, 13, 0, 12, 3, 10, .2, .3)]],
    sandbag: (w, h, o) => { const n = Math.max(3, Math.round(w / 14)), bw = w / n, r = [], T_ = [0x8a7a58, 0x7d6e4e, 0x948463, 0x6f6448, 0x857552, 0x9a8a68]; let q = o.id * 7;
      for (let row = 0; row < 3; row++) { const m = row % 2 ? n - 1 : n; for (let i = 0; i < m; i++) { q = (q * 31 + 7) % 997; const j = q / 997; r.push([PROP.bag, T_[q % 6], M(-w / 2 + bw * (i + .5 + (row % 2 ? .5 : 0)) + (j - .5) * 1.4, 3.4 + row * 5.6, (j - .5) * 1.6, bw * .54, 3.1, h * .46, (j - .5) * .16)]); } } return r; },
    jersey: (w, h) => [[PROP.jerseyG, 0xffffff, M(0, 0, 0, w / 58, 1, 1)]],
    billboard: (w) => [[geo.box, 0x55595e, M(-w * .3, 22, 0, 3, 44, 3)], [geo.box, 0x55595e, M(w * .3, 22, 0, 3, 44, 3)], [geo.box, 0xf2f0ea, M(0, 56, 0, w, 32, 3)], [geo.box, 0x3d8bff, M(0, 56, 1.8, w * .9, 26, .6)], [geo.box, 0xffd43b, M(-w * .1, 62, 2.3, w * .55, 4, .4)], [geo.box, 0xffffff, M(0, 54, 2.3, w * .7, 3, .4)], [geo.box, 0xffffff, M(-w * .08, 48, 2.3, w * .5, 3, .4)], [geo.box, 0xff5a5a, M(0, 56, -1.8, w * .9, 26, .6)], [geo.box, 0xffffff, M(w * .05, 60, -2.3, w * .6, 4, .4)], [geo.box, 0xffd43b, M(0, 50, -2.3, w * .4, 3, .4)]],
  };
  // лёгкая разница в размерах деревьев и камней
  const sizeVar = o => (o.type === 'tree' || o.type === 'pine' || o.type === 'rock' || o.type === 'cactus') ? .82 + ((o.id * 37) % 36) / 100 : 1;
  const inst = {}; // key -> {mesh}
  const objIdx = []; // id -> [[mesh, index]]
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  // постапокалипсис: брошенные машины (ржавые, сгоревшие, перевёрнутые), всё детерминировано по id
  const rh = (id, n) => ((id * 9301 + n * 49297 + 7) % 233280) / 233280;
  const RUST = new T.Color(0x6e4228), RUST2 = new T.Color(0x4a2e20), SOOT = new T.Color(0x221e1b), FLIP = new T.Matrix4().makeTranslation(0, 40, 0).multiply(new T.Matrix4().makeRotationX(Math.PI));
  const wreckOf = o => 0, wreckOld = o => { if (o.type !== 'car' && o.type !== 'truck' && o.type !== 'bus') return 0; const r = rh(o.id, 5); return r < .28 ? 0 : r < .6 ? 1 : o.type === 'car' && r > .9 ? 3 : 2; };
  const basisAt = o => { const k = sizeVar(o); return new T.Matrix4().compose(new T.Vector3(o.p[0], 0, o.p[1]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -o.a), new T.Vector3(k, k, k)); };
  function buildPlantContacts(objs) {
    const plants = objs.filter(o => o.type === 'tree' || o.type === 'pine' || o.type === 'bush' || o.type === 'deadtree');
    if (!plants.length) return;
    const mesh = new T.InstancedMesh(plantContactGeometry, plantContactMaterial, plants.length);
    mesh.frustumCulled = false;
    plants.forEach((o, i) => {
      const w = o.w * (o.type === 'bush' ? 1.52 : 1.07);
      const m = M(o.p[0], .026, o.p[1], w, 1, w * .82, -o.a);
      mesh.setMatrixAt(i, m);
    });
    scene.add(mesh);
    inst.plantContacts = { mesh };
  }
  function buildWorld(objs) {
    for (const k in inst) { scene.remove(inst[k].mesh); if (inst[k].mesh.userData.outline) scene.remove(inst[k].mesh.userData.outline); delete inst[k]; }
    objIdx.length = 0;
    const plan = {};
    for (const o of objs) if (o.win && rh(o.id, 3) < .45) { o.broken = true; glassBroken.add(o.id); } // выбитые стёкла с самого начала
    for (const o of objs) {
      const ty = o.type === 'tree' && rh(o.id, 1) < .38 ? 'deadtree' : o.type, f = PARTS[ty]; if (!f) continue; const parts = f(o.w, o.h, o);
      for (const [g, col, lm] of parts) {
        const bark = g.userData.bark || g === geo.cyl6 && (ty === 'tree' || ty === 'pine' || ty === 'deadtree');
        const surface = col === 'crate' ? 'crate' : col === 'leaf' || col === 'leaf2' || col === 'leafTip' || col === 'pine' || g.userData.foliage ? 'foliage' : bark ? 'bark' : 'plain';
        const key = g.uuid + '|' + surface;
        (plan[key] = plan[key] || { g, surface, items: [] }).items.push([o, lm, col]);
      }
    }
    for (const key in plan) {
      const { g, surface, items } = plan[key];
      const options = surface === 'crate' && crateTex ? { map: crateTex }
        : surface === 'foliage' ? { map: leafPattern, vertexColors: !!g.attributes.color }
        : surface === 'bark' ? { map: g.userData.birch ? birchTex : g.userData.bark ? barkTex : barkPattern, vertexColors: !!g.attributes.color } : g.attributes.color ? { vertexColors: true } : {};
      const mesh = new T.InstancedMesh(g, g.userData.cards ? windMat({ map: leafCardTex, alphaTest: .5, side: T.DoubleSide, vertexColors: true }) : g.userData.foliage ? foliageMat({ vertexColors: true }) : (surface === 'foliage' ? windMat : worldMat)(options), items.length);
      mesh.frustumCulled = false;
      mesh.castShadow = !g.userData.cards;
      mesh.receiveShadow = GROUNDED && surface === 'foliage';
      items.forEach(([o, lm, col], i) => {
        const wk = wreckOf(o), m = basisAt(o); if (wk === 3) m.multiply(FLIP); m.multiply(lm); mesh.setMatrixAt(i, m);
        const c = new T.Color(typeof col === 'string' ? (VAR[col] ? VAR[col][o.id % VAR[col].length] : 0xffffff) : col);
        if (wk === 1) c.lerp(RUST, .51).multiplyScalar(.86); else if (wk >= 2) c.lerp(rh(o.id, 9) < .5 ? SOOT : RUST2, .72); mesh.setColorAt(i, c);
        (objIdx[o.id] = objIdx[o.id] || []).push([mesh, i, m]);
        if (o.dead) mesh.setMatrixAt(i, zero);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); inst[key] = { mesh }; if (OUTLINE_ALL) addOutline(mesh, OUT_B);
    }
    if (GROUNDED) buildPlantContacts(objs);
    buildBuildings(objs);
    buildStreets(objs);
    buildRuin(objs);
    for (const [id, ob] of brokenOn) if (ob) altarBroken(id, true, ob);
    for (const k in objCol) delete objCol[k]; for (const [id, b] of burning) if (b.s === 2) darken(id);
  }
  // ===== здания =====
  // процедурные текстуры (серые — цвет задаёт оттенок экземпляра)
  function tex(f, n = 128) { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); f(g, n, mkRng(n * 7 + f.length)); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = GROUNDED ? T.LinearFilter : T.NearestFilter; t.anisotropy = GROUNDED ? Math.max(1, Math.min(lowEnd ? 2 : 4, renderer.capabilities.getMaxAnisotropy())) : 1; return t; }
  const noiseFill = (g, n, rnd, base, amp, k = 1800) => { g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, n, n); for (let i = 0; i < k; i++) { const v = base + (rnd() - .5) * amp | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * n | 0, rnd() * n | 0, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); } };
  const leafPattern = tex((g, n, rnd) => {
    noiseFill(g, n, rnd, 213, 46, 1900);
    for (let i = 0; i < 120; i++) {
      const x = rnd() * n, y = rnd() * n, r = 1 + rnd() * 3.8;
      g.fillStyle = i % 3 ? '#f4f0cd72' : '#72654a58';
      g.beginPath();
      g.ellipse(x, y, r, .75 + rnd() * 1.6, rnd() * 3.14, 0, Math.PI * 2);
      g.fill();
    }
  }, 64);
  // кора: вертикальные борозды и пластины (по UV токарной геометрии ствола: u — вокруг, v — вдоль)
  const barkTex = (() => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = mkRng(1717);
    g.fillStyle = '#c4beb2'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) { let x = r() * n; const w = 2 + r() * 3.5, dark = 70 + r() * 50 | 0; g.strokeStyle = `rgb(${dark},${dark},${dark - 4})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, -10);
      for (let y = 0; y <= n + 10; y += 16) { x += (r() - .5) * 7; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 400; i++) { const x = r() * n, y = r() * n, l = r(); g.fillStyle = l < .5 ? 'rgba(200,196,186,.25)' : 'rgba(40,38,34,.25)'; g.fillRect(x, y, 2 + r() * 5, 4 + r() * 14); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 3); return t; })();
  const birchTex = (() => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = mkRng(2828);
    g.fillStyle = '#eeebe2'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) { const y = r() * n, x = r() * n, w = 8 + r() * 40, h = 1.5 + r() * 4; g.fillStyle = `rgba(25,22,20,${.6 + r() * .4})`; g.fillRect(x, y, w, h); if (x + w > n) g.fillRect(x - n, y, w, h); } // чёрные чечевички берёзы
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(120,115,100,.25)'; g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 2); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1, 2); return t; })();
  const barkPattern = tex((g, n, rnd) => {
    noiseFill(g, n, rnd, 205, 37, 1100);
    for (let i = 0; i < 24; i++) {
      const x = rnd() * n, y = rnd() * n, h = 7 + rnd() * 24;
      g.strokeStyle = i % 3 ? '#5c473a74' : '#ffebc93c';
      g.lineWidth = .7 + rnd() * .8;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + (rnd() - .5) * 3, y + h * .55);
      g.lineTo(x + (rnd() - .5) * 4, y + h); g.stroke();
    }
  }, 64);
  const plantContactGeometry = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const plantContactMaterial = new T.MeshBasicMaterial({
    color: 0x242217, transparent: true, depthWrite: false, opacity: .64,
    map: tex((g, n) => {
      const c = n / 2, fade = g.createRadialGradient(c, c, 0, c, c, c);
      fade.addColorStop(0, '#ffffffb5');
      fade.addColorStop(.32, '#ffffff72');
      fade.addColorStop(1, '#ffffff00');
      g.fillStyle = fade; g.fillRect(0, 0, n, n);
    }, 32)
  });
  const TX = {
    asphalt: tex((g, n, rnd) => {
      noiseFill(g, n, rnd, 179, 33, 4800);
      g.fillStyle = '#e4e1dc42';
      for (let i = 0; i < 400; i++) g.fillRect(rnd() * n, rnd() * n, 1, 1);
    }),
    asphaltMark: tex((g, n, rnd) => noiseFill(g, n, rnd, 220, 49, 2100)),
    ashlar: tex((g, n, rnd) => { noiseFill(g, n, rnd, 230, 14, 1400); g.fillStyle = '#b8b4bc'; for (let y = 0; y < n; y += 32) { g.fillRect(0, y, n, 2); for (let x = (y / 32) % 2 ? 32 : 0; x < n; x += 64) g.fillRect(x, y, 2, 32); } }),
    paving: tex((g, n, rnd) => { noiseFill(g, n, rnd, 237, 9, 1600); g.fillStyle = '#c5c1b8'; for (let i = 0; i < n; i += 64) { g.fillRect(i, 0, 1, n); g.fillRect(0, i, n, 1); } }),
    stucco: tex((g, n, rnd) => { noiseFill(g, n, rnd, 245, 10, 1200); }),
    slate: tex((g, n) => { g.fillStyle = '#eeeeee'; g.fillRect(0, 0, n, n); g.fillStyle = '#d4d4d4'; for (let x = 0; x < n; x += 32) g.fillRect(x, 0, 2, n); }),
    brick: tex((g, n, rnd) => { g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 8) for (let x = -16; x < n; x += 16) { const o = (y / 8) % 2 ? 8 : 0, v = 150 + rnd() * 50 | 0; g.fillStyle = `rgb(${v + 20},${v},${v - 10})`; g.fillRect(x + o + 1, y + 1, 14, 6); } }),
    plaster: tex((g, n, rnd) => { noiseFill(g, n, rnd, 230, 46, 3600);
      for (let i = 0; i < 36; i++) {
        g.fillStyle = i % 3 ? '#594f3c12' : '#fff9df27';
        g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 1 + rnd() * 5, 1 + rnd() * 12, rnd() * 1.4, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = 'rgba(90,80,70,.35)'; for (let i = 0; i < 4; i++) { g.beginPath(); let x = rnd() * n, y = rnd() * n; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - .5) * 16; y += rnd() * 10; g.lineTo(x, y); } g.stroke(); } }),
    concrete: tex((g, n, rnd) => { noiseFill(g, n, rnd, 210, 43, 3200);
      for (let y = 8; y < n; y += 16) for (let x = 8; x < n; x += 16) {
        g.fillStyle = rnd() < .5 ? '#ffffff13' : '#332b2420';
        g.fillRect(x + rnd() * 5, y + rnd() * 2, 1 + rnd() * 4, 3 + rnd() * 8);
      }
      g.fillStyle = 'rgba(70,70,70,.35)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 63, n, 1); g.fillRect(0, 0, 1, n); g.fillRect(63, 0, 1, n); }),
    wood: tex((g, n, rnd) => { for (let x = 0; x < n; x += 12) { const v = 165 + rnd() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 12, n); g.fillStyle = 'rgba(40,30,20,.45)'; g.fillRect(x, 0, 1, n); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(60,45,30,.2)'; g.fillRect(x + 2 + rnd() * 8, rnd() * n, 1, 10 + rnd() * 20); } } }),
    metal: tex((g, n) => { for (let x = 0; x < n; x++) { const v = 185 + Math.sin(x / 4 * Math.PI) * 35 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, n); } }),
    adobe: tex((g, n, rnd) => { noiseFill(g, n, rnd, 215, 45, 2600); }),
    fwood: tex((g, n, rnd) => { for (let y = 0; y < n; y += 10) { let x = -rnd() * 40; while (x < n) { const l = 30 + rnd() * 40, v = 150 + rnd() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, l, 10); g.fillStyle = 'rgba(30,20,10,.5)'; g.fillRect(x, y, 1, 10); x += l; } g.fillStyle = 'rgba(30,20,10,.5)'; g.fillRect(0, y, n, 1); } }),
    tile: tex((g, n, rnd) => { for (let y = 0; y < n; y += 32) for (let x = 0; x < n; x += 32) { const v = ((x + y) / 32) % 2 ? 235 : 200; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 32, 32); } g.fillStyle = 'rgba(60,60,60,.5)'; for (let i = 0; i < n; i += 32) { g.fillRect(i, 0, 1, n); g.fillRect(0, i, n, 1); } }),
    floorc: tex((g, n, rnd) => { noiseFill(g, n, rnd, 190, 30); g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rnd() * n, rnd() * n, 6 + rnd() * 16, 0, 6.28); g.fill(); } }),
    dirt: tex((g, n, rnd) => { noiseFill(g, n, rnd, 180, 60, 3000); }),
    rooftile: tex((g, n, rnd) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 8) for (let x = (y / 8) % 2 ? -6 : 0; x < n; x += 12) { const v = 175 + rnd() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(x + 6, y + 4, 6, 5, 0, 0, Math.PI); g.fill(); } }),
    gravel: tex((g, n, rnd) => {
      noiseFill(g, n, rnd, 172, 65, 5600);
      for (let i = 0; i < 6; i++) {
        const x = rnd() * n, y = rnd() * n, r = 7 + rnd() * 16;
        const stain = g.createRadialGradient(x, y, 1, x, y, r);
        stain.addColorStop(0, '#372b2847'); stain.addColorStop(1, '#372b2800');
        g.fillStyle = stain; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }),
    roofing: tex((g, n, rnd) => {
      noiseFill(g, n, rnd, 170, 40, 3700);
      g.fillStyle = '#746c6940'; g.fillRect(0, 2, n, 3); g.fillRect(n / 2, 0, 2, n / 2);
      g.fillStyle = '#e5d8c426'; g.fillRect(0, 5, n, 1);
      for (let i = 0; i < 18; i++) g.fillRect(rnd() * n, rnd() * n, 2 + rnd() * 9, 1);
    }),
  };
  // материал с текстурой «по миру»: стены, пол, крыша любой длины без растяжения
  const texMats = {};
  function texMat(name, scale) {
    const k = name + scale; if (texMats[k]) return texMats[k];
    const m = GROUNDED ? new T.MeshLambertMaterial({ color: 0xffffff, map: TX[name] }) : MAT({ color: 0xffffff, map: TX[name] });
    const facade = ['plaster', 'stucco', 'brick', 'ashlar', 'concrete', 'adobe'].includes(name);
    m.customProgramCacheKey = () => (facade ? 'facade' : 'surface') + '|' + scale;
    m.onBeforeCompile = sh => {
      sh.uniforms.zc = U.zc; sh.uniforms.zrho = U.zrho;
      sh.vertexShader = 'varying vec3 vWP;varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nmat4 mw_=modelMatrix*instanceMatrix;\n#else\nmat4 mw_=modelMatrix;\n#endif\nvWP=(mw_*vec4(transformed,1.)).xyz;vWN=normalize(mat3(mw_)*objectNormal);');
      sh.fragmentShader = 'varying vec3 vWP;varying vec3 vWN;uniform vec2 zc;uniform float zrho;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `vec3 an_=abs(vWN);vec2 wuv_=an_.y>.6?vWP.xz:(an_.x>an_.z?vWP.zy:vWP.xy);vec4 texelColor=texture2D(map,wuv_/${scale.toFixed(1)});texelColor=mapTexelToLinear(texelColor);diffuseColor*=texelColor;
        ${facade ? 'if(an_.y<.6){float damp_=1.-smoothstep(1.,23.,vWP.y); diffuseColor.rgb*=mix(vec3(1.),vec3(.72,.75,.70),damp_*.85);}' : ''}`)
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + GRADE + 'if(length(vWP.xz-zc)>zrho)gl_FragColor.rgb=gl_FragColor.rgb*.16+vec3(.05,.02,.01);');
    };
    return texMats[k] = m;
  }
  const BSTY = {
    hallplaster: { tex: 'stucco', cols: [0xc8b795] },
    orderstone: { tex: 'ashlar', cols: [0x817987] },
    bunkercoat: { tex: 'concrete', cols: [0x889287] },
    civic: { tex: 'stucco', cols: [0xc8c2b2] },
    plaster: { tex: 'plaster', cols: [0xe0d6c2, 0xd8cfbe, 0xcdbfa6, 0xd9c9b0] }, plaster2: { tex: 'plaster', cols: [0xc9c2b4, 0xbcb4a6, 0xd6cfc0, 0xb8a990] },
    brick: { tex: 'brick', cols: [0xb8705a, 0xa86450, 0xc08068] }, concrete: { tex: 'concrete', cols: [0xbdb8ae, 0xaaa69e, 0x9c988f] },
    wood: { tex: 'wood', cols: [0x8a5a3a, 0x7a3a2c, 0x6e5238] }, metal: { tex: 'metal', cols: [0x8a8f86, 0x7a8478, 0x9a9488] }, adobe: { tex: 'stucco', cols: [0xd8d0c0, 0xcac2b0, 0xe0d8c8] }, // Европа: оштукатуренные сельские дома вместо глинобитных
    hallbrick: { tex: 'brick', cols: [0xe0c49a] }, stone: { tex: 'concrete', cols: [0x5a5660] }, white: { tex: 'plaster', cols: [0xf4f2ec] },
  };
  const FLOOR = { wood: ['fwood', 0x9a7350], tile: ['tile', 0xb8b4aa], concrete: ['floorc', 0x99968e], dirt: ['dirt', 0x8a7556] };
  const ROOFC = [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34];
  const wallParts = {}, wallGone = new Set(); // проломленные стены
  function smashWall(id, objs) { wallGone.add(id); if (boardMesh && boardIdx[id]) { for (const [i] of boardIdx[id]) boardMesh.setMatrixAt(i, zero); boardMesh.instanceMatrix.needsUpdate = true; } for (const [mesh, i] of wallParts[id] || []) { mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; } killObj(id); const o = objs && objs[id]; if (o) { debrisAt(at(o.p, 20), 18, o.type === 'bw' ? 0x8a7a6a : 0x6b4a2e, 120, 4); debrisAt(at(o.p, 30), 8, 0x5a5048, 90, 2.5); if (glassIdx[id]) breakGlass(id, objs); } }
  const boardPlan = [], boardIdx = {}, I4 = new T.Matrix4(); let boardMesh = null;
  // наклейки фасадов: 0 копоть над окном, 1 подтёки под карнизом, 2 отбитая штукатурка с кирпичом, 3 следы пуль
  const decalPlan = []; let decalMeshes = []; const decalGeo = new T.PlaneGeometry(1, 1), decalMats = [];
  function decalMat(k) { if (decalMats[k]) return decalMats[k]; const W = 128, H = k < 2 ? 256 : 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); let sd = 7 + k * 13; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    if (k === 0) { for (let i = 0; i < 70; i++) { const x = W / 2 + (r() - .5) * W * (.4 + .5 * r()), y = H * (1 - Math.pow(r(), 1.6)), rad = 10 + r() * 26, a = .12 * (y / H) + .02, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(14,11,9,${a})`); gr.addColorStop(1, 'rgba(14,11,9,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      const gb = g.createLinearGradient(0, H, 0, H * .6); gb.addColorStop(0, 'rgba(10,8,6,.75)'); gb.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gb; g.fillRect(W * .12, 0, W * .76, H); }
    else if (k === 1) { for (let i = 0; i < 46; i++) { const x = r() * W, w = 1 + r() * 4, len = H * (.25 + r() * .75), gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(30,26,20,${.25 + r() * .35})`); gr.addColorStop(1, 'rgba(30,26,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); }
      const gt = g.createLinearGradient(0, 0, 0, H * .3); gt.addColorStop(0, 'rgba(28,24,18,.45)'); gt.addColorStop(1, 'rgba(28,24,18,0)'); g.fillStyle = gt; g.fillRect(0, 0, W, H); }
    else if (k === 2) { const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, rr = .3 + r() * .17; pts.push([W / 2 + Math.cos(a) * W * rr, H / 2 + Math.sin(a) * H * rr]); }
      g.save(); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.clip(); g.fillStyle = '#c9c2b4'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 12) for (let x = -(y / 12 % 2) * 12; x < W; x += 24) { const c = 120 + r() * 40 | 0; g.fillStyle = `rgb(${c},${c * .52 | 0},${c * .4 | 0})`; g.fillRect(x + 1, y + 1, 22, 10); }
      g.restore(); g.strokeStyle = 'rgba(60,54,46,.8)'; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); g.strokeStyle = 'rgba(235,228,214,.7)'; g.lineWidth = 2; g.stroke(); }
    else { for (let i = 0; i < 10; i++) { const x = 14 + r() * (W - 28), y = 14 + r() * (H - 28), rr = 3 + r() * 3; g.fillStyle = 'rgba(220,214,200,.75)'; g.beginPath(); g.arc(x, y, rr * 2, 0, 6.283); g.fill(); g.fillStyle = 'rgba(70,62,54,.8)'; g.beginPath(); g.arc(x, y, rr * 1.3, 0, 6.283); g.fill(); g.fillStyle = 'rgba(8,6,5,.95)'; g.beginPath(); g.arc(x, y, rr * .7, 0, 6.283); g.fill(); } }
    const t = new T.CanvasTexture(cv); t.anisotropy = 4;
    return decalMats[k] = new T.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); }
  const bInst = {}, bParts = []; let insideB = -1; const deco = {}; const glassPlan = [], glassIdx = []; let glassMesh = null;
  // Вывеска: по умолчанию к камере, с facing — закреплена в плоскости фасада.
  function sign(bid, wp, y, w, h, lines, bg, fg, frame, facing = null) {
    const c = document.createElement('canvas'), k = 6; c.width = w * k; c.height = h * k; const g = c.getContext('2d');
    g.fillStyle = frame || bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = bg; g.fillRect(k * 1.2, k * 1.2, c.width - k * 2.4, c.height - k * 2.4);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([t, sz], i) => { g.font = '900 ' + (sz * k) + 'px system-ui,sans-serif'; const mw = g.measureText(t).width, lim = c.width - k * 5; if (mw > lim) g.font = '900 ' + Math.floor(sz * k * lim / mw) + 'px system-ui,sans-serif'; g.fillText(t, c.width / 2, c.height * (i + .5) / lines.length + (lines.length > 1 ? (i ? -k : k) : 0)); });
    const tx = new T.CanvasTexture(c); tx.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tx, side: T.DoubleSide }));
    m.position.set(wp[0], y, wp[1]); m.rotation.order = 'YXZ'; m.rotation.y = facing ? Math.atan2(facing[0], facing[1]) : Math.atan2(CAM_OFF.x, CAM_OFF.z); m.rotation.x = facing ? 0 : -.25; scene.add(m); (deco[bid] = deco[bid] || []).push(m); return m;
  }
  // уникальный вид церквей сект
  function churchDeco(b, K, pcs, objs) {
    const d = b.doors[0], dc = lerp(d.i, d.o, .5), rr_ = sub(dc, b.p), lx = dot(rr_, b.u), ly = dot(rr_, b.v), n = sub(d.o, d.i), nl = [dot(n, b.u), dot(n, b.v)], ax = Math.abs(nl[0]) > Math.abs(nl[1]);
    const fx = ax ? Math.sign(nl[0]) : 0, fz = ax ? 0 : Math.sign(nl[1]); // наружу от двери
    const out = (k, side = 0) => [lx + fx * k + (ax ? 0 : side), ly + fz * k + (ax ? side : 0)]; // точка перед дверью
    const wpt = q => add(add(b.p, b.u, q[0]), b.v, q[1]);
    const P = (g, col, m, role = 'roof', tx = 'plaster') => pcs.push([g, tx, 48, col, m, role]);
    // табличка на столбиках со стороны камеры (чтобы читалась)
    const lawn = (y, w, h, lines, bg, fg, fr, side = 0) => { const cd = norm([CAM_OFF.x, CAM_OFF.z]), wp = add(add(b.p, cd, b.rad * .8 + 30), [-cd[1], cd[0]], side), q = sub(add(wp, cd, -3.5), b.p), lq = [dot(q, b.u), dot(q, b.v)];
      for (const sd of [-1, 1]) { const o = [Math.cos(Math.atan2(CAM_OFF.x, CAM_OFF.z)) * sd * w * .38, -Math.sin(Math.atan2(CAM_OFF.x, CAM_OFF.z)) * sd * w * .38], oq = [dot(o, b.u), dot(o, b.v)]; P(geo.box, 0x55595e, M(lq[0] + oq[0], y / 2, lq[1] + oq[1], 2.4, y, 2.4), 'prop'); }
      sign(b.id, wp, y + h / 2 - 2, w, h, lines, bg, fg, fr); };
    const W = b.w, H = b.h, top = K.wallHeight || WALLH;
    if (K.church === 0) { // «Зал Вечного Тапка»: аккуратный низкий зал, газон, кусты, стойка с литературой, гигантский тапок на крыше
      const Q = (g, c, m, role = 'roof', tx = 'stucco') => pcs.push([g, tx, 48, c, m, role]);
      const cream = 0xd8d4c8, stone = 0x9b9382, teal = 0x315855, pink = 0xc8343a, gold = 0xb0b4b8;
      const rh = Math.min(W, H) * .2;
      // Ухоженный двор и светлая терраса: тихий фон вместо пёстрой травы под входом.
      const gu = ground.material.uniforms; gu.hallC.value.set(...b.p); gu.hallU.value.set(...b.u); gu.hallHalf.value.set(W / 2 + 90, H / 2 + 90);
      Q(geo.box, 0xaaa18c, M(0, .6, 0, W + 76, .5, H + 64), 'floor', 'paving');
      // Каменный цоколь отдельными сегментами — проёмы не зашиваем.
      for (const id of b.walls) { const o = objs[id];
        if (!o || (o.hor ? Math.abs(o.ly) < H / 2 - WALLT : Math.abs(o.lx) < W / 2 - WALLT)) continue;
        Q(geo.box, stone, M(o.lx, 5, o.ly, o.hor ? o.len : WALLT + 2, 10, o.hor ? WALLT + 2 : o.len), 'wall', 'concrete');
        if (o.win) {
          const nx = o.hor ? 0 : Math.sign(o.lx), nz = o.hor ? Math.sign(o.ly) : 0;
          for (const sd of [-1, 1]) Q(geo.box, teal, M(o.lx + nx * 4 + (o.hor ? sd * (o.len / 2 + 4) : 0), 48, o.ly + nz * 4 + (o.hor ? 0 : sd * (o.len / 2 + 4)), o.hor ? 5 : 3, 43, o.hor ? 3 : 5), 'win');
          Q(geo.box, cream, M(o.lx + nx * 4, 26, o.ly + nz * 4, o.hor ? o.len + 14 : 10, 4, o.hor ? 10 : o.len + 14), 'win');
        }
      }
      // Угловые пилястры, пояс под крышей и глубокий свес задают архитектурный ритм.
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        Q(geo.box, cream, M(x * (W / 2 - 4), top / 2, z * (H / 2 - 4), 13, top, 13), 'top');
        Q(geo.box, stone, M(x * (W / 2 - 4), 7, z * (H / 2 - 4), 17, 14, 17), 'wall');
      }
      for (const sd of [-1, 1]) {
        Q(geo.box, cream, M(0, top - 3, sd * H / 2, W + 14, 8, 12));
        Q(geo.box, teal, M(0, top + 2, sd * (H / 2 + 5), W + 24, 3, 12));
        Q(geo.box, cream, M(sd * W / 2, top - 3, 0, 12, 8, H + 12));
      }
      // Вход-портик: тонкие колонны остаются за пределами свободного коридора 120.
      for (const sd of [-1, 1]) { const q = out(54, sd * 74);
        Q(geo.box, stone, M(q[0], 3, q[1], 15, 6, 15), 'top');
        Q(geo.cyl10, cream, M(q[0], 39, q[1], 4.2, 72, 4.2), 'top');
        Q(geo.box, gold, M(q[0], 77, q[1], 13, 5, 13), 'top');
      }
      { const q = out(28); Q(geo.box, cream, M(q[0], 82, q[1], ax ? 72 : 170, 16, ax ? 170 : 72));
        Q(geo.roof, teal, M(q[0], 87, q[1], ax ? 82 : 178, 23, ax ? 178 : 82)); }
      // Красный крест на крыше — больницу видно издалека
      Q(geo.box, 0xf2f0ea, M(0, top + rh + 4, 0, 64, 8, 64)); Q(geo.box, 0xd42a2a, M(0, top + rh + 9, 0, 50, 3, 16)); Q(geo.box, 0xd42a2a, M(0, top + rh + 9, 0, 16, 3, 50));
      // Клумбы низкие, не закрывают людей; повторяющиеся детали инстансятся.
      for (const sd of [-1, 1]) { const q = out(115, sd * 110);
        Q(geo.box, stone, M(q[0], 3, q[1], 60, 6, 42), 'prop');
        Q(geo.box, 0x685a48, M(q[0], 6.3, q[1], 54, 1, 36), 'prop');
        for (let j = -1; j <= 1; j++) {
          Q(geo.dod, 0x50784a, M(q[0] + j * 17, 10, q[1], 12, 7, 13), 'prop');
          Q(geo.ico1, j % 2 ? 0xf3d78a : pink, M(q[0] + j * 17, 16, q[1], 4, 3, 4), 'prop');
        }
      }
      for (const sd of [-1, 1]) { const q = out(20, sd * 170);
        Q(geo.box, teal, M(q[0], 13, q[1], ax ? 20 : 68, 4, ax ? 68 : 20), 'prop');
        Q(geo.box, teal, M(q[0] - fx * 9, 23, q[1] - fz * 9, ax ? 3 : 68, 18, ax ? 68 : 3), 'prop');
        for (const end of [-1, 1]) Q(geo.box, stone, M(q[0] + (ax ? 0 : end * 23), 6, q[1] + (ax ? end * 23 : 0), 14, 12, 14), 'prop');
      }
      { const q = out(32, -100); Q(geo.box, teal, M(q[0], 14, q[1], 22, 28, 14), 'prop');
        Q(geo.box, cream, M(q[0], 29, q[1], 28, 3, 20), 'prop');
        Q(geo.box, pink, M(q[0] + fx * 11.5, 17, q[1] + fz * 7.5, ax ? 1 : 16, 12, ax ? 16 : 1), 'prop'); }
      // Лицевая доска закреплена под балкой и выступает за свес крыши: текст не перекрывается.
      { const q = out(67); Q(geo.box, cream, M(q[0], 73, q[1], ax ? 6 : 144, 18, ax ? 144 : 6)); }
      sign(b.id, wpt(out(70.5)), 73, 132, 13, [['ГОРОДСКАЯ БОЛЬНИЦА', 9]], '#f2f0ea', '#c8343a', '#9aa0a6', n);
      // Отдельный щит стоит на двух ножках, а не висит в воздухе.
      { const q = out(120, -158); Q(geo.box, stone, M(q[0], 30, q[1], ax ? 3 : 62, 31, ax ? 62 : 3), 'prop');
        for (const side of [-1, 1]) Q(geo.box, teal, M(q[0] + (ax ? 0 : side * 23), 10, q[1] + (ax ? side * 23 : 0), 3, 20, 3), 'prop'); }
      sign(b.id, wpt(out(122, -158)), 30, 58, 27, [['МЕСТ НЕТ', 7], ['укушенных не принимаем', 3.6]], '#fff', '#b02020', '#9aa0a6', n);
    } else if (K.church === 1) { // «Обитель» Тёмного Ордена: крутая чёрная крыша, шпиль со сферой, каменные голуби на углах, свечи у входа
      const Q = (g, c, m, role = 'roof', tx = 'stucco') => pcs.push([g, tx, 48, c, m, role]);
      const stone = 0x77717f, edge = 0xaaa1ad, roof = 0x302d40, brass = 0xaf945d;
      ground.material.uniforms.orderC.value.set(...b.p);
      // Стрельчатые витражи и каменные обрамления читаются на боковом фасаде.
      for (const id of b.walls) { const o = objs[id];
        if (o.hor ? Math.abs(o.ly) < H / 2 - WALLT : Math.abs(o.lx) < W / 2 - WALLT) continue;
        Q(geo.box, stone, M(o.lx, 6, o.ly, o.hor ? o.len : 10, 12, o.hor ? 10 : o.len), 'wall', 'ashlar');
        if (!o.win) continue;
        const nx = o.hor ? 0 : Math.sign(o.lx), nz = o.hor ? Math.sign(o.ly) : 0, a = Math.atan2(nx, nz);
        Q(geo.pointedArch, edge, M(o.lx + nx * 4, 23, o.ly + nz * 4, o.len + 8, 62, 1, a), 'win');
        Q(geo.pointedArch, 0x69528c, M(o.lx + nx * 4.3, 28, o.ly + nz * 4.3, o.len - 2, 51, 1, a), 'win');
        Q(geo.box, brass, M(o.lx + nx * 4.8, 47, o.ly + nz * 4.8, o.hor ? 2 : 1, 36, o.hor ? 1 : 2), 'win');
      }
      // Контрфорсы отделяют пролёты, расширенный цоколь привязывает стены к земле.
      for (const side of [-1, 1]) for (const x of [-W / 2 + 7, 0, W / 2 - 7]) {
        Q(geo.box, stone, M(x, 36, side * (H / 2 + 5), 14, 72, 18), 'top', 'ashlar');
        Q(geo.box, edge, M(x, 5, side * (H / 2 + 7), 22, 10, 24), 'wall');
        Q(geo.box, edge, M(x, 74, side * (H / 2 + 4), 18, 5, 18), 'top');
      }
      // Асимметричный шпиль: силуэт виден даже над крышами соседних домов.
      const towerX = W * .24, towerZ = -H * .25;
      Q(geo.cyl10, stone, M(towerX, top + 38, towerZ, 29, 92, 29), 'roof', 'ashlar');
      Q(geo.cyl10, edge, M(towerX, top + 85, towerZ, 33, 6, 33));
      Q(geo.cone7, roof, M(towerX, top + 133, towerZ, 36, 90, 36));
      Q(geo.sph, brass, M(towerX, top + 181, towerZ, 4, 4, 4));
      // Портал: колонны вне прохода, физически закреплённая надпись над входом.
      for (const side of [-1, 1]) { const q = out(5, side * 45);
        Q(geo.box, edge, M(q[0], 38, q[1], ax ? 13 : 10, 76, ax ? 10 : 13), 'top'); }
      { const q = out(6); Q(geo.box, stone, M(q[0], 77, q[1], ax ? 14 : 108, 14, ax ? 108 : 14)); }
      sign(b.id, wpt(out(13.5)), 77, 100, 12, [['ЧАСОВНЯ', 10]], '#55505f', '#e3d7ba', '#a18c61', n);
      // Голуби на карнизах вместо религиозных символов.
      for (const side of [-1, 1]) { const x = -W / 2 + 12, z = side * (H / 2 - 10);
        Q(geo.box, edge, M(x, top + 2, z, 22, 5, 22));
        Q(geo.sph, stone, M(x, top + 11, z, 7, 7, 10));
        Q(geo.sph, edge, M(x - 5, top + 19, z + 3, 4, 4, 4));
        Q(geo.cone7, brass, M(x - 9, top + 19, z + 3, 1.5, 5, 1.5, 0, 1.57));
      }
      for (const side of [-1, 1]) { const q = out(42, side * 82);
        Q(geo.cyl10, stone, M(q[0], 5, q[1], 13, 10, 13), 'prop');
        for (const dx of [-5, 4]) { Q(geo.cyl6, 0xcbbfa4, M(q[0] + dx, 14, q[1], 2.2, 14, 2.2), 'prop');
          Q(geo.cone7, 0xf2bc66, M(q[0] + dx, 23, q[1], 2, 5, 2), 'prop'); }
      }
    } else if (K.church === 2) { // бункер «Великого Заговора»: крыша в фольге, сломанные антенны, тарелки
      const Q = (g, c, m, role = 'roof', tx = 'stucco') => pcs.push([g, tx, 48, c, m, role]);
      const concrete = 0x788176, dark = 0x353e38, silver = 0x84938f, ochre = 0xc2a756;
      // Крупные панели фольги, вентиляция и разные антенны дают утилитарный силуэт.
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) Q(geo.box, (i + j) % 3 ? 0x879493 : 0x9da8a5, M((i - 2) * W / 5, top + 4, (j - 1.5) * H / 4, W / 5 - 2, 2, H / 4 - 2), 'roof', 'slate');
      Q(geo.box, dark, M(W * .25, top + 14, H * .2, 60, 22, 40));
      for (let i = -2; i <= 2; i++) Q(geo.box, silver, M(W * .25 + i * 9, top + 26, H * .2, 3, 2, 34));
      const dx = -W * .12, dz = -H * .1;
      Q(geo.cyl10, dark, M(dx, top + 12, dz, 16, 20, 16));
      Q(geo.receiverDish, silver, M(dx, top + 23, dz, 54, 54, 54));
      Q(geo.receiverRim, 0x596c66, M(dx, top + 45.68, dz, 54, 54, 54));
      Q(geo.cyl6, ochre, M(dx, top + 47, dz, 1.5, 48, 1.5));
      Q(geo.box, dark, M(dx, top + 72, dz, 10, 6, 10));
      for (const [x, z, height] of [[W * .31, -H * .29, 98], [-W * .32, H * .28, 62]]) {
        Q(geo.box, dark, M(x, top + 5, z, 18, 10, 18));
        Q(geo.cyl6, silver, M(x, top + height / 2, z, 2, height, 2));
        for (let i = 0; i < 3; i++) Q(geo.box, silver, M(x, top + height - 12 - i * 14, z, 48 - i * 9, 2, 2, .35));
        Q(geo.sph, 0xbc5b45, M(x, top + height + 2, z, 3, 3, 3));
      }
      for (const id of b.walls) { const o = objs[id];
        if (o.hor ? Math.abs(o.ly) < H / 2 - WALLT : Math.abs(o.lx) < W / 2 - WALLT) continue;
        Q(geo.box, dark, M(o.lx, 5, o.ly, o.hor ? o.len : 10, 10, o.hor ? 10 : o.len), 'wall');
        if (o.win) { const nx = o.hor ? 0 : Math.sign(o.lx), nz = o.hor ? Math.sign(o.ly) : 0;
          Q(geo.box, dark, M(o.lx + nx * 4, 47, o.ly + nz * 4, o.hor ? o.len + 10 : 14, 6, o.hor ? 14 : o.len + 10), 'win'); }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) Q(geo.box, concrete, M(sx * (W / 2 - 4), top / 2, sz * (H / 2 - 4), 17, top, 17), 'top', 'concrete');
      // Портал с жёлтыми полосами, проём свободен, вывеска закреплена на перемычке.
      for (const side of [-1, 1]) { const q = out(6, side * 43);
        Q(geo.box, dark, M(q[0], 30, q[1], ax ? 19 : 12, 60, ax ? 12 : 19), 'top');
        Q(geo.box, ochre, M(q[0] + fx * 10, 31, q[1] + fz * 10, ax ? 2 : 5, 52, ax ? 5 : 2), 'top'); }
      { const q = out(7); Q(geo.box, dark, M(q[0], 65, q[1], ax ? 22 : 116, 12, ax ? 116 : 22)); }
      sign(b.id, wpt(out(18.5)), 65, 108, 10, [['КАРАНТИН', 10]], '#d8b83a', '#1e1e1e', '#56604e', n);
      { const q = out(68, 100); Q(geo.box, dark, M(q[0], 29, q[1], ax ? 4 : 64, 29, ax ? 64 : 4), 'prop');
        for (const side of [-1, 1]) Q(geo.box, concrete, M(q[0] + (ax ? 0 : side * 24), 9, q[1] + (ax ? side * 24 : 0), 4, 18, 4), 'prop'); }
      sign(b.id, wpt(out(70.5, 100)), 29, 60, 25, [['ВОЕННЫЙ ПОСТ', 6], ['связи нет с 3-го дня', 4.2]], '#b5bba7', '#394432', '#687357', n);
    } else { // «собор» Святого Плаката: белое здание, шпиль из билбордов
      const Q = (g, c, m, role = 'roof', tx = 'stucco') => pcs.push([g, tx, 48, c, m, role]);
      const ivory = 0xc9c1ac, blue = 0x396899, red = 0xb85e52, gold = 0xc3a85e, stone = 0x9a9689;
      // Чистые горизонтали дворца культуры: карниз, цоколь и приподнятый фонарь крыши.
      for (const side of [-1, 1]) {
        Q(geo.box, ivory, M(0, top + 5, side * H / 2, W + 16, 7, 12));
        Q(geo.box, blue, M(0, top + 10, side * H / 2, W + 20, 3, 14));
        Q(geo.box, ivory, M(side * W / 2, top + 5, 0, 12, 7, H + 16));
      }
      Q(geo.box, blue, M(W * .12, top + 18, 0, W * .42, 30, H * .46));
      Q(geo.box, 0x848a83, M(W * .12, top + 35, 0, W * .46, 5, H * .5));
      for (let i = -2; i <= 2; i++) Q(geo.box, ivory, M(W * .12 + i * W * .075, top + 18, H * .232, 3, 28, 2));
      // Передний и задний фасады оформлены одинаково; колонны не перекрывают реальный вход.
      for (const side of [-1, 1]) {
        Q(geo.box, blue, M(side * (W / 2 + 24), 84, 0, 62, 7, H + 28));
        for (const z of [-H / 2 + 14, -H * .18, H * .18, H / 2 - 14]) {
          const nearDoor = b.doors.some(d => { const r = sub(lerp(d.i, d.o, .5), b.p); return Math.abs(dot(r, b.u) - side * W / 2) < 12 && Math.abs(dot(r, b.v) - z) < K.door / 2 + 14; });
          if (nearDoor) continue;
          Q(geo.box, ivory, M(side * (W / 2 + 43), 39, z, 11, 78, 11), 'top');
          Q(geo.box, stone, M(side * (W / 2 + 43), 3, z, 17, 6, 17), 'top');
        }
        const face = mul(b.u, side), wp = wpt([side * (W / 2 + 55.5), 0]);
        sign(b.id, wp, 84, 172, 11, [['ПУНКТ ЭВАКУАЦИИ', 8]], '#315678', '#f5e8ca', '#b49d69', face);
      }
      // Афиши в закреплённых витринах вдоль боковых стен, с собственной графической иерархией.
      const posters = [
        ['ЭВАКУАЦИЯ', 'сбор у дворца в 18:00', '#a94f48'],
        ['НЕ ОТКРЫВАЙТЕ', 'окна и двери', '#355f8a'],
        ['ВЫХОД ЕСТЬ', 'последний автобус', '#8b783e']
      ];
      for (const side of [-1, 1]) for (let i = 0; i < posters.length; i++) {
        const x = (i - 1) * 110, z = side * (H / 2 + 5), face = mul(b.v, side), p = posters[i];
        Q(geo.box, blue, M(x, 47, z, 78, 51, 5), 'top');
        sign(b.id, wpt([x, z + side * 3]), 47, 70, 44, [[p[0], 6], [p[1], 4]], '#e8ddbd', p[2], '#a9a496', face);
      }
      // Один крупный плакат-эмблема заменяет хаотичную башню из щитов.
      Q(geo.box, blue, M(W * .36, top + 43, 0, 7, 70, 106));
      Q(geo.box, ivory, M(W * .36 + 4, top + 43, 0, 2, 58, 92));
      Q(geo.box, red, M(W * .36 + 5.5, top + 54, 0, 1, 9, 76));
      Q(geo.box, gold, M(W * .36 + 5.5, top + 32, 0, 1, 22, 76));
      for (const side of [-1, 1]) Q(geo.box, stone, M(W * .36, top + 5, side * 32, 12, 10, 12));
      sign(b.id, wpt([W * .36 + 6.2, 0]), top + 43, 84, 54, [['LAST', 14], ['EXIT', 14]], '#dfc274', '#7a1010', '#b8ad91', b.u);
      // Мощение только под галереей и проходом, а не цветной прямоугольник поверх газона.
      for (const side of [-1, 1]) Q(geo.box, stone, M(side * (W / 2 + 28), .8, 0, 66, .5, H + 36), 'floor', 'paving');
      for (const side of [-1, 1]) { const q = out(80, side * 105);
        Q(geo.box, blue, M(q[0], 12, q[1], 28, 24, 28), 'prop');
        for (let i = -1; i <= 1; i++) Q(geo.dod, 0x57794a, M(q[0] + i * 7, 27, q[1], 10, 8, 10), 'prop');
        Q(geo.ico1, gold, M(q[0], 35, q[1], 5, 5, 5), 'prop');
      }
    }
  }
  function buildBuildings(objs) {
    ground.material.uniforms.hallC.value.set(1e6, 1e6);
    ground.material.uniforms.orderC.value.set(1e6, 1e6);
    for (const k in wallParts) delete wallParts[k];
    for (const k in bInst) { scene.remove(bInst[k].mesh); if (bInst[k].mesh.userData.outline) scene.remove(bInst[k].mesh.userData.outline); delete bInst[k]; }
    decalPlan.length = 0; for (const m of decalMeshes) scene.remove(m); decalMeshes = [];
    bParts.length = 0; insideB = -1; glassPlan.length = 0; boardPlan.length = 0; if (boardMesh) { scene.remove(boardMesh); boardMesh = null; } for (const k in boardIdx) delete boardIdx[k]; if (glassMesh) { scene.remove(glassMesh); glassMesh = null; } glassIdx.length = 0; for (const k in deco) { deco[k].forEach(m => scene.remove(m)); delete deco[k]; }
    const plan = {}, Y = new T.Vector3(0, 1, 0), ONE = new T.Vector3(1, 1, 1);
    for (const b of objs.blds || []) {
      const K = BKIND[b.kind], S = BSTY[K.style], base = new T.Matrix4().compose(new T.Vector3(b.p[0], 0, b.p[1]), new T.Quaternion().setFromAxisAngle(Y, -b.a), ONE);
      const wc = S.cols[b.id % S.cols.length], wm = S.tex, pcs = [], wallH = K.wallHeight || WALLH;
      const sill = K.slit ? 36 : b.kind === 'house' || K.church === 0 ? 28 : 24, winTop = K.slit ? 44 : K.church === 0 ? 68 : K.church === 1 || K.church === 3 ? 78 : b.kind === 'house' ? 60 : 50;
      const [ft, fc] = FLOOR[K.floor]; pcs.push([geo.box, ft, 48, fc, M(0, .8, 0, b.w - 2, 1.6, b.h - 2), 'floor']);
      for (const id of b.walls) {
        const o = objs[id], L = o.len, sx = o.hor ? L : WALLT, sz = o.hor ? WALLT : L, X = o.lx, Z = o.ly;
        if (b.kind === 'house' && (o.hor ? Math.abs(Z) > b.h / 2 - WALLT : Math.abs(X) > b.w / 2 - WALLT))
          pcs.push([geo.box, 'concrete', 48, 0x837d72, M(X, 3.5, Z, sx + (o.hor ? 0 : 2), 7, sz + (o.hor ? 2 : 0)), 'wall', M(X, 3.5, Z, sx, 7, sz)]);
        const pc0 = pcs.length;
        if (o.win) { // окно: подоконник, перемычка, рама; посередине пусто — видно и стреляют
          const top = winTop;
          pcs.push([geo.box, wm, 48, wc, M(X, sill / 2, Z, sx, sill, sz), 'wall', M(X, 7, Z, sx, 14, sz)]);
          pcs.push([geo.box, wm, 48, wc, M(X, (top + wallH) / 2, Z, sx, wallH - top, sz), 'top']);
          if (!K.slit) { const fx = o.hor ? sx : WALLT + 1, fz = o.hor ? WALLT + 1 : sz; pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(X, sill + 1, Z, fx + 2, 2, fz + 2), 'win']); pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(X, top - 1, Z, fx + 2, 2, fz + 2), 'win']);
            pcs.push([geo.box, 'plaster', 48, 0xd8d4ca, M(X, (sill + top) / 2, Z, o.hor ? 1.6 : WALLT * .4, top - sill, o.hor ? WALLT * .4 : 1.6), 'win']); }
        } else pcs.push([geo.box, wm, 48, wc, M(X, wallH / 2, Z, sx, wallH, sz), 'wall', M(X, 7, Z, sx, 14, sz)]);
        const exterior = o.hor ? Math.abs(Z) > b.h / 2 - WALLT : Math.abs(X) > b.w / 2 - WALLT;
        if (exterior && !K.slit) {
          const ox = o.hor ? X : X + Math.sign(X) * (WALLT / 2 + .6);
          const oz = o.hor ? Z + Math.sign(Z) * (WALLT / 2 + .6) : Z;
          const trim = b.kind === 'market' ? 0x79646b : 0xc5baa5;
          pcs.push([geo.box, 'plaster', 48, trim, M(ox, wallH - 10, oz, o.hor ? L : 2, 3.5, o.hor ? 2 : L), 'top']);
          if (o.win) {
            pcs.push([geo.box, 'concrete', 48, 0xaaa59a, M(ox, sill - 2, oz, o.hor ? L + 5 : 4.6, 3, o.hor ? 4.6 : L + 5), 'win']);
            if (b.kind === 'house' || b.kind === 'villa') {
              const shutter = b.kind === 'house' ? 0x506764 : 0x745841;
              for (const side of [-1, 1]) pcs.push([geo.box, 'wood', 24, shutter,
                M(ox + (o.hor ? side * (L / 2 + 4) : 0), (sill + winTop) / 2, oz + (o.hor ? 0 : side * (L / 2 + 4)),
                  o.hor ? 7 : 2.5, winTop - sill + 1, o.hor ? 2.5 : 7), 'win']);
            } else if (b.kind === 'market') {
              const nx = o.hor ? 0 : Math.sign(X), nz = o.hor ? Math.sign(Z) : 0;
              pcs.push([geo.box, 'metal', 24, 0x555e61,
                M(ox + nx * 5, winTop + 5, oz + nz * 5, o.hor ? L + 6 : 12, 2.4, o.hor ? 12 : L + 6), 'top']);
            }
          }
        }
        for (let k = pc0; k < pcs.length; k++) pcs[k][7] = id; // какой стене принадлежит кусок — чтобы громила мог её проломить
      }
      // перемычки над дверями (наружными и внутренними)
      const dw = (K.door || DOOR) + 2;
      for (const d of b.doors) { const c = lerp(d.i, d.o, .5), r = sub(c, b.p), lx = dot(r, b.u), ly = dot(r, b.v), n = sub(d.o, d.i), hor = Math.abs(dot(n, b.v)) > Math.abs(dot(n, b.u));
        pcs.push([geo.box, wm, 48, wc, M(hor ? lx : Math.sign(lx) * (b.w / 2 - WALLT / 2), wallH - 8, hor ? Math.sign(ly) * (b.h / 2 - WALLT / 2) : ly, hor ? dw : WALLT, 16, hor ? WALLT : dw), 'top']); }
      for (const [x, y] of b.idoors) { const onV = b.walls.some(i => { const o = objs[i]; return !o.hor && Math.abs(o.lx - x) < 1; }); pcs.push([geo.box, wm, 48, wc, M(x, wallH - 8, y, onV ? WALLT : DOOR + 2, 16, onV ? DOOR + 2 : WALLT), 'top']); }
      if (b.kind === 'house') {
        // Карниз, наличники и навесы входят в существующие инстанс-группы.
        for (const side of [-1, 1]) {
          pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(0, wallH - 2, side * b.h / 2, b.w + 8, 4, 8), 'roof']);
          pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(side * b.w / 2, wallH - 2, 0, 8, 4, b.h + 8), 'roof']);
        }
        for (const d of b.doors) {
          const r = sub(lerp(d.i, d.o, .5), b.p), x = dot(r, b.u), z = dot(r, b.v), n = norm(sub(d.o, d.i)), nx = dot(n, b.u), nz = dot(n, b.v), hor = Math.abs(nz) > .5;
          for (const side of [-1, 1]) pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(x + (hor ? side * (dw / 2 + 2) : 0), 32, z + (hor ? 0 : side * (dw / 2 + 2)), hor ? 4 : WALLT + 2, 64, hor ? WALLT + 2 : 4), 'top']);
          pcs.push([geo.box, 'metal', 24, 0x4a5358, M(x + nx * 10, 67, z + nz * 10, hor ? dw + 16 : 26, 3, hor ? 26 : dw + 16), 'roof']);
          pcs.push([geo.box, 'concrete', 48, 0xa49c8e, M(x + nx * 12, 1, z + nz * 12, hor ? dw + 12 : 24, 2, hor ? 24 : dw + 12), 'floor']);
        }
        const chimneyY = wallH + b.h * .38 * .7;
        pcs.push([geo.box, 'brick', 48, 0x98624c, M(b.w * .22, chimneyY, -b.h * .16, 12, 34, 12), 'roof']);
        pcs.push([geo.box, 'concrete', 48, 0x625e57, M(b.w * .22, chimneyY + 18, -b.h * .16, 16, 3, 16), 'roof']);
      }
      // ===== детали фасадов: водостоки, кондиционеры, щитки и кабели, трубы, антенны, тарелки, вентиляция; копоть, подтёки, сколы, следы пуль =====
      if (!K.slit && K.church === undefined) {
        const P = (g, tx, col, m, role = 'top') => pcs.push([g, tx, 24, col, m, role]);
        const gutC = [0x7d8288, 0x6a6e70, 0x8a7a68][b.id % 3], gable = K.roof === 'gable', R = Math.min(b.h, b.w) * .38, along = b.w >= b.h;
        const ext = []; for (const id of b.walls) { const o = objs[id], X = o.lx, Z = o.ly; if (!(o.hor ? Math.abs(Z) > b.h / 2 - WALLT : Math.abs(X) > b.w / 2 - WALLT)) continue; ext.push({ o, X, Z, nx: o.hor ? 0 : Math.sign(X), nz: o.hor ? Math.sign(Z) : 0 }); }
        const isBurnt = rh(b.id, 11) < .14;
        // водостоки: желоба вдоль карнизов и трубы на углах
        if (gable) { const ex = along ? b.w * 1.04 : b.h * 1.04, off = (along ? b.h : b.w) * 1.08 / 2 + 1.2;
          for (const sd of [-1, 1]) { P(geo.cyl10, 'metal', gutC, along ? RX(0, wallH - 1.2, sd * off, 2, ex, 2, 0, 0, Math.PI / 2) : RX(sd * off, wallH - 1.2, 0, 2, ex, 2, Math.PI / 2, 0, 0), 'roof');
            for (const e of [-1, 1]) { const px = along ? e * (b.w / 2 - 5) : sd * (off - 1.5), pz = along ? sd * (off - 1.5) : e * (b.h / 2 - 5);
              P(geo.cyl10, 'metal', gutC, M(px, wallH / 2 - 1, pz, 1.3, wallH - 2, 1.3)); P(geo.box, 'metal', gutC, M(px + (along ? 0 : sd * 2), 2.5, pz + (along ? sd * 2 : 0), along ? 2.6 : 5, 2.2, along ? 5 : 2.6));
              for (const y of [16, 40]) P(geo.box, 'metal', 0x4a4a48, M(px, y, pz, 3.2, .8, 3.2)); } } }
        else for (const [ex, ez] of [[1, 1], [-1, -1]]) { const px = ex * (b.w / 2 - 6), pz = ez * (b.h / 2 + 2.6);
          P(geo.cyl10, 'metal', gutC, M(px, (wallH + 4) / 2, pz, 1.4, wallH + 4, 1.4)); P(geo.box, 'metal', gutC, M(px, wallH + 3, pz - ez * 1.5, 3, 2, 4)); P(geo.box, 'metal', gutC, M(px, 2.5, pz + ez * 2, 2.8, 2.2, 5));
          for (const y of [18, 44]) P(geo.box, 'metal', 0x4a4a48, M(px, y, pz - ez * .6, 3.4, .8, 3.4)); }
        // кондиционеры на глухих стенах
        if (/^(apart|office|market|villa|barracks)$/.test(b.kind)) for (const w of ext) { const o = w.o; if (o.win || o.len < 30 || rh(o.id, 21) > .42) continue;
          const ox = w.X + w.nx * (WALLT / 2 + 4.6), oz = w.Z + w.nz * (WALLT / 2 + 4.6), ry = w.nz ? 0 : Math.PI / 2, sh = (rh(o.id, 22) - .5) * (o.len - 22), ax = w.nz ? sh : 0, az = w.nz ? 0 : sh, y = wallH * (.5 + rh(o.id, 23) * .2);
          P(geo.box, 'metal', 0xd2d0c8, M(ox + ax, y, oz + az, 18, 12, 8.4, ry));
          P(geo.cyl10, 'metal', 0x2c2e30, RX(ox + ax + w.nx * 4.3, y, oz + az + w.nz * 4.3, 4.2, .5, 4.2, w.nz ? Math.PI / 2 : 0, 0, w.nx ? Math.PI / 2 : 0));
          for (let k = -1; k <= 1; k++) P(geo.box, 'metal', 0x9a9a94, M(ox + ax + w.nx * 4.4 + (w.nz ? 0 : 0), y + k * 1.6, oz + az + w.nz * 4.4, w.nz ? 8 : .3, .3, w.nz ? .3 : 8, 0));
          for (const e of [-6, 6]) P(geo.box, 'metal', 0x5a5a58, M(ox + ax - w.nx * 2 + (w.nz ? e : 0), y - 7, oz + az - w.nz * 2 + (w.nz ? 0 : e), w.nz ? 1 : 9, 1.2, w.nz ? 9 : 1, 0));
          P(geo.cyl6, 'metal', 0x3a3a3a, M(ox + ax + (w.nz ? 7 : 0) - w.nx * 3, y / 2 - 3, oz + az + (w.nz ? 0 : 7) - w.nz * 3, .4, y - 6, .4)); }
        // щиток и кабель у первой двери
        if (b.doors.length) { const d = b.doors[0], r = sub(lerp(d.i, d.o, .5), b.p), x = dot(r, b.u), z = dot(r, b.v), n = norm(sub(d.o, d.i)), nx = dot(n, b.u), nz = dot(n, b.v), hor = Math.abs(nz) > .5, s = (K.door || DOOR) / 2 + 12;
          const bx = x + (hor ? s : 0) + nx * (WALLT / 2 + 1.6), bz = z + (hor ? 0 : s) + nz * (WALLT / 2 + 1.6);
          P(geo.box, 'metal', 0x8a8e86, M(bx, 40, bz, hor ? 9 : 3, 13, hor ? 3 : 9)); P(geo.box, 'metal', 0x3a3a38, M(bx + nx * 1.6, 41, bz + nz * 1.6, hor ? 3 : .3, 2, hor ? .3 : 3));
          P(geo.cyl6, 'metal', 0x1e1e1e, M(bx, (46.5 + wallH) / 2, bz, .45, wallH - 46.5, .45)); P(geo.box, 'plaster', 0x2a4a7a, M(bx + (hor ? -6 : 0) + nx * 0, 56, bz + (hor ? 0 : -6), hor ? 5 : 3.2, 4, hor ? 3.2 : 5)); }
        // крыши: печные трубы у вилл и домиков, на плоских — вентиляция, люк, антенна, спутниковые тарелки
        if (gable && /^(villa|lodge)$/.test(b.kind)) { const cx = (along ? -b.w * .26 : b.w * .16), cz = (along ? b.h * .14 : -b.h * .26), d = along ? Math.abs(cz) / (b.h * .54) : Math.abs(cx) / (b.w * .54), ry0 = wallH + R * (1 - d);
          P(geo.box, 'brick', 0x8e5644, M(cx, ry0 + 4, cz, 11, 26, 11), 'roof'); P(geo.box, 'concrete', 0x5e5a54, M(cx, ry0 + 17.5, cz, 14, 2.5, 14), 'roof'); P(geo.cyl10, 'metal', 0x3a3a3a, M(cx, ry0 + 20.5, cz, 2.4, 4, 2.4), 'roof'); }
        if (!gable) { for (let k = 0; k < 3; k++) { const vx = (rh(b.id, 40 + k) - .5) * b.w * .7, vz = (rh(b.id, 44 + k) - .5) * b.h * .7; P(geo.cyl10, 'metal', 0x7a7c78, M(vx, wallH + 7, vz, 1.8, 10, 1.8), 'roof'); P(geo.cyl10, 'metal', 0x5a5c58, M(vx, wallH + 12.5, vz, 2.6, 1.2, 2.6), 'roof'); }
          P(geo.box, 'metal', 0x6a6e6a, M(-b.w * .28, wallH + 4.5, b.h * .22, 16, 3, 16), 'roof'); P(geo.box, 'metal', 0x4a4e4a, M(-b.w * .28, wallH + 6.2, b.h * .22, 13, .6, 13), 'roof');
          if (/^(apart|office|barracks)$/.test(b.kind)) { const ax = b.w * .32, az = b.h * .3; P(geo.cyl6, 'metal', 0x2a2a2a, M(ax, wallH + 22, az, .5, 40, .5), 'roof'); for (const [y, l] of [[32, 14], [26, 18], [20, 22]]) P(geo.box, 'metal', 0x2a2a2a, M(ax, wallH + y, az, l, .5, .5), 'roof');
            for (let k = 0; k < (b.kind === 'apart' ? 3 : 1); k++) { const sx = -b.w * .1 + k * 22, sz = -b.h * .36; P(geo.cyl6, 'metal', 0x6a6a68, M(sx, wallH + 9, sz, .7, 12, .7), 'roof'); P(geo.cyl10, 'metal', 0xd8d6d0, RX(sx, wallH + 15, sz + 1.5, 6.5, .9, 6.5, -1.1 + k * .1, k * .5, 0), 'roof'); P(geo.cyl6, 'metal', 0x3a3a3a, RX(sx, wallH + 17, sz + 5.6, .35, 6, .35, -1, k * .5, 0), 'roof'); } } }
        // наклейки на фасаде (копоть над окнами, подтёки под крышей, сколы штукатурки, следы пуль) — в общий план, рисуются после
        for (const w of ext) { const o = w.o, ry = w.nz ? (w.nz > 0 ? 0 : Math.PI) : (w.nx > 0 ? Math.PI / 2 : -Math.PI / 2), ox = w.X + w.nx * (WALLT / 2 + .6), oz = w.Z + w.nz * (WALLT / 2 + .6);
          const at = (s, y, wdt, h, k) => decalPlan.push([k, b.id, o.id, base.clone().multiply(RX(ox + (w.nz ? s : 0), y, oz + (w.nz ? 0 : s), wdt, h, 1, 0, ry, 0))]);
          if (o.win && (isBurnt || rh(o.id, 31) < .2)) at(0, winTop + 15, o.len * 1.5, 34, 0);
          if (rh(o.id, 33) < .55) at((rh(o.id, 34) - .5) * o.len * .3, wallH - 15, o.len * (.6 + rh(o.id, 35) * .5), 28, 1);
          if (!o.win && rh(o.id, 36) < .38) { const sz = 14 + rh(o.id, 37) * 16; at((rh(o.id, 38) - .5) * (o.len - sz), 12 + rh(o.id, 39) * (wallH - 36), sz * 1.3, sz, 2); }
          if (rh(o.id, 40) < .22) at((rh(o.id, 41) - .5) * (o.len - 18), 18 + rh(o.id, 42) * 26, 18, 18, 3); }
      }
      // крыша
      const rc = ROOFC[b.id % ROOFC.length];
      const GR = { gable: [.38, K.style === 'metal' ? 0x7a807a : rc], lowgable: [.2, K.church === 0 ? 0x315855 : 0x5a6068], steep: [K.church === 1 ? .55 : .75, 0x2a2730] }[K.roof];
      if (GR) { const along = b.w >= b.h; pcs.push([geo.roof, K.church === 0 ? 'slate' : 'rooftile', 24, GR[1], along ? M(0, wallH, 0, b.w * 1.04, Math.min(b.h, b.w) * GR[0], b.h * 1.08) : M(0, wallH, 0, b.h * 1.04, Math.min(b.h, b.w) * GR[0], b.w * 1.08, 1.5708), 'roof']); }
      else { pcs.push([geo.box, K.roof === 'foil' ? 'metal' : b.kind === 'market' || b.kind === 'office' ? 'roofing' : 'gravel', K.roof === 'foil' ? 9 : 45, K.roof === 'foil' ? 0x8a9692 : 0x8a867e, M(0, wallH + 1.5, 0, b.w + 2, 3, b.h + 2), 'roof']); pcs.push([geo.box, wm, 48, wc, M(0, wallH + 4.5, b.h / 2 - 1, b.w + 3, 6, 3), 'roof']); pcs.push([geo.box, wm, 48, wc, M(0, wallH + 4.5, -b.h / 2 + 1, b.w + 3, 6, 3), 'roof']);
        pcs.push([geo.box, wm, 48, wc, M(b.w / 2 - 1, wallH + 4.5, 0, 3, 6, b.h), 'roof']); pcs.push([geo.box, wm, 48, wc, M(-b.w / 2 + 1, wallH + 4.5, 0, 3, 6, b.h), 'roof']);
        if (b.kind === 'market' || b.kind === 'office') {
          for (const x of [-b.w * .19, b.w * .19]) {
            const z = -b.h * .13;
            pcs.push([geo.box, 'metal', 24, 0x92958c, M(x, wallH + 9, z, 38, 12, 25), 'roof']);
            pcs.push([geo.box, 'metal', 24, 0x536065, M(x, wallH + 15.4, z, 31, 1.2, 19), 'roof']);
            for (const dx of [-10, -5, 0, 5, 10]) pcs.push([geo.box, 'metal', 24, 0xb3aea0,
              M(x + dx, wallH + 16.2, z, 1.6, 1.2, 18), 'roof']);
          }
        } else if (!K.church) pcs.push([geo.box, 'metal', 24, 0x9a9a92, M(b.w * .22, wallH + 7, -b.h * .15, 22, 10, 16), 'roof']); }
      if (K.church !== undefined) churchDeco(b, K, pcs, objs);
      bParts[b.id] = [];
      if (!K.slit) for (const id of b.walls) { const o = objs[id]; if (!o.win) continue; glassPlan.push([o.id, b.id, base.clone().multiply(M(o.lx, (sill + winTop) / 2, o.ly, o.hor ? o.len : 1.2, winTop - sill, o.hor ? 1.2 : o.len))]);
        if (rh(o.id, 4) < .3) for (let k = 0; k < 3; k++) { const y = sill + (winTop - sill) * (.2 + k * .3), tl = (rh(o.id, 6 + k) - .5) * .35; boardPlan.push([o.id, b.id, base.clone().multiply(M(o.lx, y, o.ly, o.len * 1.18, 4.5, WALLT + 3, o.hor ? 0 : Math.PI / 2, tl))]); } }
      const burnt = K.church === undefined && rh(b.id, 11) < .14; if (burnt) { b.burnt = 1; for (const pc of pcs) if (typeof pc[3] === 'number' && (pc[5] === 'roof' || pc[5] === 'top' || pc[5] === 'wall')) pc[3] = new T.Color(pc[3]).lerp(SOOT, pc[5] === 'wall' ? .45 : .8).getHex(); } // сгоревший дом
      for (const [g, tx, sc, col, lm, role, low, wid] of pcs) { const key = g.uuid + '|' + tx + '|' + sc + '|' + (role === 'floor' ? 'f' : 'w'); (plan[key] = plan[key] || { g, tx, sc, items: [] }).items.push([b.id, col, base.clone().multiply(lm), role, low ? base.clone().multiply(low) : null, wid]); }
    }
    for (let k = 0; k < 4; k++) { const items = decalPlan.filter(d => d[0] === k); if (!items.length) continue; const mesh = new T.InstancedMesh(decalGeo, decalMat(k), items.length); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.receiveShadow = true;
      items.forEach(([, bid, wid, m], i) => { mesh.setMatrixAt(i, wallGone.has(wid) ? zero : m); (bParts[bid] = bParts[bid] || []).push([mesh, i, m, 'top', null, wid]); (wallParts[wid] = wallParts[wid] || []).push([mesh, i]); }); scene.add(mesh); decalMeshes.push(mesh); }
    if (boardPlan.length) { boardMesh = new T.InstancedMesh(geo.box, worldMat(), boardPlan.length); boardMesh.frustumCulled = false; boardMesh.castShadow = true; // доски на окнах
      boardPlan.forEach(([oid, bid, m], i) => { (boardIdx[oid] = boardIdx[oid] || []).push([i, m, bid]); boardMesh.setMatrixAt(i, objs[oid].dead ? zero : m); boardMesh.setColorAt(i, new T.Color([0x6b5238, 0x5a4430, 0x7a6040][(oid + i) % 3])); }); scene.add(boardMesh); }
    if (glassPlan.length) { glassMesh = new T.InstancedMesh(geo.box, GROUNDED ? new T.MeshPhongMaterial({ color: 0x9cb2bd, specular: 0x9cabb0, shininess: 55, transparent: true, opacity: .28, depthWrite: false }) : new T.MeshLambertMaterial({ color: 0xbfe4ff, transparent: true, opacity: .32, depthWrite: false }), glassPlan.length); glassMesh.frustumCulled = false;
      glassPlan.forEach(([oid, bid, m], i) => { glassIdx[oid] = [i, m, bid]; glassMesh.setMatrixAt(i, objs[oid].broken ? zero : m); }); scene.add(glassMesh); }
    for (const key in plan) {
      const { g, tx, sc, items } = plan[key];
      const mesh = new T.InstancedMesh(g, texMat(tx, sc), items.length); mesh.frustumCulled = false; mesh.castShadow = !key.endsWith('f'); mesh.receiveShadow = true;
      items.forEach(([bid, col, m, role, low, wid], i) => { mesh.setMatrixAt(i, wallGone.has(wid) ? zero : m); mesh.setColorAt(i, new T.Color(col)); bParts[bid].push([mesh, i, m, role, low, wid]); if (wid !== undefined) (wallParts[wid] = wallParts[wid] || []).push([mesh, i]); });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); bInst[key] = { mesh }; if (OUTLINE_ALL && !key.endsWith('f')) addOutline(mesh, OUT_B);
    }
  }
  const streetPlane = new T.PlaneGeometry(1, 1); streetPlane.rotateX(-Math.PI / 2);
  const roadCap = new T.CircleGeometry(.5, 24); roadCap.rotateX(-Math.PI / 2);
  let streetMeshes = [];
  let streetPlan = null;
  // ===== уличная обстановка: фонари, светофоры, знаки, остановки, скамейки, урны, отбойники — только визуал, без коллизий =====
  let SFG = null;
  const streetFurnGeo = () => SFG || (SFG = (() => {
    const H = Math.PI / 2, PO = 0x4a4d50, PD = 0x2e3032, RU = 0x6a4a36, C = geo.cyl10;
    // фонарь ~6 м: бетонное основание, конусный столб, изогнутый вылет над дорогой (+x), плафон
    const lamp = (() => { const L = [];
      L.push([C, RX(0, 4, 0, 5.5, 8, 5.5), 0x8a8780]); L.push([C, RX(0, 9, 0, 3.6, 3, 3.6), PD]);
      for (let i = 0; i < 6; i++) L.push([C, RX(0, 10 + i * 30 + 15, 0, 2.6 - i * .2, 30, 2.6 - i * .2), PO]);
      const R = 26; for (let i = 0; i < 6; i++) { const a = i / 6 * H, a2 = (i + 1) / 6 * H, x0 = R - Math.cos(a) * R, y0 = 190 + Math.sin(a) * R, x1 = R - Math.cos(a2) * R, y1 = 190 + Math.sin(a2) * R;
        L.push([C, RX((x0 + x1) / 2, (y0 + y1) / 2, 0, 1.4, Math.hypot(x1 - x0, y1 - y0) + 1, 1.4, 0, 0, -Math.atan2(x1 - x0, y1 - y0)), PO]); }
      L.push([C, RX(R + 16, 216, 0, 1.4, 34, 1.4, 0, 0, H), PO]);
      L.push([geo.box, RX(R + 38, 214, 0, 20, 4.5, 9), PD]); L.push([geo.box, RX(R + 38, 211.4, 0, 16, 1.2, 6.4), 0xd8d2b0]); // плафон и мутное стекло
      L.push([geo.box, RX(2.8, 40, 0, 1, 14, 6), 0x5a5c5e]); // лючок
      L.push([geo.box, RX(0, 60, 2.8, 4, 5, 1), 0xc8c2b0]); // номер столба
      return mergeG(L); })();
    // светофор на мачте: столб, вылет к перекрёстку (+x), подвесная секция, «кнопка» для пешеходов
    const tlight = (() => { const L = [];
      L.push([C, RX(0, 3, 0, 5, 6, 5), 0x8a8780]); L.push([C, RX(0, 80, 0, 2.6, 160, 2.6), 0x3c4a3e]);
      L.push([C, RX(34, 156, 0, 1.6, 70, 1.6, 0, 0, H), 0x3c4a3e]); L.push([C, RX(16, 146, 0, 1, 34, 1, 0, 0, .9), 0x3c4a3e]);
      for (const x of [62, 30]) { L.push([geo.box, RX(x, 140, 0, 9, 28, 9), 0x1e2220]); L.push([geo.box, RX(x, 140, 0, 11, 30, 2), 0x15181a]);
        [[0x5a1a14, 149], [0xc8901c, 140], [0x1e3a24, 131]].forEach(([c, y]) => { L.push([C, RX(x - 4.9, y, 0, 3.4, 1, 3.4, 0, 0, H), c]); L.push([geo.box, RX(x - 5.5, y + 3.8, 0, 2.2, .8, 7), 0x15181a]); }); }
      L.push([geo.box, RX(0, 98, 0, 7, 24, 7), 0x1e2220]); [[0x5a1a14, 104], [0x1e3a24, 92]].forEach(([c, y]) => L.push([C, RX(3.6, y, 0, 2.6, 1, 2.6, 0, 0, H), c]));
      L.push([geo.box, RX(2.4, 40, 0, 4, 7, 5), 0xc8a830]); return mergeG(L); })();
    const post = (L, h, x = 0) => L.push([C, RX(x, h / 2, 0, 1.4, h, 1.4), 0x8a8c8e]);
    // «Стоп»: восьмиугольник с белой каймой
    const stop = (() => { const L = []; post(L, 78); const o = new T.CylinderGeometry(1, 1, 1, 8); L.push([o, RX(1.2, 78, 0, 11, 1, 11, 0, 0, H).multiply(RX(0, 0, 0, 1, 1, 1, 0, Math.PI / 8)), 0xe8e4dc]); L.push([o, RX(1.8, 78, 0, 9.6, 1, 9.6, 0, 0, H).multiply(RX(0, 0, 0, 1, 1, 1, 0, Math.PI / 8)), 0xa8231c]); L.push([geo.box, RX(2.4, 78, 0, .4, 2.4, 11), 0xe8e4dc]); return mergeG(L); })();
    // «Уступи дорогу»: треугольник вершиной вниз
    const yieldS = (() => { const L = []; post(L, 74); const t = new T.CylinderGeometry(1, 1, 1, 3); L.push([t, RX(1.2, 74, 0, 13, 1, 13, 0, 0, H).multiply(RX(0, 0, 0, 1, 1, 1, 0, H)), 0xa8231c]); L.push([t, RX(1.8, 75, 0, 8.6, 1, 8.6, 0, 0, H).multiply(RX(0, 0, 0, 1, 1, 1, 0, H)), 0xe8e4dc]); return mergeG(L); })();
    // круглый «50» и щит населённого пункта на двух стойках
    const speed = (() => { const L = []; post(L, 80); L.push([new T.CylinderGeometry(1, 1, 1, 16), RX(1.2, 80, 0, 11, 1, 11, 0, 0, H), 0xa8231c]); L.push([new T.CylinderGeometry(1, 1, 1, 16), RX(1.8, 80, 0, 8.4, 1, 8.4, 0, 0, H), 0xe8e4dc]); for (const z of [-2.6, 2.6]) L.push([geo.box, RX(2.3, 80, z, .3, 7, 3.2), 0x1a1a1a]); return mergeG(L); })();
    const town = (() => { const L = []; for (const z of [-26, 26]) L.push([C, RX(0, 40, z, 1.6, 80, 1.6), 0x8a8c8e]); L.push([geo.box, RX(1.5, 70, 0, 1.4, 24, 66), 0xe8e4dc]); L.push([geo.box, RX(2.3, 70, 0, .3, 20, 62), 0x2a4a8a]);
      L.push([geo.box, RX(2.5, 72, 0, .2, 5, 44), 0xe8e4dc]); L.push([geo.box, RX(2.5, 64, 0, .2, 2, 30), 0xe8e4dc]); L.push([geo.box, RX(2.6, 70, 0, .2, 2.2, 62), 0xa8231c]); return mergeG(L); })(); // перечёркнут: город покинут
    // остановка: навес, задняя стенка из мутного стекла, скамья, табличка на столбике, урна
    const shelter = (() => { const L = [], F = 0x5a6064;
      for (const x of [-46, 46]) for (const z of [-14, 14]) L.push([geo.box, RX(x, 38, z, 2.6, 76, 2.6), F]);
      L.push([geo.box, RX(0, 78, 0, 104, 3, 36), 0x6a7074]); L.push([geo.box, RX(0, 80, 0, 100, 1.6, 32), 0x8a9094]);
      L.push([geo.box, RX(0, 44, -14, 90, 58, 1.2), 0x9ab4bc]); for (const x of [-46, 46]) L.push([geo.box, RX(x, 44, 0, 1.2, 58, 26), 0x9ab4bc]);
      L.push([geo.box, RX(0, 44, -13.2, 92, 2.2, 2), F]); L.push([geo.box, RX(-20, 52, -13.6, 30, 34, .4), 0xc8b890]); // рекламный плакат выцвел
      L.push([geo.box, RX(0, 17, -6, 70, 2.4, 12), 0x6a5038]); for (const x of [-30, 30]) L.push([geo.box, RX(x, 8, -6, 2, 16, 10), F]);
      L.push([C, RX(64, 42, 16, 1.2, 84, 1.2), 0x8a8c8e]); L.push([geo.box, RX(64, 82, 16, 14, 14, 1), 0x2a6a3a]); L.push([geo.box, RX(64, 82, 16.6, 8, 6, .2), 0xe8e4dc]);
      L.push([C, RX(-62, 12, 14, 7, 24, 7), 0x3a4a3a]); L.push([C, RX(-62, 24.5, 14, 7.6, 1.5, 7.6), 0x2a2c2a]); return mergeG(L); })();
    // скамейка (доски на чугунных боковинах) и урна
    const bench = (() => { const L = []; for (const x of [-20, 20]) { L.push([geo.box, RX(x, 7, 0, 2.4, 14, 12), 0x26282a]); L.push([geo.box, RX(x, 18, -6, 2.4, 14, 2), 0x26282a]); }
      for (let i = 0; i < 3; i++) L.push([geo.box, RX(0, 14, -4 + i * 4, 48, 1.4, 3.2), [0x6e5236, 0x7a5c3c, 0x5e462e][i]]); for (let i = 0; i < 2; i++) L.push([geo.box, RX(0, 20 + i * 5, -6.6, 48, 3.2, 1.2), 0x6e5236]); return mergeG(L); })();
    const bin = (() => { const L = []; L.push([C, RX(0, 12, 0, 6.4, 24, 6.4), 0x3a4a3a]); L.push([C, RX(0, 24.6, 0, 7, 1.6, 7), 0x26282a]); L.push([C, RX(0, 6, 0, 6.6, 1.4, 6.6), 0x26282a]); L.push([geo.box, RX(0, 26, 0, 6, 1.2, 4), 0xd8d4c8]); return mergeG(L); })();
    // отбойник: 2 стойки и W-образная лента, кусок 80
    const rail = (() => { const L = []; for (const x of [-20, 20]) L.push([geo.box, RX(x, 13, -2, 3, 26, 3), 0x6a6c6e]); L.push([geo.box, RX(0, 21, 0, 82, 7, 1.2), 0x9a9c9e]); for (const y of [18.4, 23.6]) L.push([geo.box, RX(0, y, .9, 82, 1.4, 1), 0xb2b4b6]); return mergeG(L); })();
    // столб ЛЭП с проводами вдоль трассы: проводов нет (оборваны), но поперечина и изоляторы
    const pole = (() => { const L = []; L.push([C, RX(0, 120, 0, 3.6, 240, 3.6), 0x5a4632]); L.push([geo.box, RX(0, 226, 0, 4, 4, 60), 0x4a3a2a]); for (const z of [-26, 0, 26]) L.push([C, RX(0, 231, z, 1.6, 6, 1.6), 0x8aa0a0]); return mergeG(L); })();
    return { lamp, tlight, stop, yieldS, speed, town, shelter, bench, bin, rail, pole };
  })());
  function buildStreetFurniture(objs, plan, paths) {
    const G = streetFurnGeo(), R = mkRng(7070), items = {}; for (const k in G) items[k] = [];
    const segs = plan.segs, onAsphalt = (p, pad) => segs.some(sg => { const ab = sub(sg[1], sg[0]), t = Math.max(0, Math.min(1, dot(sub(p, sg[0]), ab) / dot(ab, ab))); return dist(p, add(sg[0], ab, t)) < sg[2] / 2 + pad; });
    const onWalk = p => paths.some(([a, b]) => { const ab = sub(b, a), L2 = Math.max(1, dot(ab, ab)), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)); return dist(p, add(a, ab, t)) < 22; });
    const taken = [], ok = (p, r) => inMap(p, 40) && bldAt(objs.blds, p) < 0 && !objs.blds.some(b => b.yard && Math.abs(dot(sub(p, b.p), b.u)) < b.yard[0] / 2 + r && Math.abs(dot(sub(p, b.p), b.v)) < b.yard[1] / 2 + r)
      && !nearObjs(objs, p, r + 60).some(o => !o.nc && o.type !== 'bush' && objPush(o, p, r)) && !onAsphalt(p, 2) && !onWalk(p) && !taken.some(q => dist(p, q) < r + 14);
    // поворот: локальная +x модели смотрит в направление dir (на карте)
    const SY = { lamp: .82, tlight: .85 }; // в изометрии высокие столбы заслоняют игру — чуть ниже реальных
    const TALL = { lamp: 1, tlight: 1, pole: 1 }; // высокие столбы не ставим у точки старта: в изометрии они заслоняют героев
    const put = (k, p, dir, tilt = 0) => { if (TALL[k] && dist(p, ZSPAWN) < 260) return; taken.push(p); items[k].push(new T.Matrix4().compose(new T.Vector3(p[0], 0, p[1]), new T.Quaternion().setFromEuler(new T.Euler(tilt * (R() - .5), Math.atan2(-dir[1], dir[0]), tilt * (R() - .5), 'YXZ')), new T.Vector3(1, SY[k] || 1, 1))); };
    const inJ = (p, pad) => plan.junctions.some(j => dist(p, j.p) < j.r + pad), urban = p => objs.blds.some(b => dist(b.p, p) < 520);
    for (const [a, b, w, k] of segs) { const L = dist(a, b), d = norm(sub(b, a)), n = perp(d);
      if (k !== 'dirt') { // фонари: на улицах всегда, на трассе — только среди домов; шахматный порядок
        const sp = k === 'street' ? 250 : 300; let side = R() < .5 ? -1 : 1;
        for (let t = 60; t < L - 40; t += sp + R() * 40) { side = -side; const p = add(add(a, d, t), n, side * (w / 2 + (k === 'street' ? 20 : 26)));
          if ((k === 'street' || urban(p)) && !inJ(p, 20) && ok(p, 8)) put('lamp', p, mul(n, -side), R() < .12 ? .25 : .03); } }
      if (k === 'street') for (let t = 90; t < L - 60; t += 70) { if (R() > .2) continue; const side = R() < .5 ? -1 : 1, kind = R() < .45 ? 'bench' : 'bin', p = add(add(a, d, t), n, side * (w / 2 + (kind === 'bench' ? 24 : 18)));
        if (!inJ(p, 30) && ok(p, kind === 'bench' ? 22 : 8)) put(kind, p, kind === 'bench' ? mul(perp(mul(n, -side)), -1) : d, .02); } // скамья лицом к улице
      if (k === 'main') { // за городом: отбойники на опасных участках и столбы ЛЭП
        for (let t = 0; t < L; t += 600) { if (R() < .45) continue; const side = R() < .5 ? -1 : 1, run = 3 + Math.floor(R() * 5);
          for (let i = 0; i < run; i++) { const p = add(add(a, d, t + i * 81), n, side * (w / 2 + 16)); if (t + i * 81 > L || urban(p) || inJ(p, 60) || !ok(p, 10)) continue; put('rail', p, d, R() < .15 ? .2 : .01); } }
        for (let t = 120; t < L; t += 420) { const p = add(add(a, d, t), n, w / 2 + 70); if (!urban(p) && dist(p, [40, -20]) > 900 && !inJ(p, 260) && ok(p, 10)) put('pole', p, n, R() < .2 ? .14 : .02); } } }
    // перекрёстки: светофоры по диагонали на городских, знаки «Стоп»/«Уступи» на примыкающих дорогах
    for (const j of plan.junctions) { const legs = segs.filter(sg => { const ab = sub(sg[1], sg[0]), t = dot(sub(j.p, sg[0]), ab) / dot(ab, ab); return t > -.05 && t < 1.05 && dist(j.p, add(sg[0], ab, Math.max(0, Math.min(1, t)))) < sg[2] / 2 + 4; });
      const kinds = new Set(legs.map(l => l[3])); if (legs.length < 2) continue;
      if (!kinds.has('dirt') && (kinds.has('street') || urban(j.p))) { const A = legs[0], Bv = legs.find(l => l[4] !== A[4]) || legs[1], d1 = norm(sub(A[1], A[0])), d2 = norm(sub(Bv[1], Bv[0]));
        for (const sg of [1, -1]) { const p = add(add(j.p, d1, sg * (Bv[2] / 2 + 24)), d2, sg * (A[2] / 2 + 24)); if (ok(p, 8)) put('tlight', p, norm(sub(j.p, p)), .02); } }
      // концы дорог, упирающиеся в другую: знак справа перед перекрёстком
      for (const l of legs) for (const [e, o] of [[l[0], l[1]], [l[1], l[0]]]) { if (dist(e, j.p) > l[2] / 2 + Math.max(...legs.map(x => x[2])) / 2 + 30) continue; const into = norm(sub(e, o)), back = mul(into, -1), rt = perp(into);
        const other = legs.find(x => x[4] !== l[4]); if (!other) continue; if (l[3] === 'main' || (l[3] === 'street' && other[3] !== 'main')) continue;
        const p = add(add(j.p, back, other[2] / 2 + 40), rt, -(l[2] / 2 + 18)); if (ok(p, 8)) put(l[3] === 'dirt' ? 'yieldS' : 'stop', p, back, .03); } }
    // въезды в город по трассам: щит населённого пункта (перечёркнутый) и «50»
    const cen = [40, -20]; for (const sg of segs) { if (sg[3] !== 'main') continue; const d = norm(sub(sg[1], sg[0])), n = perp(d);
      for (const dd of [760, 1700]) { const ab = sub(sg[1], sg[0]); for (let t = 0; t <= 1; t += .01) { const q = add(sg[0], ab, t); if (Math.abs(dist(q, cen) - dd) > 12) continue; const toC = norm(sub(cen, q)), fwd = dot(toC, d) > 0 ? d : mul(d, -1), side = perp(fwd);
        const p = add(q, side, -(sg[2] / 2 + 30)); if (ok(p, 30)) put(dd > 1000 ? 'town' : 'speed', p, mul(fwd, -1), .02); break; } } }
    // остановки у автобусов, стоящих у бровки
    for (const o of objs) { if (o.type !== 'bus') continue; const sg = segs.reduce((best, s) => { const ab = sub(s[1], s[0]), t = Math.max(0, Math.min(1, dot(sub(o.p, s[0]), ab) / dot(ab, ab))), dd = dist(o.p, add(s[0], ab, t)); return !best || dd < best[1] ? [s, dd, add(s[0], ab, t)] : best; }, null);
      if (!sg || sg[1] < sg[0][2] / 2 - 70) continue; const out = norm(sub(o.p, sg[2])), p = add(sg[2], out, sg[0][2] / 2 + 36), d = norm(sub(sg[0][1], sg[0][0]));
      if (ok(p, 30)) put('shelter', p, mul(perp(mul(out, -1)), -1), 0); } // открытой стороной (+z) к дороге
    for (const k in G) { if (!items[k].length) continue; const mesh = new T.InstancedMesh(G[k], worldMat({ vertexColors: true }), items[k].length);
      items[k].forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new T.Color(0xffffff)); }); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh); streetMeshes.push(mesh); }
    return items;
  }
  function buildStreets(objs) {
    for (const m of streetMeshes) scene.remove(m); streetMeshes = [];
    const plan = planStreets(objs), paths = []; streetPlan = plan;
    for (const walk of plan.walks) for (let i = 1; i < walk.points.length; i++) paths.push([walk.points[i - 1], walk.points[i]]);
    const layer = (segments, width, y, tx, color, caps = true) => {
      const mesh = new T.InstancedMesh(streetPlane, texMat(tx, 48), segments.length);
      segments.forEach(([a, b], i) => { const d = sub(b, a), length = len(d);
        mesh.setMatrixAt(i, M((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, width, 1, length + (caps ? 0 : 2), Math.atan2(d[0], d[1])));
        mesh.setColorAt(i, new T.Color(color)); });
      mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh); streetMeshes.push(mesh);
      if (!caps) return;
      // круглые «шайбы» в узлах: стыки и повороты дорог гладкие, без торчащих углов прямоугольников
      const nodes = new Map(); for (const [a, b] of segments) for (const q of [a, b]) nodes.set(Math.round(q[0]) + ',' + Math.round(q[1]), q);
      const cm = new T.InstancedMesh(roadCap, texMat(tx, 48), nodes.size); let i = 0;
      for (const q of nodes.values()) { cm.setMatrixAt(i, M(q[0], y, q[1], width, 1, width)); cm.setColorAt(i++, new T.Color(color)); }
      cm.receiveShadow = true; cm.frustumCulled = false; scene.add(cm); streetMeshes.push(cm);
    };
    // дороги по типам: трасса — асфальт с гравийной обочиной и полной разметкой, улица — асфальт, бордюр и тротуары, грунтовка — колея
    const bySeg = k => plan.segs.filter(sg => sg[3] === k), SW = { main: [44, 0, 'gravel', 0x8a8172], street: [64, 10, 'paving', 0x9a958a], dirt: [26, 0, 'gravel', 0x7d6d58] };
    for (const k of ['main', 'street', 'dirt']) { const ss = bySeg(k); if (!ss.length) continue; const w = ss[0][2], [side, curb, stx, scol] = SW[k];
      layer(ss.map(sg => [sg[0], sg[1]]), w + side, .03, stx, scol);
      if (curb) layer(ss.map(sg => [sg[0], sg[1]]), w + curb, .05, 'concrete', 0xb4b0a6);
      layer(ss.map(sg => [sg[0], sg[1]]), w, .08, k === 'dirt' ? 'dirt' : 'asphalt', k === 'dirt' ? 0x8a7458 : k === 'main' ? 0x4c5056 : 0x585c62); }
    // разметка: прерывистая ось (на трассе ещё сплошные края), разрывы на перекрёстках; на грунтовке — две колеи
    const inJ = (p, pad = 0) => plan.junctions.some(j => dist(p, j.p) < j.r + pad), dashes = [], edges = [], ruts = [], zebra = [];
    for (const [a, b, w, k] of plan.segs) { const L = dist(a, b), d = norm(sub(b, a)), n = perp(d);
      if (k === 'dirt') { for (let t = 0; t < L; t += 40) { const p = add(a, d, t), q = add(a, d, Math.min(L, t + 40)); if (inJ(p, -10)) continue; for (const o of [-24, 24]) ruts.push([add(p, n, o), add(q, n, o)]); } continue; }
      const dash = k === 'main' ? 56 : 34, gap = k === 'main' ? 44 : 40;
      for (let t = 10; t + dash < L; t += dash + gap) { const p = add(a, d, t), q = add(a, d, t + dash); if (!inJ(p, 14) && !inJ(q, 14)) dashes.push([p, q]); }
      if (k === 'main') for (let t = 0; t < L; t += 30) { const p = add(a, d, t), q = add(a, d, Math.min(L, t + 30)); if (inJ(p, 4) || inJ(q, 4)) continue; for (const o of [-1, 1]) edges.push([add(p, n, o * (w / 2 - 12)), add(q, n, o * (w / 2 - 12))]); } }
    // «зебры» перед перекрёстками на всех городских ветках: полосы вдоль дороги, шагом поперёк
    for (const j of plan.junctions) for (const [a, b, w, k] of plan.segs) { if (k === 'dirt') continue; const L = dist(a, b), d = norm(sub(b, a)), n = perp(d), t0 = dot(sub(j.p, a), d);
      if (Math.abs(dot(sub(j.p, a), n)) > w / 2 + 4) continue;
      for (const sgn of [-1, 1]) { const t = t0 + sgn * (j.r + 26); if (t < 20 || t > L - 20) continue; const c = add(a, d, t); if (inJ(c, 2)) continue;
        for (let o = -w / 2 + 18; o <= w / 2 - 18; o += 22) zebra.push([add(add(c, n, o), d, -20), add(add(c, n, o), d, 20)]); } }
    layer(ruts, 14, .1, 'dirt', 0x5e4c3a, false);
    layer(dashes, 3.2, .12, 'asphaltMark', 0xd8d2bf, false);
    layer(edges, 3.2, .12, 'asphaltMark', 0xd8d2bf, false);
    layer(zebra, 11, .12, 'asphaltMark', 0xdedad0, false);
    layer(paths, 28, .16, 'paving', 0xb1a995);
    buildStreetFurniture(objs, plan, paths);
    if (GROUNDED) buildGrassMask(objs, plan.segs, paths);

  }
  // пучок травы: 9 изогнутых травинок, тёмные у земли и светлые к кончикам; качаются на ветру (в шейдере)
  const vergeGrassGeometry = (() => {
    const pos = [], col = [], r = mkRng(4242);
    for (let b = 0; b < 9; b++) { const a = r() * 6.28, d = r() * 2.6, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 5 + r() * 6, wd = .55 + r() * .35, lean = .25 + r() * .45, ta = a + (r() - .5) * 1.2;
      const ux = -Math.sin(ta) * wd, uz = Math.cos(ta) * wd, ox = Math.cos(ta) * lean * h, oz = Math.sin(ta) * lean * h;
      const P = [[x - ux, 0, z - uz], [x + ux, 0, z + uz], [x + ox * .35 - ux * .6, h * .55, z + oz * .35 - uz * .6], [x + ox * .35 + ux * .6, h * .55, z + oz * .35 + uz * .6], [x + ox, h, z + oz]];
      const C = [.62, .62, .82, .82, 1.05].map(t => t * (.9 + r() * .2));
      for (const [i0, i1, i2] of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) for (const k of [i0, i1, i2]) { pos.push(...P[k]); col.push(C[k], C[k], C[k]); } }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals(); const N = geometry.attributes.normal; for (let k = 0; k < N.count; k++) N.setXYZ(k, N.getX(k) * .3, 1, N.getZ(k) * .3); // нормали вверх — трава освещается как земля
    geometry.normalizeNormals(); return geometry;
  })();
  const vergeGrassMaterial = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide, vertexColors: true });
  vergeGrassMaterial.onBeforeCompile = sh => { sh.uniforms.uT = U.t; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
    float wk_ = position.y / 10.0; vec2 ip_ = instanceMatrix[3].xz; transformed.x += sin(uT * 1.9 + ip_.x * .035 + ip_.y * .02) * wk_ * 1.3; transformed.z += cos(uT * 1.6 + ip_.y * .03) * wk_ * .9;
    #endif`); };
  // ===== живая трава: густой «ковёр» только вокруг камеры (перестраивается при движении), гнётся от людей и врагов, волны ветра =====
  const GCELL = 16, GN = Math.ceil(HALF * 2 / GCELL); let grassMask = null, carpetKey = '';
  function buildGrassMask(objs, roads, paths) {
    const m = new Uint8Array(GN * GN).fill(1), ci = v => Math.floor((v + HALF) / GCELL), paved = BIOMES.filter(b => b.n === 'city' || b.n === 'market' || b.n === 'base');
    const markSeg = ([a, b], rad) => { const x0 = ci(Math.min(a[0], b[0]) - rad), x1 = ci(Math.max(a[0], b[0]) + rad), y0 = ci(Math.min(a[1], b[1]) - rad), y1 = ci(Math.max(a[1], b[1]) + rad), ab = sub(b, a), L2 = Math.max(1, dot(ab, ab));
      for (let y = Math.max(0, y0); y <= Math.min(GN - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(GN - 1, x1); x++) { const p = [-HALF + (x + .5) * GCELL, -HALF + (y + .5) * GCELL], t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)); if (dist(p, add(a, ab, t)) < rad) m[y * GN + x] = 0; } };
    for (const s of roads) markSeg(s, s[2] / 2 + (s[3] === 'street' ? 34 : 24)); for (const s of paths) markSeg(s, 18);
    for (const o of objs) { if (o.nc || o.type === 'tree' || o.type === 'deadtree' || o.type === 'cactus') continue; const r = o.rad + 4; for (let y = Math.max(0, ci(o.p[1] - r)); y <= Math.min(GN - 1, ci(o.p[1] + r)); y++) for (let x = Math.max(0, ci(o.p[0] - r)); x <= Math.min(GN - 1, ci(o.p[0] + r)); x++) { const p = [-HALF + (x + .5) * GCELL, -HALF + (y + .5) * GCELL]; if (!objPush(o, p, 6)) continue; m[y * GN + x] = 0; } }
    for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) { if (!m[y * GN + x]) continue; const p = [-HALF + (x + .5) * GCELL, -HALF + (y + .5) * GCELL];
      if (Math.max(Math.abs(p[0]), Math.abs(p[1])) > HALF - 70 || paved.some(b => dist(p, b.c) < b.r * 1.02) || bldAt(objs.blds, p) >= 0) m[y * GN + x] = 0; }
    grassMask = m; carpetKey = '';
  }
  // формы травы: тонкие травинки, широкие листья, злаки с колоском, цветы (одуванчик, мак, ромашка) — одна геометрия на вид
  const bladeGeo = (n, hmin, hvar, wd, seed, head) => { const pos = [], col = [], r = mkRng(seed);
    for (let b = 0; b < n; b++) { const a = r() * 6.28, d = r() * 3.4, x = Math.cos(a) * d, z = Math.sin(a) * d, h = hmin + r() * hvar, w = wd * (.7 + r() * .5), lean = .2 + r() * .45, ta = a + (r() - .5) * 1.2;
      const ux = -Math.sin(ta) * w, uz = Math.cos(ta) * w, ox = Math.cos(ta) * lean * h, oz = Math.sin(ta) * lean * h;
      const P = [[x - ux, 0, z - uz], [x + ux, 0, z + uz], [x + ox * .35 - ux * .7, h * .55, z + oz * .35 - uz * .7], [x + ox * .35 + ux * .7, h * .55, z + oz * .35 + uz * .7], [x + ox, h, z + oz]], C = [.66, .66, .85, .85, 1.04].map(t => t * (.9 + r() * .2));
      for (const tri of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) for (const k of tri) { pos.push(...P[k]); col.push(C[k], C[k], C[k] * .96); }
      if (head && b % 2 === 0) { const hx = x + ox, hz = z + oz; for (const [dx, dy, dz] of [[0, 0, 0], [.8, -1.5, .3], [-.7, -3, -.2]]) { const c = [1.1, 1.0, .7]; pos.push(hx + dx - .9, h + dy, hz + dz, hx + dx + .9, h + dy, hz + dz, hx + dx, h + dy + 2.4, hz + dz); col.push(...c, ...c, ...c); } } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const N = g.attributes.normal; for (let k = 0; k < N.count; k++) N.setXYZ(k, N.getX(k) * .3, 1, N.getZ(k) * .3); g.normalizeNormals(); return g; };
  const flowerGeo = (() => { const pos = [], col = [], r = mkRng(77);
    for (let f = 0; f < 3; f++) { const x = (r() - .5) * 5, z = (r() - .5) * 5, h = 6 + r() * 5, kind = f; pos.push(x - .3, 0, z, x + .3, 0, z, x, h, z); col.push(.5, .6, .3, .5, .6, .3, .6, .7, .35);
      const pc = kind === 0 ? [1.6, 1.35, .2] : kind === 1 ? [1.5, .25, .15] : [1.6, 1.6, 1.5]; // одуванчик, мак, ромашка
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; pos.push(x, h, z, x + Math.cos(a) * 1.8, h + .3, z + Math.sin(a) * 1.8, x + Math.cos(a + 1.05) * 1.8, h + .3, z + Math.sin(a + 1.05) * 1.8); col.push(...pc, ...pc, ...pc); }
      if (kind === 2) { pos.push(x - .6, h + .5, z, x + .6, h + .5, z, x, h + .5, z + .9); col.push(1.6, 1.2, .2, 1.6, 1.2, .2, 1.6, 1.2, .2); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const N = g.attributes.normal; for (let k = 0; k < N.count; k++) N.setXYZ(k, 0, 1, 0); return g; })();
  const BENDN = 12, bendU = { value: Array.from({ length: BENDN }, () => new T.Vector3(0, 0, -1)) };
  const carpetMat = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide, vertexColors: true });
  carpetMat.onBeforeCompile = sh => { sh.uniforms.uT = U.t; sh.uniforms.uB = bendU; sh.vertexShader = 'uniform float uT;uniform vec3 uB[' + BENDN + '];\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
    { vec2 ip_ = instanceMatrix[3].xz; float sc_ = max(.001, length(instanceMatrix[0].xyz)); float hk_ = position.y / 10.0;
      float gust_ = .5 + .5 * sin(dot(ip_, vec2(.011, .007)) - uT * 1.6); gust_ *= gust_; // волны ветра бегут по полю
      vec2 off_ = vec2(sin(uT * 2.1 + ip_.x * .05 + ip_.y * .03), cos(uT * 1.7 + ip_.y * .04)) * (.6 + 2.4 * gust_) * hk_;
      for (int i = 0; i < ${BENDN}; i++) { if (uB[i].z < 0.) continue; vec2 dd_ = ip_ - uB[i].xy; float d_ = length(dd_); float k_ = 1. - smoothstep(uB[i].z * .3, uB[i].z, d_); off_ += normalize(dd_ + vec2(.001)) * k_ * 7. * hk_; transformed.y -= k_ * position.y * .45; } // приминается под ногами
      transformed.xz += off_ / sc_; }
    #endif`); };
  carpetMat.customProgramCacheKey = () => 'carpet';
  const CARPET = [['blade', bladeGeo(9, 5, 7, .55, 4242), lowEnd ? 2600 : 4200, .62], ['wide', bladeGeo(5, 4, 4, 1.4, 515), lowEnd ? 700 : 1100, .14], ['seed', bladeGeo(6, 9, 6, .45, 616, 1), lowEnd ? 500 : 800, .1], ['flower', flowerGeo, lowEnd ? 260 : 420, .045]].map(([n, g, cap, p]) => { const m = new T.InstancedMesh(g, carpetMat, cap); m.setColorAt(0, new T.Color(1, 1, 1)); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; scene.add(m); return { n, m, cap, p }; });
  const GRC = [0x8a9a52, 0x7e9450, 0x96a058, 0xa8a060, 0xb2a466, 0x76884a], _gm = new T.Matrix4(), _gq = new T.Quaternion(), _gc = new T.Color(), _gv = new T.Vector3(), _gs = new T.Vector3(), _gy = new T.Vector3(0, 1, 0);
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy; };
  const hc = (id, k) => { let h = Math.imul(id, 374761393) + Math.imul(k, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; // хороший хэш: без полос и рядов
  function updateCarpet(c, zoom) {
    if (!grassMask) return; const R = 720 * Math.max(1, zoom), key = Math.round(c[0] / 64) + ',' + Math.round(c[1] / 64) + ',' + Math.round(R / 100); if (key === carpetKey) return; carpetKey = key;
    for (const C of CARPET) C.m.count = 0;
    const x0 = Math.max(0, Math.floor((c[0] - R + HALF) / GCELL)), x1 = Math.min(GN - 1, Math.floor((c[0] + R + HALF) / GCELL)), y0 = Math.max(0, Math.floor((c[1] - R + HALF) / GCELL)), y1 = Math.min(GN - 1, Math.floor((c[1] + R + HALF) / GCELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!grassMask[y * GN + x]) continue; const id = y * GN + x, wx = -HALF + (x + .5) * GCELL, wz = -HALF + (y + .5) * GCELL, dry = vnoise(wx / 260, wz / 260), lush = vnoise(wx / 90 + 7, wz / 90);
      for (const C of CARPET) { const p = C.p * (C.n === 'flower' ? (lush > .55 ? 2.2 : .3) : (.6 + lush * .9)); if (hc(id, C.n.length * 7) >= p || C.m.count >= C.cap) continue;
        const jx = (hc(id, 3 + C.n.length) - .5) * GCELL * 1.8, jz = (hc(id, 9 + C.n.length) - .5) * GCELL * 1.8, sc = .8 + hc(id, 21 + C.n.length) * .7;
        C.m.setMatrixAt(C.m.count, _gm.compose(_gv.set(wx + jx, .1, wz + jz), _gq.setFromAxisAngle(_gy, hc(id, 33) * 6.28), _gs.set(sc, sc * (.8 + lush * .5), sc)));
        if (C.n === 'flower') _gc.setRGB(1, 1, 1); else { _gc.setHex(GRC[Math.floor(hc(id, 44) * 3)]).lerp(new T.Color(GRC[3 + Math.floor(hc(id, 45) * 3)]), Math.min(1, Math.max(0, dry * 1.6 - .45))); }
        C.m.setColorAt(C.m.count++, _gc); } }
    for (const C of CARPET) { C.m.instanceMatrix.needsUpdate = true; if (C.m.instanceColor) C.m.instanceColor.needsUpdate = true; }
  }
  function setBenders(list) { for (let i = 0; i < BENDN; i++) { const b = list[i]; if (b) bendU.value[i].set(b[0], b[1], b[2] || 26); else bendU.value[i].set(0, 0, -1); } }
  function buildVergeGrass(objs, roads, paths) {
    const occupied = roads.map(segment => [segment, 29]).concat(paths.map(segment => [segment, 17]));
    const clear = p => !occupied.some(([[a, b], radius]) => {
      const ab = sub(b, a), delta = sub(p, a);
      const t = Math.min(1, Math.max(0, dot(delta, ab) / Math.max(1, dot(ab, ab))));
      return dist(p, add(a, ab, t)) < radius;
    }) && bldAt(objs.blds, p) < 0 && !nearObjs(objs, p, 7).some(o => !o.nc && objPush(o, p, 7));
    const paved = BIOMES.filter(b => b.n === 'city' || b.n === 'market' || b.n === 'base'), onPave = q => paved.some(b => dist(q, b.c) < b.r * 1.02);
    const tufts = [], spacing = lowEnd ? 80 : 52, cap = lowEnd ? 3200 : 5000;
    const colors = [0x8a8a50, 0x9a8a4e, 0x74844a, 0xae9a5e, 0x6e7a44];
    for (const [i, [a, b]] of roads.entries()) {
      const dir = norm(sub(b, a)), n = perp(dir), length = dist(a, b);
      for (let t = 17; t < length - 15 && tufts.length < cap; t += spacing) {
        const id = i * 100 + Math.floor(t);
        const p = add(add(a, dir, t + rh(id, 6) * 8), n, (rh(id, 8) < .5 ? -1 : 1) * (32 + rh(id, 10) * 19));
        if (!clear(p) || onPave(p)) continue;
        for (let k = 0; k < 3 && tufts.length < cap; k++) {
          const q = add(add(p, dir, (k - 1) * 6), n, (rh(id, 11 + k) - .5) * 7);
          if (!clear(q)) continue;
          const h = .58 + rh(id, 14 + k) * .62;
          tufts.push([M(q[0], .12, q[1], 1.7, h * 1.3, 1.7, rh(id, 17 + k) * 6.28), colors[(id + k) % colors.length]]);
        }
      }
      if (tufts.length >= cap) break;
    }
    // у стволов деревьев и кустов — по паре пучков
    for (const o of objs) { if (tufts.length >= cap * .55) break; if (o.type !== 'tree' && o.type !== 'bush' && o.type !== 'deadtree') continue;
      for (let k = 0; k < 3; k++) { const a = rh(o.id, 30 + k) * 6.28, q = add(o.p, [Math.cos(a), Math.sin(a)], o.w * (.35 + rh(o.id, 33 + k) * .4)); if (clear(q) && !onPave(q)) tufts.push([M(q[0], .12, q[1], 1.7, 1 + rh(o.id, 36 + k) * .6, 1.7, a), colors[(o.id + k) % colors.length]]); } }
    // поле: разбросанные пучки на траве (не в городе, на рынке, базе, в снегу и пустыне)
    { const r2 = mkRng(555), noGrass = BIOMES.filter(b => b.n !== 'farm' && b.n !== 'snow' && b.n !== 'desert');
      for (let i = 0; i < cap * 3 && tufts.length < cap; i++) { const q = rndMap(r2, 80); if (noGrass.some(b => dist(q, b.c) < b.r * .95)) continue; if (!clear(q)) continue;
        const n = 2 + Math.floor(r2() * 4); for (let k = 0; k < n && tufts.length < cap; k++) { const qq = add(q, [(r2() - .5) * 26, (r2() - .5) * 26]); tufts.push([M(qq[0], .12, qq[1], 1.5 + r2() * .9, .9 + r2() * .8, 1.5 + r2() * .9, r2() * 6.28), colors[Math.floor(r2() * colors.length)]]); } } }
    if (!tufts.length) return;
    const mesh = new T.InstancedMesh(vergeGrassGeometry, vergeGrassMaterial, tufts.length);
    tufts.forEach(([matrix, color], i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new T.Color(color)); });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    streetMeshes.push(mesh);
  }
  // игрок внутри здания: крыша исчезает, стены опускаются — видно, что внутри
  function setInside(bid) {
    if (bid === insideB) return;
    const set = (id, open) => { for (const [mesh, i, m, role, low, wid] of bParts[id] || []) { mesh.setMatrixAt(i, wallGone.has(wid) ? zero : !open || role === 'floor' || role === 'prop' ? m : low || zero); mesh.instanceMatrix.needsUpdate = true; } };
    if (insideB >= 0) set(insideB, false); insideB = bid; if (bid >= 0) set(bid, true);
    for (const k in deco) for (const m of deco[k]) m.visible = +k !== bid;
    if (boardMesh) { for (const oid in boardIdx) for (const [i, m, b] of boardIdx[oid]) boardMesh.setMatrixAt(i, b === bid || wallGone.has(+oid) ? zero : m); boardMesh.instanceMatrix.needsUpdate = true; }
    if (glassMesh) { for (const oid in glassIdx) { const [i, m, b] = glassIdx[oid]; glassMesh.setMatrixAt(i, b === bid || glassBroken.has(+oid) ? zero : m); } glassMesh.instanceMatrix.needsUpdate = true; }
  }
  // осквернённый алтарь: сам алтарь скрыт, вместо него обломки, красная надпись на полу
  const broken = {};
  const brokenOn = new Map();
  function altarBroken(id, on, objs) {
    brokenOn.set(id, on ? objs : null); if (!objIdx[id]) return;
    for (const [mesh, i, m] of objIdx[id] || []) { mesh.setMatrixAt(i, on ? zero : m); mesh.instanceMatrix.needsUpdate = true; }
    if (!broken[id]) { const o = objs[id], g = new T.Group(); g.position.set(o.p[0], 0, o.p[1]); g.rotation.y = -o.a;
      [[0, 3, -10, 14, 6, 10, .3], [-6, 2.5, 8, 10, 5, 12, -.5], [8, 2, 2, 8, 4, 8, 1.1], [-2, 1.5, 18, 6, 3, 6, .7]].forEach(([x, y, z, a, b, c, r]) => { const k = new T.Mesh(geo.box, lam(0x5a5650)); k.position.set(x, y, z); k.scale.set(a, b, c); k.rotation.set(r, r * .7, r * .4); g.add(k); });
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'); cx.strokeStyle = 'rgba(220,20,20,.9)'; cx.lineWidth = 14; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(20, 20); cx.lineTo(108, 108); cx.moveTo(108, 20); cx.lineTo(20, 108); cx.stroke();
      const d = new T.Mesh(new T.PlaneGeometry(50, 50), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.set(-14, 2, 0); g.add(d);
      scene.add(g); broken[id] = g; }
    broken[id].visible = on;
  }
  // ===== живой мир: стёкла, обломки, взрывы, горящие машины, предметы качаются от попаданий =====
  const glassBroken = new Set();
  const debris = []; for (let i = 0; i < 90; i++) { const m = new T.Mesh(geo.box, new T.MeshLambertMaterial({ color: 0xffffff })); m.visible = false; m.userData = { t: 9, v: new T.Vector3(), w: new T.Vector3() }; scene.add(m); debris.push(m); }
  let debI = 0;
  function debrisAt(v, n, col, sp = 90, size = 2.4) { for (let k = 0; k < n; k++) { const m = debris[debI++ % debris.length], u = m.userData; m.position.copy(v); m.material.color.setHex(col); const s = size * (.6 + Math.random() * .8); m.scale.set(s, s * (.4 + Math.random() * .6), s); u.v.set((Math.random() - .5) * sp * 2, sp * (.5 + Math.random()), (Math.random() - .5) * sp * 2); u.w.set(Math.random() * 12, Math.random() * 12, 0); u.t = 0; m.visible = true; } }
  function breakGlass(id, objs) { glassBroken.add(id); const g = glassIdx[id]; if (glassMesh && g) { glassMesh.setMatrixAt(g[0], zero); glassMesh.instanceMatrix.needsUpdate = true; } const o = objs[id]; if (o) debrisAt(at(o.p, 36), 10, 0xcfeeff, 60, 1.8); }
  const wob = new Map(); // id -> t
  const WOBBLY = { crate: .16, barrel: .2, car: .04, truck: .03, bus: .02, tree: .05, pine: .05, bush: .12, fence: .1, ifence: .08, grave: .06, billboard: .05, antenna: .15, dish: .15, junk: .12, deadtree: .06 };
  const MATC = { car: 0xffd080, truck: 0xffd080, barrel: 0xffd080, crate: 0x8a6a40, fence: 0x8a6a40, tree: 0x4a6b2a, pine: 0x2f5233, bush: 0x4a6b2a };
  function hitNear(objs, end) { let best = null, bd = 30; for (const o of nearObjs(objs, end, 40)) { if (o.dead || !WOBBLY[o.type]) continue; const d = Math.max(0, dist(o.p, end) - o.rad); if (d < bd) { bd = d; best = o; } } if (!best) return;
    wob.set(best.id, 0); if (MATC[best.type]) debrisAt(at(end, 18), 3, MATC[best.type], 50, 1.4); }
  function reviveObj(id) { for (const [mesh, i, m] of objIdx[id] || []) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; } }
  // взрыв: вспышка, огненный шар, дым, обломки, подпалина
  const fires = [], burning = new Map(); // burning: id -> {p, s, t}
  let scT = null; const scorchTex = () => scT || (scT = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(15,10,6,.95)'); gr.addColorStop(.6, 'rgba(25,18,10,.6)'); gr.addColorStop(1, 'rgba(25,18,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
  const scorch = []; const mkScorch = () => { if (scorch.length) return; for (let i = 0; i < 12; i++) { const m = new T.Mesh(poolGeo, new T.MeshBasicMaterial({ map: scorchTex(), transparent: true, opacity: .8, depthWrite: false })); m.visible = false; m.userData = { t: 99 }; scene.add(m); scorch.push(m); } };
  let scI = 0;
  function boom(p, r) { // взрыв: вспышка и свет, огненный шар, ударная волна, пыль по земле, искры, обломки, грибок дыма, догорающее пятно
    const B = Math.min(2, r / 100), q = lowEnd ? .65 : 1;
    flashAt(at(p, 22), r * 1.8); flashAt(at(p, 55), r * 1.1); boomL.position.set(p[0], 70, p[1]); boomT = 0; boomI = 2.4 + B * 1.2;
    shockAt(p, r);
    for (let i = 0, n = Math.round((18 + 20 * B) * q); i < n; i++) { const P = fpNext(), a = Math.random() * 6.283, el = Math.random() * 1.25, sp = r * (1.3 + Math.random() * 2.4), rr = Math.random() * r * .16;
      P.k = 3; P.x = p[0] + Math.cos(a) * rr; P.z = p[1] + Math.sin(a) * rr; P.y = 6 + Math.random() * r * .22; P.vx = Math.cos(a) * Math.cos(el) * sp; P.vz = Math.sin(a) * Math.cos(el) * sp; P.vy = Math.sin(el) * sp * .9 + 50; P.dr = 5.5; P.a = -Math.random() * .07; P.l = .5 + Math.random() * .6; P.s = r * (.26 + Math.random() * .34); }
    for (let i = 0, n = Math.round((16 + 22 * B) * q); i < n; i++) { const P = fpNext(), a = Math.random() * 6.283, sp = 220 + Math.random() * 480 * B;
      P.k = 2; P.x = p[0]; P.z = p[1]; P.y = 10 + Math.random() * 14; P.vx = Math.cos(a) * sp; P.vz = Math.sin(a) * sp; P.vy = 140 + Math.random() * 420; P.dr = .7; P.a = 0; P.l = .6 + Math.random() * .8; P.s = 2 + Math.random() * 1.6; }
    for (let i = 0; i < 10; i++) { const P = fpNext(), a = Math.random() * 6.283, rr = Math.random() * r * .5; P.k = 1; P.x = p[0] + Math.cos(a) * rr; P.z = p[1] + Math.sin(a) * rr; P.y = 10 + Math.random() * 30; P.vx = (Math.random() - .5) * 40; P.vz = (Math.random() - .5) * 40; P.vy = 50 + Math.random() * 90; P.dr = 0; P.a = -Math.random() * .3; P.l = 1.5 + Math.random() * 1.5; P.s = 1.8 + Math.random() * 1.2; }
    for (let i = 0, n = Math.round((10 + 8 * B) * q); i < n; i++) { const a = Math.random() * 6.283, rr = Math.random() * r * .3, sh = .07 + Math.random() * .08;
      smoke(p[0] + Math.cos(a) * rr, 18 + Math.random() * r * .3, p[1] + Math.sin(a) * rr, Math.cos(a) * 35, 55 + Math.random() * 70, Math.sin(a) * 35, 2.6 + Math.random() * 1.8, r * .35, r * (.85 + Math.random() * .6), sh, sh * .95, sh * .9, .92, 1, .05 + Math.random() * .4, 1.2); }
    for (let i = 0, n = Math.round(14 * q); i < n; i++) { const a = i / n * 6.283 + Math.random() * .3, v = r * (2.6 + Math.random());
      smoke(p[0] + Math.cos(a) * r * .2, 5, p[1] + Math.sin(a) * r * .2, Math.cos(a) * v, 8 + Math.random() * 14, Math.sin(a) * v, 1.1 + Math.random() * .8, r * .22, r * (.5 + Math.random() * .25), .45, .39, .3, .55, 0, 0, 3.2); }
    debrisAt(at(p, 12), Math.round(14 + 8 * B), 0x2a2622, 170 * Math.sqrt(B + .3), 3); debrisAt(at(p, 12), Math.round(6 + 6 * B), 0x5a554e, 140, 2); debrisAt(at(p, 14), 8, 0xff9a30, 130, 1.6);
    mkScorch(); const m = scorch[scI++ % scorch.length]; m.position.set(p[0], .95, p[1]); m.scale.set(r * 1.05, 1, r * 1.05); m.rotation.y = Math.random() * 6; m.userData.t = 0; m.material.opacity = .78; m.visible = true;
    pyre(p, .45 + B * .35, 2.5 + B * 2.5, r * .12);
  }
  // машины: 1 — дымит, 2 — сгорела (чёрная, горит), 0 — как новая
  const objCol = {};
  function darken(id) { if (objCol[id] || !objIdx[id]) return; objCol[id] = []; for (const [mesh, i] of objIdx[id]) { const c = new T.Color(); mesh.getColorAt(i, c); objCol[id].push(c.getHex()); mesh.setColorAt(i, new T.Color(0x1e1b18)); mesh.instanceColor.needsUpdate = true; } }
  function objState(id, s, objs) {
    const o = objs[id]; if (!o) return;
    if (s === 2) { darken(id); burning.set(id, { p: o.p, s, t: 0 }); }
    else if (false) { for (const [mesh, i] of objIdx[id] || []) { if (!objCol[id]) objCol[id] = []; const c = new T.Color(); mesh.getColorAt(i, c); objCol[id].push(c.getHex()); mesh.setColorAt(i, new T.Color(0x1e1b18)); mesh.instanceColor.needsUpdate = true; } burning.set(id, { p: o.p, s, t: 0 }); }
    else if (s === 1) burning.set(id, { p: o.p, s, t: 0 });
    else { const cs = objCol[id]; if (cs) (objIdx[id] || []).forEach(([mesh, i], k) => { mesh.setColorAt(i, new T.Color(cs[k])); mesh.instanceColor.needsUpdate = true; }); delete objCol[id]; burning.delete(id); }
  }
  const wobM = new T.Matrix4(), wobA = new T.Matrix4(), wobB = new T.Matrix4();
  function worldFx(dt, now, objs) {
    for (const m of debris) { if (!m.visible) continue; const u = m.userData; u.t += dt; if (u.t > 2.5) { m.visible = false; continue; } if (m.position.y > .8) { u.v.y -= 320 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; if (m.position.y < .8) { m.position.y = .8; u.v.multiplyScalar(.3); u.v.y = Math.abs(u.v.y) * .4; } } }
    for (const m of scorch) { if (!m.visible) continue; m.userData.t += dt; if (m.userData.t > 40) m.material.opacity = Math.max(0, .7 - (m.userData.t - 40) / 8); if (m.userData.t > 48) m.visible = false; }
    for (const [id, t] of wob) { const o = objs[id], k = Math.sin(t * 34) * Math.exp(-t * 7) * WOBBLY[o.type]; const nt = t + dt; if (nt > .6 || o.dead) { wob.delete(id); for (const [mesh, i, m] of objIdx[id] || []) { if (!o.dead) mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; } continue; } wob.set(id, nt);
      wobA.makeTranslation(o.p[0], 0, o.p[1]); wobB.makeTranslation(-o.p[0], 0, -o.p[1]); wobM.makeRotationAxis(new T.Vector3(o.v[0], 0, o.v[1]).normalize(), k);
      for (const [mesh, i, m] of objIdx[id] || []) { mesh.setMatrixAt(i, wobA.clone().multiply(wobM).multiply(wobB).multiply(m)); mesh.instanceMatrix.needsUpdate = true; } }
    // огонь: взрывы и горящие машины (пул языков пламени)
    let fi = 0; const put = (x, y, z, sx, sy) => { if (fi >= flames.length) return; const s = flames[fi++]; s.position.set(x, y, z); s.scale.set(sx, sy, 1); s.visible = true; };
    for (const f of fires) { f.t += dt; const k = f.t / f.life; if (k >= 1) continue; for (let i = 0; i < f.n; i++) { const a = i * 2.4, rr = f.r * .35 * Math.sqrt(k + .1) * ((i % 3) / 3 + .4); put(f.p[0] + Math.cos(a) * rr, k * 30 * (i % 2), f.p[1] + Math.sin(a) * rr, f.r * .55 * (1 - k * .6), f.r * .9 * (1 - k * .5)); } }
    for (let i = fires.length - 1; i >= 0; i--) if (fires[i].t > fires[i].life) fires.splice(i, 1);
    const srcs = [];
    for (const [id, b] of burning) { b.t += dt; if (Math.abs(b.p[0] - camP_[0]) > 900 || Math.abs(b.p[1] - camP_[1]) > 900) continue; const o = objs[id], L = o && o.type === 'bus' ? 90 : o && o.type === 'truck' ? 70 : 34, ax = o ? [Math.cos(o.a), Math.sin(o.a)] : [1, 0];
      if (b.s === 2 && b.t < 30) { const fade = b.t < 22 ? 1 : 1 - (b.t - 22) / 8; for (const [u, h, sc] of [[0, 22, 1.25], [.55, 16, 1], [-.55, 18, .9]]) srcs.push({ p: [b.p[0] + ax[0] * L * u, b.p[1] + ax[1] * L * u], h, s: sc * fade, r: 16, rate: 55, smk: u === 0 ? 7 : 0 }); }
      else if (b.s === 2 ? b.t < 90 : true) { if (Math.random() < dt * (b.s === 2 ? 3 : 2)) { const sh = b.s === 2 ? .12 : .32, a = Math.random() * 6.28; smoke(b.p[0] + Math.cos(a) * 10, 28, b.p[1] + Math.sin(a) * 10, 10, 30 + Math.random() * 20, 5, 3 + Math.random() * 2, 12, 50 + Math.random() * 30, sh, sh * .97, sh * .95, b.s === 2 ? .6 : .45, 0, 0, .3); } } }
    for (let i = pyres.length - 1; i >= 0; i--) { const y = pyres[i]; y.t += dt; if (y.t > y.life) { pyres.splice(i, 1); continue; } const k = 1 - y.t / y.life; srcs.push({ p: y.p, h: 1, s: y.s * Math.sqrt(k), r: y.r, rate: 60, smk: y.s > .5 ? 3 : 0 }); }
    // постоянные очаги: горящие остовы машин, бочки, окна сгоревших домов — только рядом с камерой, не больше 8
    let nf = 0; for (const f of fireSpots) { if (nf >= 7) break; if (Math.abs(f.p[0] - camP_[0]) > 700 || Math.abs(f.p[1] - camP_[1]) > 700) continue; const o = objs[f.id]; if (o && (o.dead && !f.win || burning.has(f.id))) continue; nf++;
      srcs.push({ p: f.p, h: f.win ? f.h : Math.max(10, f.h - 12), s: f.s * (f.win ? 1.1 : 1.45), r: f.win ? 9 : 20, rate: f.win ? 40 : 70, smk: 2.5 }); }
    for (const s of srcs) emitFire(s, dt); stepFire(dt, now); fireGlows(srcs.filter(s => s.h < 30 && s.s > .05), now);
    drawPlumes(now, objs);
    return fi;
  }
  let camP_ = [0, 0];
  // ===== настоящий огонь: частицы (одна отрисовка на все), языки поднимаются и закручиваются, цвет белый → жёлтый → оранжевый → тёмно-красный,
  // искры летят вверх, под огнём мерцает отсвет на земле =====
  const fireTex = cvTex(64, 64, g => { for (let i = 0; i < 6; i++) { const x = 32 + (Math.random() - .5) * 18, y = 34 + (Math.random() - .5) * 18, r = 14 + Math.random() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); } });
  const FPN = lowEnd ? 380 : 640, fpMesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: fireTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), FPN);
  fpMesh.setColorAt(0, new T.Color()); fpMesh.count = 0; fpMesh.frustumCulled = false; fpMesh.renderOrder = 8; scene.add(fpMesh);
  const fglow = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: null, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), 24);
  fglow.setColorAt(0, new T.Color()); fglow.count = 0; fglow.frustumCulled = false; fglow.renderOrder = 2; scene.add(fglow);
  const fps = []; for (let i = 0; i < FPN; i++) fps.push({ a: 0, l: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, e: 0, k: 0, dr: 0 });
  let fpi = 0; const _fm = new T.Matrix4(), _fv = new T.Vector3(), _fs = new T.Vector3(), _fc = new T.Color();
  const fpNext = () => { const p = fps[fpi]; fpi = (fpi + 1) % FPN; p.e = 0; p.k = 0; p.dr = 0; return p; };
  function emitFire(src, dt) { const n = src.s * src.rate * dt; let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (k-- > 0) { const p = fpNext(), a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * src.r * src.s, ember = Math.random() < .1, core = !ember && Math.random() < .3;
      p.x = src.p[0] + Math.cos(a) * r * (core ? .5 : 1); p.z = src.p[1] + Math.sin(a) * r * (core ? .5 : 1); p.y = src.h + Math.random() * 3; p.vx = (Math.random() - .5) * 10; p.vz = (Math.random() - .5) * 10; p.vy = (ember ? 70 : core ? 20 : 34) + Math.random() * 34; p.a = 0;
      p.l = ember ? 1.2 + Math.random() : core ? .3 + Math.random() * .2 : .55 + Math.random() * .55; p.s = (ember ? 1.8 : core ? 9 + Math.random() * 6 : 15 + Math.random() * 13) * src.s; p.k = ember ? 1 : 0; p.e = ember ? 1 : 0; p.c = core ? 1 : 0; }
    if (src.smk && Math.random() < dt * src.smk) { const a = Math.random() * 6.28, sh = .05 + Math.random() * .05; smoke(src.p[0] + Math.cos(a) * src.r * .5, src.h + 26 * src.s, src.p[1] + Math.sin(a) * src.r * .5, (Math.random() - .5) * 14 + 12, 45 + Math.random() * 30, (Math.random() - .5) * 14 + 6, 3.5 + Math.random() * 2, 16 * src.s, (55 + Math.random() * 40) * src.s, sh, sh * .95, sh * .92, .85, .8, 0, .3); }
    if (src.s > .7 && Math.random() < dt * 2.5 * src.s) { const p = fpNext(); p.k = 2; p.x = src.p[0]; p.z = src.p[1]; p.y = src.h + 10; const a = Math.random() * 6.28, sp = 40 + Math.random() * 90; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 120 + Math.random() * 160; p.a = 0; p.l = .8 + Math.random() * .6; p.s = 1.6 + Math.random(); p.dr = .4; } }
  function stepFire(dt, now) { let n = 0; const q = camera.quaternion;
    for (const p of fps) { if (p.a >= p.l) continue; p.a += dt; if (p.a < 0) continue;
      if (p.a >= p.l) { if (p.k === 3 && Math.random() < .3) { const sh = .1 + Math.random() * .06; smoke(p.x, p.y, p.z, p.vx * .3, 35, p.vz * .3, 1.8 + Math.random() * 1.4, p.s * .55, p.s * 1.5, sh, sh * .93, sh * .88, .8, 1, 0, .6); } continue; }
      const k = p.a / p.l;
      if (p.dr) { const f = Math.exp(-p.dr * dt); p.vx *= f; p.vz *= f; p.vy *= f; }
      if (p.k === 2) { p.vy -= 520 * dt; if (p.y < 1 && p.vy < 0) { p.y = 1; p.vy *= -.35; p.vx *= .55; p.vz *= .55; } }
      else if (p.k === 1) p.vy -= 10 * dt;
      else { p.vy += (p.k === 3 ? 70 : 34) * dt; p.vx += Math.sin(now / 160 + p.y * .12) * 30 * dt; p.vz += Math.cos(now / 190 + p.x * .1) * 26 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; let sz = p.s, sy = 1;
      if (p.k === 2) { const f = 1 - k; _fc.setRGB(2 * f, 1.45 * f, .55 * f); }
      else if (p.k === 1) { const f = 1 - k; _fc.setRGB(1.6 * f, .8 * f, .25 * f); }
      else if (p.k === 3) { const f = (k < .05 ? k / .05 : 1) * (1 - Math.pow(k, 1.6)); sz = p.s * (.55 + .9 * Math.min(1, k * 2.6)); sy = 1.1;
        if (k < .12) _fc.setRGB(1.15 * f, .95 * f, .6 * f); else if (k < .34) _fc.setRGB(1 * f, .5 * f, .13 * f); else if (k < .64) _fc.setRGB(.72 * f, .22 * f, .04 * f); else _fc.setRGB(.36 * f, .07 * f, .02 * f); }
      else { const f = k < .1 ? k / .1 : 1 - (k - .1) / .9; sz = p.s * (.55 + 1.1 * Math.sin(Math.min(1, k * 1.15) * Math.PI * .9)); sy = 1.25;
        if (p.c) _fc.setRGB(1.5 * f, 1.25 * f, .7 * f); else if (k < .22) _fc.setRGB(1 * f, .78 * f, .32 * f); else if (k < .55) _fc.setRGB(.95 * f, .4 * f, .08 * f); else _fc.setRGB(.55 * f, .12 * f, .03 * f); }
      fpMesh.setMatrixAt(n, _fm.compose(_fv.set(p.x, p.y, p.z), q, _fs.set(sz, sz * sy, 1))); fpMesh.setColorAt(n++, _fc); if (n >= FPN) break; }
    fpMesh.count = n; fpMesh.instanceMatrix.needsUpdate = true; if (n) fpMesh.instanceColor.needsUpdate = true; stepSmoke(dt); stepShock(dt); }
  // ===== дым: свои частицы (обычное смешивание, у каждой своя прозрачность), снизу подсвечен огнём =====
  const smkTex = cvTex(64, 64, g => { for (let i = 0; i < 9; i++) { const x = 18 + Math.random() * 28, y = 18 + Math.random() * 28, r = 10 + Math.random() * 14, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(.55, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); } });
  const SMN = lowEnd ? 150 : 280, smkGeo = new T.PlaneGeometry(1, 1), smkC = new T.InstancedBufferAttribute(new Float32Array(SMN * 4), 4); smkGeo.setAttribute('aC', smkC);
  const smkMesh = new T.InstancedMesh(smkGeo, new T.ShaderMaterial({ uniforms: { map: { value: smkTex } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec4 aC;varying vec4 vC;varying vec2 vU;void main(){vU=uv;vC=aC;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D map;varying vec4 vC;varying vec2 vU;void main(){float a=texture2D(map,vU).a*vC.a;if(a<.01)discard;gl_FragColor=vec4(vC.rgb,a);}' }), SMN);
  smkMesh.count = 0; smkMesh.frustumCulled = false; smkMesh.renderOrder = 7; scene.add(smkMesh);
  const smk = []; for (let i = 0; i < SMN; i++) smk.push({ a: 9, l: 0 }); let smi = 0; const _sq = new T.Quaternion(), _sz = new T.Vector3(0, 0, 1);
  function smoke(x, y, z, vx, vy, vz, l, s0, s1, r, g, b, al, warm = 0, delay = 0, dr = .4) { const p = smk[smi]; smi = (smi + 1) % SMN; Object.assign(p, { x, y, z, vx, vy, vz, l, s0, s1, r, g, b, al, warm, dr, a: -delay, rot: Math.random() * 6.28, rs: (Math.random() - .5) * .8 }); }
  function stepSmoke(dt) { let n = 0; const q = camera.quaternion, C = smkC.array;
    for (const p of smk) { if (p.a >= p.l) continue; p.a += dt; if (p.a < 0 || p.a >= p.l) continue; const k = p.a / p.l, f = Math.exp(-p.dr * dt);
      p.vx *= f; p.vz *= f; p.vy *= Math.exp(-.35 * dt); p.x += p.vx * dt + 9 * dt; p.y += p.vy * dt; p.z += p.vz * dt + 4 * dt; p.rot += p.rs * dt;
      const sz = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 2.2)), al = p.al * (k < .12 ? k / .12 : 1) * (1 - Math.pow(k, 1.4)), w = p.warm * Math.pow(Math.max(0, 1 - k * 2.2), 2);
      smkMesh.setMatrixAt(n, _fm.compose(_fv.set(p.x, p.y, p.z), _sq.copy(q).multiply(new T.Quaternion().setFromAxisAngle(_sz, p.rot)), _fs.set(sz, sz, 1)));
      C[n * 4] = p.r + (.75 - p.r) * w; C[n * 4 + 1] = p.g + (.32 - p.g) * w; C[n * 4 + 2] = p.b + (.08 - p.b) * w; C[n * 4 + 3] = al; n++; }
    smkMesh.count = n; smkMesh.instanceMatrix.needsUpdate = true; smkC.needsUpdate = true; }
  // ударная волна: светящееся кольцо по земле + мгновенный отсвет; свет взрыва на всём вокруг
  const boomL = new T.PointLight(0xffa050, 0, 560, 2); boomL.position.set(0, -999, 0); scene.add(boomL); let boomT = 9, boomI = 0;
  const shocks = []; for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.RingGeometry(.86, 1, 56).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; m.renderOrder = 3; m.userData = { t: 9 }; scene.add(m); shocks.push(m); }
  const bglow = []; let shI = 0;
  function shockAt(p, r) { const m = shocks[shI++ % shocks.length]; m.position.set(p[0], 2, p[1]); m.userData = { t: 0, r }; m.visible = true; bglow.push({ p, t: 0, r }); }
  function stepShock(dt) { boomT += dt; boomL.intensity = boomT < .45 ? boomI * Math.pow(1 - boomT / .45, 2) * (.85 + .15 * Math.random()) : 0;
    for (const m of shocks) { if (!m.visible) continue; const u = m.userData; u.t += dt; const k = u.t / .42; if (k >= 1) { m.visible = false; continue; } const R = u.r * (.3 + 1.6 * (1 - Math.pow(1 - k, 2.5))); m.scale.set(R, 1, R); m.material.opacity = .9 * (1 - k) * (1 - k); }
    for (let i = bglow.length - 1; i >= 0; i--) { bglow[i].t += dt; if (bglow[i].t > .9) bglow.splice(i, 1); } }
  // догорающие пятна: после взрыва и там, куда попал огнемёт
  const pyres = []; function pyre(p, s, life, r = 12) { if (pyres.length > 14) pyres.shift(); pyres.push({ p: [p[0], p[1]], s, life, r, t: 0 }); }
  function flameJet(from, d, end) { // струя огнемёта: языки летят вдоль ствола, растут и краснеют
    const moving = d[0] || d[1], n = moving ? 4 : 1;
    for (let i = 0; i < n; i++) { const p = fpNext(); const life = moving ? .28 + Math.random() * .16 : .5, sp = moving ? end / life * (.75 + Math.random() * .3) : 0, j = (Math.random() - .5) * .22, c = Math.cos(j), sn = Math.sin(j), dx = d[0] * c - d[1] * sn, dz = d[0] * sn + d[1] * c, st = Math.random() * 6;
      p.x = from[0] + dx * st; p.z = from[1] + dz * st; p.y = moving ? 21 : 12 + Math.random() * 10; p.vx = dx * sp + (moving ? 0 : (Math.random() - .5) * 14); p.vz = dz * sp + (moving ? 0 : (Math.random() - .5) * 14); p.vy = moving ? -6 + Math.random() * 10 : 30; p.a = 0; p.l = life; p.s = moving ? 10 + Math.random() * 10 : 11; p.dr = moving ? 1.2 : 0; }
    if (!moving && Math.random() < .25) smoke(from[0], 30, from[1], 0, 40, 0, 1.4, 6, 22, .1, .09, .08, .6, .6);
    if (moving && Math.random() < .12) pyre(add(from, d, end * (.75 + Math.random() * .25)), .35 + Math.random() * .2, 1.2 + Math.random(), 8); }
  function fireGlows(srcs, now) { if (!fglow.material.map) { fglow.material.map = glowTex; fglow.material.needsUpdate = true; } let n = 0;
    for (const b of bglow) { if (n >= 24) break; const k = 1 - b.t / .9, r = b.r * 3.2 * (.6 + .4 * k); fglow.setMatrixAt(n, _fm.compose(_fv.set(b.p[0], 1.3, b.p[1]), new T.Quaternion(), _fs.set(r, 1, r))); fglow.setColorAt(n++, _fc.setRGB(1.3 * k * k, .6 * k * k, .18 * k * k)); }
    for (const s of srcs) { if (n >= 24) break; const f = .8 + .2 * Math.sin(now / 90 + s.p[0]) + .1 * Math.sin(now / 37 + s.p[1]), r = 70 * s.s * f; fglow.setMatrixAt(n, _fm.compose(_fv.set(s.p[0], 1.2, s.p[1]), new T.Quaternion(), _fs.set(r, 1, r))); fglow.setColorAt(n++, _fc.setRGB(.55 * f, .26 * f, .06 * f)); }
    fglow.count = n; fglow.instanceMatrix.needsUpdate = true; if (n) fglow.instanceColor.needsUpdate = true; }
  // ===== постапокалипсис: завалы, мусор, трещины и ямы на асфальте, очаги огня и столбы дыма =====
  const ruinMeshes = []; let fireSpots = [], plumeSrc = [], ruinDecals = [], ruinV = 0;
  function buildRuin(objs) {
    for (const m of ruinMeshes) scene.remove(m); ruinMeshes.length = 0; fireSpots = []; plumeSrc = []; const dec = [];
    const rnd = mkRng(9137), Bl = objs.blds || [], R = () => rnd();
    const KIND = { chunk: [geo.dod, [0x8a857a, 0x6e6a62, 0x9a948a, 0x7a746a]], brick: [geo.box, [0x8a4a3a, 0x7a3e30, 0x9a5a44]], tire: [geo.cyl10, [0x1c1c1c, 0x242422]], bag: [geo.sph, [0x1e2620, 0x2a2a2a, 0x3a3428]], paper: [geo.box, [0xd8d4c8, 0xc8c0a8, 0xe8e4da]], plank: [geo.box, [0x5a4430, 0x6b5238, 0x4a3828]] }, items = {};
    for (const k in KIND) items[k] = [];
    const add_ = (k, p, y, sx, sy, sz, ry = R() * 6.28, rx = 0) => items[k].push(new T.Matrix4().compose(new T.Vector3(p[0], y, p[1]), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, 0)), new T.Vector3(sx, sy, sz)));
    const okAt = (p, r) => inMap(p, 60) && bldAt(Bl, p) < 0 && !nearObjs(objs, p, r + 30).some(o => !o.nc && !o.dead && o.type !== 'bush' && objPush(o, p, r));
    const junk = p => { const r = R(); if (r < .3) add_('paper', p, .4, 6 + R() * 4, .3, 7 + R() * 4); else if (r < .5) add_('bag', p, 3, 5, 4, 6); else if (r < .64) add_('tire', p, 1.6, 6, 3, 6, 0, R() < .3 ? 1.2 : 0); else if (r < .82) add_('plank', p, 1, 18 + R() * 10, 1.5, 4); else { add_('brick', p, 1.5, 6, 3, 3); add_('brick', add(p, [3, 4]), 1.5, 6, 3, 3); } };
    const pile = (c, n, rad) => { for (let i = 0; i < n; i++) { const q = add(c, [(R() - .5) * rad * 2, (R() - .5) * rad * 2]); if (!okAt(q, 4)) continue; const big = 1 - dist(q, c) / (rad * 1.5); if (R() < .7) { const sz = 3 + R() * 5 * Math.max(.4, big); add_('chunk', q, sz * .45 + big * 3, sz, sz * .7, sz); } else add_('brick', q, 1.5 + big * 3, 6, 3, 3, R() * 6.28, R() * .6); } dec.push([c[0], c[1], rad * 2.6, 'b2', 0x5a554c, .5, R() * 6.28, 1]); };
    // дороги: ямы, заплатки, мазут, мусор у обочин
    for (const [a, b, rw] of (streetPlan && streetPlan.segs) || []) { const d = norm(sub(b, a)), n = perp(d), L = dist(a, b), ang = Math.atan2(d[0], d[1]);
      for (let t = 20; t < L; t += 46) { const c = add(a, d, t), r = R(), q = add(c, n, (R() - .5) * (rw - 40));
        if (r < .5) { R(); R(); } // сохраняем позиции остального декора
        else if (r < .62) dec.push([q[0], q[1], 16 + R() * 18, 'hole', 0x6a6258, 1, R() * 6.28, 1]);
        else if (r < .74) dec.push([q[0], q[1], 30 + R() * 24, 'patch', 0x2e2d2a, .6, -ang + (R() - .5) * .2, .55 + R() * .4]);
        else if (r < .8) dec.push([q[0], q[1], 28 + R() * 36, 'b1', 0x0a0806, .5, R() * 6.28, .7]);
        if (R() < .4) { const e = add(c, n, (R() < .5 ? -1 : 1) * (rw / 2 + 8 + R() * 10)); if (okAt(e, 4)) junk(e); }
        if (R() < .05) { const e = add(c, n, (R() < .5 ? -1 : 1) * (rw / 2 + 14)); if (okAt(e, 12)) pile(e, 10, 14); } } }
    // дома: завалы у стен, сгоревшие — копоть вокруг, огонь в окнах и дым над крышей
    for (const b of Bl) { if (b.kind && b.kind.startsWith('ch')) continue; const burnt = b.burnt, n = burnt ? 3 : R() < .45 ? 1 : 0;
      for (let i = 0; i < n; i++) { const sx = R() < .5 ? -1 : 1, sy = R() < .5 ? -1 : 1, c = add(add(b.p, b.u, sx * (b.w / 2 + 16)), b.v, sy * (b.h / 2 * R() + 10)); pile(c, burnt ? 18 : 12, burnt ? 22 : 15); }
      if (burnt) { dec.push([b.p[0], b.p[1], Math.max(b.w, b.h) * 1.5, 'scorch', 0x16100c, .55, R() * 6.28, 1]); plumeSrc.push({ p: b.p, big: 1.3, seed: R() });
        const ws = b.walls.map(i => objs[i]).filter(o => o && o.win); for (let i = 0; i < Math.min(2, ws.length); i++) { const o = ws[Math.floor(R() * ws.length)]; fireSpots.push({ p: o.p, h: 30, n: 2, s: 1, id: o.id, win: 1 }); } } }
    // машины и бочки: сгоревшие остовы дымят, часть ещё горит
    for (const o of objs) { const wk = wreckOf(o);
      if (wk >= 2) { dec.push([o.p[0], o.p[1], 90 + R() * 30, 'scorch', 0x16100c, .7, R() * 6.28, 1]); if (rh(o.id, 12) < .45) { fireSpots.push({ p: o.p, h: wk === 3 ? 34 : 38, n: 3, s: 1.1, id: o.id }); plumeSrc.push({ p: o.p, big: 1, seed: R(), id: o.id }); } }
      else if (o.type === 'barrel' && o.fire) fireSpots.push({ p: o.p, h: 27, n: 2, s: .48, id: o.id }); }
    for (const o of objs) if (o.type === 'tree' && rh(o.id, 1) >= .38) dec.push([o.p[0] + (R() - .5) * 8, o.p[1] + (R() - .5) * 8, o.w * (1.5 + R() * .6), 'b2', [0x6a5a2a, 0x7a5a26, 0x5a5228][o.id % 3], .32, R() * 6.28, 1]); // опавшая листва
    // подпалины и мусор по всей карте
    for (let i = 0; i < 160; i++) { const p = rndMap(rnd, 120); if (bldAt(Bl, p) >= 0) continue; if (R() < .5) dec.push([p[0], p[1], 40 + R() * 90, 'scorch', 0x16100c, .45, R() * 6.28, 1]); else if (okAt(p, 5)) junk(p); }
    for (const k in KIND) { const L = items[k]; if (!L.length) continue; const mesh = new T.InstancedMesh(KIND[k][0], worldMat(), L.length); mesh.frustumCulled = false; mesh.receiveShadow = true;
      L.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new T.Color(KIND[k][1][i % KIND[k][1].length])); }); scene.add(mesh); ruinMeshes.push(mesh); }
    ruinDecals = dec.map(d => [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]]); ruinV++;
  }
  // столбы дыма: видно издалека, по 7 спрайтов на столб, не больше 5 столбов
  let plT = null; const plumeTex = () => plT || (plT = cvTex(64, 64, g => { for (let i = 0; i < 7; i++) { const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); } }));
  const plumes = []; for (let i = 0; i < 35; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: plumeTex(), color: 0x4a4440, transparent: true, depthWrite: false })); s.visible = false; s.renderOrder = 7; scene.add(s); plumes.push(s); }
  function drawPlumes(now, objs) {
    let pi = 0; const tt = now / 1000;
    for (const src of plumeSrc) { if (pi + 7 > plumes.length) break; if (Math.abs(src.p[0] - camP_[0]) > 1300 || Math.abs(src.p[1] - camP_[1]) > 1300) continue; if (src.id !== undefined && objs[src.id] && objs[src.id].dead) continue;
      for (let i = 0; i < 7; i++) { const s = plumes[pi++], ph = (tt * .09 / src.big + i / 7 + src.seed) % 1, h = 30 + ph * 300 * src.big, w = Math.pow(ph, 1.5) * 150 * src.big;
        s.position.set(src.p[0] + w * .9 + Math.sin(tt * .7 + i) * 6, h, src.p[1] - w * .4); s.scale.setScalar((34 + ph * 150) * src.big); s.material.opacity = Math.min(1, Math.min(1, ph * 6) * Math.pow(1 - ph, 1.1) * 1.3); s.material.color.setHex(ph < .12 ? 0x7a5a40 : ph < .5 ? 0x5e5854 : 0x8a847e); s.visible = true; } }
    for (; pi < plumes.length; pi++) plumes[pi].visible = false;
  }
  function killObj(id) { for (const [mesh, i] of objIdx[id] || []) { mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; } }

  // ===== персонажи: реалистичные солдаты =====
  // камуфляж: [фон, пятна...]; у каждого персонажа своя форма
  const CAMO = [
    [0x4b5320, 0x6b5a3a, 0x2f3a22, 0x1f1f1a], // лес
    [0xc2b280, 0xa08a5c, 0x8a7650, 0x6b5a3a], // пустыня
    [0x7d7f7d, 0x5a5c5a, 0x9a9c9a, 0x3a3c3a], // город
    [0x5f6b3a, 0x3d4a2a, 0x7a6a45, 0x2a2a20], // флектарн
    [0x8a7d5a, 0x6b6a45, 0x4f5a3a, 0xa89a72], // мультикам
    [0x2c2c2c, 0x363636, 0x222222, 0x404040], // чёрный
    [0x55603a, 0x55603a, 0x4c5634, 0x5c6840], // олива
    [0x3d4658, 0x2c3444, 0x4e5868, 0x232a36], // синий
    [0x6b6048, 0x4f4636, 0x857a5c, 0x3a3428], // хаки
    [0xb8bcc0, 0x8a9096, 0xd8dcdf, 0x5f666c], // зима
  ];
  const SKIN = [0xc8956c, 0xe0b48e, 0x8d5a3b, 0xd9a47e, 0x6b4430, 0xedc4a0, 0xb07850, 0xd4a07a, 0x9c6a48, 0xe5bb95];
  const camoTex = {};
  function camo(i) {
    if (camoTex[i]) return camoTex[i]; const pal = CAMO[i % CAMO.length].map(c => '#' + c.toString(16).padStart(6, '0'));
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), rnd = mkRng(31 + i * 7);
    g.fillStyle = pal[0]; g.fillRect(0, 0, 64, 64);
    for (let k = 1; k < pal.length; k++) for (let n = 0; n < 9; n++) { g.fillStyle = pal[k]; g.beginPath(); const x = rnd() * 64, y = rnd() * 64, r = 4 + rnd() * 8; for (let a = 0; a < 7; a++) { const ang = a / 7 * 6.2832, rr = r * (.6 + rnd() * .6); g.lineTo(x + Math.cos(ang) * rr * 1.4, y + Math.sin(ang) * rr); } g.fill(); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; return camoTex[i] = t;
  }
  // ===== оружие: детальные модели. Каждая пушка — одна геометрия с цветами вершин (одна отрисовка) =====
  // Оси: z — вперёд по стволу, y — вверх, x — вбок. Рукоять под правую руку около z≈0, y≈-2.6.
  const GC = { st: 0x2d3034, dk: 0x17181a, bl: 0x45494f, wd: 0x4a2a16, wd2: 0x6b4022, po: 0x2c2e2a, ol: 0x4a5431, ol2: 0x5d6b3c, tn: 0x7d6c48, br: 0xc09a45, cr: 0xa9afb5, rd: 0xa3241a, bk: 0x4f2a16, wh: 0xd4d7da };
  const GLOW_C = new T.Color(.7, 2.3, 2.7), GLOW_B = new T.Color(.8, 1.5, 2.8), GLOW_O = new T.Color(2.6, 1.3, .35), LENS = new T.Color(.25, .55, .7);
  const gcyl = {}; const cg = (seg, top = 1) => gcyl[seg + '|' + top] || (gcyl[seg + '|' + top] = new T.CylinderGeometry(top, 1, 1, seg, 1));
  const gtor = {}; const tg = (t) => gtor[t] || (gtor[t] = new T.TorusGeometry(1, t, 5, 16));
  const GMUZ = {}, gunGeos = {};
  // скруглённый куб для оружия: рёбра со скосом, чтобы детали ловили блики, а не были «кубиками»
  const gunBox = (() => { const g = new T.BoxGeometry(1, 1, 1, 3, 3, 3), P = g.attributes.position, r = .09, k = .5 - r, v = new T.Vector3(), q = new T.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); q.set(Math.max(-k, Math.min(k, v.x)), Math.max(-k, Math.min(k, v.y)), Math.max(-k, Math.min(k, v.z))); const d = v.clone().sub(q); if (d.lengthSq() > 1e-9) v.copy(q).addScaledVector(d.normalize(), r); P.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g; })();
  function gunGeo(w) {
    const L = [], H = Math.PI / 2;
    const box = (c, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => L.push([gunBox, RX(x, y, z, sx, sy, sz, rx, ry, rz), c]);
    const tube = (c, x, y, z, r, l, seg = 12, top = 1) => L.push([cg(seg, top), RX(x, y, z, r, l, r, H), c]); // вдоль z, top — радиус спереди
    const post = (c, x, y, z, r, l, seg = 10) => L.push([cg(seg), RX(x, y, z, r, l, r), c]); // вертикальный цилиндр
    const side = (c, x, y, z, r, l, seg = 12) => L.push([cg(seg), RX(x, y, z, r, l, r, 0, 0, H), c]); // цилиндр поперёк (ось x)
    const ring = (c, x, y, z, R, t = .14) => L.push([tg(t), RX(x, y, z, R, R, R), c]); // кольцо вокруг оси z
    const ball = (c, x, y, z, sx, sy = sx, sz = sx) => L.push([geo.sph, RX(x, y, z, sx, sy, sz), c]);
    const prof = (c, pts, wd, bev = .3, x = 0) => { const g = extr(pts, wd, bev, poly); g.rotateY(-H); const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * .1, U.getY(i) * .1); L.push([g, RX(x, 0, 0, 1, 1, 1), c]); }; // боковой профиль [z, y], толщина по x
    const shp = (c, fn, wd, bev = .15, x = 0, hole) => { const sh = new T.Shape(); fn(sh); if (hole) { const h = new T.Path(); hole(h); sh.holes.push(h); }
      const g = new T.ExtrudeGeometry(sh, { depth: wd, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * .8, bevelSegments: 2, curveSegments: 10 }); g.translate(0, 0, -wd / 2); g.rotateY(-H);
      const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * .1, U.getY(i) * .1); L.push([g, RX(x, 0, 0, 1, 1, 1), c]); }; // боковой профиль с кривыми [z, y]
    const PO = 0x28261d, BR = 0x4e4a44, WD = 0xe6e4da, V3 = (x, y, z) => new T.Vector3(x, y, z);
    const rod = (c, a, b, r, seg = 8) => { const m = a.clone().add(b).multiplyScalar(.5), d = b.clone().sub(a); L.push([cg(seg), new T.Matrix4().compose(m, new T.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()), V3(r, d.length(), r)), c]); };
    const guard = (z0, z1, y = -1.4, c = GC.po) => { box(c, 0, y - .9, (z0 + z1) / 2, .45, .35, z1 - z0); box(c, 0, y - .4, z1, .45, 1.2, .35); box(GC.dk, 0, y - .45, z0 + (z1 - z0) * .45, .3, 1.1, .35, .35); }; // спусковая скоба + крючок
    const grip = (c, z = 0, y = -1.2, ang = .28, len = 5, wdt = 1.9) => prof(c, [[z - 1.4, y], [z + 1.5, y], [z + 1.5 - Math.sin(ang) * len, y - len], [z - 1.6 - Math.sin(ang) * len, y - len - .2], [z - 1.9 - Math.sin(ang) * len, y - len + .8]], wdt, .35);
    let muz = 22;
    if (w === 1) { // пистолет (Glock-подобный): затвор с насечками и окном выброса, полимерная рамка, скоба, рукоять с упорами под пальцы
      shp(GC.st, sh => { sh.moveTo(-1.2, .6); sh.lineTo(7.7, .6); sh.quadraticCurveTo(8.25, .62, 8.25, 1.05); sh.lineTo(8.25, 1.8); sh.quadraticCurveTo(8.2, 2.3, 7.55, 2.35); sh.lineTo(-.85, 2.35); sh.quadraticCurveTo(-1.2, 2.33, -1.2, 2); sh.closePath(); }, 1.22, .15);
      for (let i = 0; i < 8; i++) for (const sd of [-1, 1]) box(GC.dk, sd * .77, 1.5, -.95 + i * .3, .05, 1.3, .12);
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) box(GC.dk, sd * .77, 1.5, 6.3 + i * .3, .05, 1.2, .12);
      box(GC.dk, .42, 2.36, 3.7, .74, .06, 2.5); box(BR, .3, 2.38, 3.6, .5, .05, 2.1); box(BR, .3, 2.2, 4.9, .5, .3, .2); box(GC.dk, .77, 1.95, 3, .05, .22, .9);
      tube(GC.dk, 0, 1.45, 8.31, .36, .05, 14); tube(BR, 0, 1.45, 8.29, .52, .04, 14);
      for (const sd of [-1, 1]) { box(GC.dk, sd * .32, 2.62, -.55, .28, .55, .55); box(WD, sd * .32, 2.72, -.27, .13, .13, .03); }
      box(GC.dk, 0, 2.45, -.55, 1.05, .25, .62); box(GC.dk, 0, 2.6, 7.55, .28, .5, .5); box(WD, 0, 2.7, 7.82, .12, .12, .03);
      shp(PO, sh => { sh.moveTo(4.6, .6); sh.lineTo(7.9, .6); sh.lineTo(7.9, -.2); sh.quadraticCurveTo(7.85, -.55, 7.4, -.55); sh.lineTo(4.6, -.55); sh.closePath(); }, 1.1, .14);
      for (let i = 0; i < 3; i++) box(GC.dk, 0, -.68, 5.6 + i * .62, 1.05, .08, .24);
      shp(PO, sh => { sh.moveTo(1.3, -.05); sh.lineTo(4.95, -.05); sh.lineTo(4.95, -1.3); sh.quadraticCurveTo(4.95, -2.05, 4.2, -2.05); sh.lineTo(2.1, -2.05); sh.quadraticCurveTo(1.45, -2.05, 1.25, -1.55); sh.closePath(); }, .8, .12, 0,
        h => { h.moveTo(1.62, -.42); h.quadraticCurveTo(1.62, -1.72, 2.15, -1.72); h.lineTo(4.1, -1.72); h.quadraticCurveTo(4.6, -1.72, 4.6, -1.25); h.lineTo(4.6, -.42); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(2.3, -.42); sh.quadraticCurveTo(2.95, -.85, 2.8, -1.45); sh.lineTo(2.52, -1.45); sh.quadraticCurveTo(2.62, -.95, 2.05, -.42); sh.closePath(); }, .28, .05);
      shp(PO, sh => { sh.moveTo(1.3, -.05); sh.lineTo(1.25, -1.6); sh.quadraticCurveTo(1.15, -2.3, .85, -2.45); sh.quadraticCurveTo(1.05, -3, .72, -3.5); sh.quadraticCurveTo(.85, -4.1, .45, -4.5); sh.quadraticCurveTo(.55, -5.1, .15, -5.5);
        sh.lineTo(.08, -6.2); sh.lineTo(-2.85, -5.95); sh.lineTo(-2.72, -5.55); sh.lineTo(-1.6, -1); sh.quadraticCurveTo(-1.45, -.35, -1.95, -.05); sh.quadraticCurveTo(-1.6, .2, -1, .2); sh.lineTo(-1, .6); sh.lineTo(1.3, .6); sh.closePath(); }, 1.18, .2);
      shp(GC.dk, sh => { sh.moveTo(.15, -6.15); sh.lineTo(-2.9, -5.9); sh.lineTo(-2.95, -6.35); sh.lineTo(.1, -6.6); sh.closePath(); }, 1.25, .12);
      box(GC.dk, .74, .45, 2.3, .06, .24, 1.4); box(GC.dk, .74, .1, 3.4, .05, .32, .5); box(GC.dk, .7, -.7, 1.1, .06, .42, .42);
      muz = 8.3;
    } else if (w === 8) { // револьвер (S&W 686-подобный): нержавеющая рамка, ствол с полным приливом, рифлёный барабан, курок со шпорой, деревянная рукоять
      shp(GC.cr, sh => { sh.moveTo(3.4, .3); sh.lineTo(10.2, .3); sh.lineTo(10.2, 2.25); sh.quadraticCurveTo(10.1, 2.55, 9.7, 2.55); sh.lineTo(3.4, 2.5); sh.closePath(); }, 1.2, .15);
      box(GC.cr, 0, 2.62, 6.8, .5, .2, 6.6); for (let i = 0; i < 12; i++) box(GC.st, 0, 2.74, 3.8 + i * .55, .44, .04, .18);
      shp(GC.dk, sh => { sh.moveTo(9.3, 2.6); sh.lineTo(10.05, 2.6); sh.lineTo(10.05, 3.2); sh.lineTo(9.7, 3.25); sh.closePath(); }, .32, .04); box(0xd04020, 0, 3, 9.95, .2, .3, .1);
      tube(0x050505, 0, 1.6, 10.36, .42, .04, 12); tube(GC.cr, 0, .7, 9.9, .38, .5, 10);
      tube(GC.cr, 0, 1.15, 1.5, 1.75, 3.3, 24); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; box(GC.st, Math.sin(a) * 1.72, 1.15 + Math.cos(a) * 1.72, 1.6, .5, .4, 2.3, 0, 0, -a); tube(BR, Math.sin(a + Math.PI / 6) * 1.05, 1.15 + Math.cos(a + Math.PI / 6) * 1.05, -.2, .36, .12, 10); }
      tube(GC.cr, 0, 1.15, 3.25, 1.68, .15, 24);
      shp(GC.cr, sh => { sh.moveTo(-.6, 3); sh.lineTo(3.4, 3); sh.lineTo(3.4, 2.5); sh.lineTo(3.4, -.65); sh.lineTo(2.6, -.75); sh.lineTo(-.4, -.75); sh.quadraticCurveTo(-.9, -.6, -1, .2); sh.lineTo(-1.1, 2.4); sh.quadraticCurveTo(-1, 3, -.6, 3); sh.closePath(); }, 1.3, .14, 0,
        h => { h.moveTo(-.3, 2.75); h.lineTo(3.15, 2.75); h.lineTo(3.15, -.4); h.lineTo(-.3, -.4); h.closePath(); });
      shp(GC.st, sh => { sh.moveTo(-.7, 2.2); sh.lineTo(-.3, 2.2); sh.lineTo(-.4, 3.3); sh.quadraticCurveTo(-1.2, 4, -2.1, 3.75); sh.quadraticCurveTo(-1.3, 3.4, -.9, 3); sh.closePath(); }, .55, .08);
      for (let i = 0; i < 4; i++) box(GC.dk, 0, 3.75 - i * .02, -1.4 - i * .22, .58, .05, .1);
      shp(GC.cr, sh => { sh.moveTo(.4, -.7); sh.lineTo(3, -.7); sh.quadraticCurveTo(3.4, -2.1, 2.3, -2.35); sh.lineTo(1.1, -2.35); sh.quadraticCurveTo(.3, -2.2, .4, -1.4); sh.closePath(); }, .55, .08, 0,
        h => { h.moveTo(.72, -.95); h.lineTo(2.7, -.95); h.quadraticCurveTo(2.95, -1.95, 2.25, -2.05); h.lineTo(1.15, -2.05); h.quadraticCurveTo(.68, -1.95, .72, -1.4); h.closePath(); });
      shp(GC.cr, sh => { sh.moveTo(1.3, -.75); sh.quadraticCurveTo(1.95, -1.15, 1.8, -1.85); sh.lineTo(1.5, -1.85); sh.quadraticCurveTo(1.6, -1.3, 1.05, -.75); sh.closePath(); }, .35, .05);
      shp(GC.wd2, sh => { sh.moveTo(-.95, -.3); sh.lineTo(.25, -.75); sh.quadraticCurveTo(.1, -2.2, -.2, -3.2); sh.quadraticCurveTo(-.45, -4.6, -.1, -5.9); sh.quadraticCurveTo(-1.3, -6.6, -2.7, -6.1); sh.quadraticCurveTo(-2.4, -4.3, -2.1, -2.6); sh.quadraticCurveTo(-1.8, -1.2, -.95, -.3); sh.closePath(); }, 1.6, .38);
      for (const sd of [-1, 1]) { for (let i = 0; i < 5; i++) box(GC.wd, sd * 1.15, -2.2 - i * .7, -1.1 - i * .1, .04, .08, 1.2, .2); ball(GC.cr, sd * 1.12, -3.6, -1.3, .22, .22, .08); }
      tube(GC.cr, 0, .45, 6.7, .3, 6.3, 8); tube(GC.cr, 0, .45, 9.95, .4, .3, 10);
      muz = 10.4;
    } else if (w === 2) { // автомат (АК-74): штампованная ствольная коробка, крышка с рёбрами, деревянные цевьё и приклад, изогнутый магазин
      shp(GC.st, sh => { sh.moveTo(-3, -1.3); sh.lineTo(7.4, -1.3); sh.lineTo(7.4, 1.15); sh.lineTo(-2.6, 1.15); sh.quadraticCurveTo(-3, 1.1, -3, .7); sh.closePath(); }, 2.1, .15);
      shp(GC.st, sh => { sh.moveTo(-2.7, 1.1); sh.lineTo(7.3, 1.1); sh.lineTo(7.3, 1.55); sh.quadraticCurveTo(7.2, 2.25, 6.4, 2.3); sh.lineTo(-1.4, 2.3); sh.quadraticCurveTo(-2.6, 2.25, -2.7, 1.5); sh.closePath(); }, 1.9, .2);
      for (let i = 0; i < 4; i++) box(GC.dk, 0, 2.48, -1.6 + i * .5, 1.5, .08, .16); box(GC.dk, 0, 2.2, -2.75, .7, .5, .35);
      box(0x0c0c0c, 1.12, .6, 3.6, .06, 1, 3.4); box(GC.st, 1.25, .25, 1.6, .14, .55, 5.6, .04); box(GC.st, 1.3, .3, 4.5, .2, 1.1, .5);
      box(GC.st, 0, 1.6, 7.9, 1.5, 1.4, 1.2); shp(GC.st, sh => { sh.moveTo(7.4, 2.2); sh.lineTo(9.9, 2.05); sh.lineTo(9.9, 2.4); sh.lineTo(7.4, 2.6); sh.closePath(); }, .9, .08);
      shp(GC.wd2, sh => { sh.moveTo(8.4, 1.2); sh.lineTo(14.3, 1.1); sh.lineTo(14.3, -.6); sh.quadraticCurveTo(14.2, -1.55, 13.2, -1.6); sh.quadraticCurveTo(11.3, -1.9, 9.4, -1.6); sh.quadraticCurveTo(8.4, -1.5, 8.4, -.5); sh.closePath(); }, 2.3, .3);
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) box(GC.wd, sd * 1.43, -.5, 9.8 + i * 1.4, .06, .9, .35);
      shp(GC.wd2, sh => { sh.moveTo(8.8, 1.3); sh.lineTo(14.1, 1.3); sh.quadraticCurveTo(14.2, 2.55, 13.2, 2.6); sh.lineTo(9.7, 2.6); sh.quadraticCurveTo(8.8, 2.55, 8.8, 1.3); sh.closePath(); }, 1.55, .2);
      box(GC.st, 0, 1.3, 8.6, 2.4, 2.6, .5); box(GC.st, 0, 1.3, 14.5, 2.2, 2.5, .5); tube(GC.st, 0, 2, 15.7, .5, 2.4, 10);
      shp(GC.st, sh => { sh.moveTo(14.6, .1); sh.lineTo(16.4, .1); sh.lineTo(16.4, 1.2); sh.lineTo(15.2, 2.6); sh.lineTo(14.6, 2.6); sh.closePath(); }, 1.3, .12);
      tube(GC.dk, 0, .45, 18.5, .55, 11, 12); tube(GC.dk, 0, -.55, 15.2, .25, 13, 6);
      shp(GC.st, sh => { sh.moveTo(20.6, -.4); sh.lineTo(22.3, -.4); sh.lineTo(22.3, .6); sh.lineTo(21.8, 3); sh.lineTo(21.3, 3); sh.lineTo(20.6, .7); sh.closePath(); }, 1.1, .12); box(GC.dk, 0, 3.2, 21.55, .2, .7, .25);
      tube(GC.dk, 0, .45, 25, .78, 2.8, 14); for (const sd of [-1, 1]) box(0x050505, sd * .72, .5, 24.9, .1, .55, 1.4); tube(0x050505, 0, .45, 26.41, .38, .04, 10);
      shp(0x6a3a22, sh => { sh.moveTo(4.3, -1.3); sh.lineTo(7.3, -1.3); sh.quadraticCurveTo(7.8, -5, 9.9, -8.7); sh.lineTo(7.3, -10); sh.quadraticCurveTo(5.2, -5.6, 4.3, -2.6); sh.closePath(); }, 1.7, .18);
      for (let i = 0; i < 5; i++) { const t = i / 5, z = 5.1 + t * 3.2 + t * t * 1.2, y = -2.6 - t * 6; for (const sd of [-1, 1]) box(0x5a3020, sd * .96, y, z + .5, .06, .25, 2.4, .45 + t * .25); }
      shp(GC.dk, sh => { sh.moveTo(7.3, -9.95); sh.lineTo(9.95, -8.7); sh.lineTo(9.7, -9.4); sh.lineTo(7.45, -10.5); sh.closePath(); }, 1.85, .1);
      shp(GC.st, sh => { sh.moveTo(.6, -1.25); sh.lineTo(4.4, -1.25); sh.lineTo(4.4, -1.6); sh.lineTo(1.6, -2.9); sh.quadraticCurveTo(.6, -3.1, .4, -2.4); sh.closePath(); }, .6, .08, 0, h => { h.moveTo(1.2, -1.55); h.lineTo(3.4, -1.55); h.lineTo(1.6, -2.5); h.quadraticCurveTo(1, -2.6, 1.05, -2.1); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(1.9, -1.3); sh.quadraticCurveTo(2.4, -1.75, 2.2, -2.3); sh.lineTo(2, -2.3); sh.quadraticCurveTo(2.1, -1.8, 1.6, -1.3); sh.closePath(); }, .3, .05);
      shp(0x6a3a22, sh => { sh.moveTo(-.5, -1.25); sh.lineTo(.9, -1.25); sh.quadraticCurveTo(.4, -3.3, -.6, -6.1); sh.quadraticCurveTo(-1.6, -6.5, -2.3, -6); sh.quadraticCurveTo(-1.5, -3.6, -1.6, -1.6); sh.closePath(); }, 1.6, .25);
      for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) box(0x5a3020, sd * 1, -2.3 - i * .62, -.55 - i * .2, .05, .12, 1.1, .3);
      shp(GC.wd2, sh => { sh.moveTo(-3, 1.2); sh.lineTo(-3, -1.3); sh.quadraticCurveTo(-4.5, -1.9, -6.5, -2.6); sh.quadraticCurveTo(-11, -3.6, -16.7, -4.9); sh.lineTo(-16.9, -4.8); sh.lineTo(-16.9, 1.2); sh.quadraticCurveTo(-14, 1.5, -10, 1.3); sh.quadraticCurveTo(-6, 1.15, -3, 1.2); sh.closePath(); }, 2, .4);
      shp(GC.st, sh => { sh.moveTo(-16.85, 1.25); sh.lineTo(-17.35, 1.25); sh.lineTo(-17.35, -4.95); sh.lineTo(-16.85, -4.95); sh.closePath(); }, 2.3, .12); box(GC.dk, 1.15, -1, -12, .06, .9, 2.2);
      ring(GC.st, 0, -.3, -9.5, 1.25, .12);
      muz = 26.4;
    } else if (w === 3) { // помповый дробовик (Remington 870): фрезерованная коробка, вентилируемая планка, деревянные цевьё и приклад с пистолетной шейкой
      shp(GC.st, sh => { sh.moveTo(-2.4, -1.4); sh.lineTo(5.6, -1.4); sh.lineTo(5.6, .9); sh.quadraticCurveTo(5.5, 1.75, 4.6, 1.8); sh.lineTo(-1.5, 1.8); sh.quadraticCurveTo(-2.4, 1.7, -2.4, .9); sh.closePath(); }, 2, .2);
      box(0x0c0c0c, 1.12, .55, 2.4, .06, 1.3, 3.2); box(GC.st, 1.14, -.55, 2.4, .06, .12, 6.8); box(GC.dk, 1.12, -.95, -.2, .08, .35, .35); box(GC.dk, 1.12, -.95, 1.2, .08, .35, .35);
      tube(GC.st, 0, .95, 14.2, .72, 17.2, 16); for (let i = 0; i < 16; i++) box(GC.st, 0, 1.75, 6 + i * 1.05, .3, .32, .3); box(GC.st, 0, 1.98, 14.2, .42, .1, 17); ball(WD, 0, 2.12, 22.6, .2); tube(0x050505, 0, .95, 22.81, .55, .04, 12);
      tube(GC.st, 0, -.85, 12, .66, 13, 14); tube(GC.dk, 0, -.85, 18.75, .72, .7, 14); box(GC.st, 0, .05, 18.4, .8, 1.4, .9);
      shp(GC.wd2, sh => { sh.moveTo(7.6, -.1); sh.lineTo(14.8, -.1); sh.quadraticCurveTo(15.1, -.15, 15.1, -.6); sh.lineTo(15.1, -1.45); sh.quadraticCurveTo(15, -2.05, 14.3, -2.1); sh.lineTo(8.1, -2.1); sh.quadraticCurveTo(7.6, -2.05, 7.6, -1.5); sh.closePath(); }, 2.2, .3);
      for (let i = 0; i < 9; i++) for (const sd of [-1, 1]) box(GC.wd, sd * 1.43, -1.1, 8.6 + i * .7, .07, 1.5, .22);
      shp(GC.st, sh => { sh.moveTo(-.4, -1.35); sh.lineTo(3.4, -1.35); sh.lineTo(3.4, -1.7); sh.quadraticCurveTo(3.3, -2.9, 2.1, -2.95); sh.lineTo(.6, -2.95); sh.quadraticCurveTo(-.4, -2.9, -.4, -1.9); sh.closePath(); }, .6, .08, 0, h => { h.moveTo(-.05, -1.65); h.lineTo(3.05, -1.65); h.quadraticCurveTo(3, -2.6, 2.1, -2.62); h.lineTo(.6, -2.62); h.quadraticCurveTo(-.05, -2.6, -.05, -2); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(1.3, -1.4); sh.quadraticCurveTo(1.85, -1.85, 1.6, -2.45); sh.lineTo(1.38, -2.45); sh.quadraticCurveTo(1.5, -1.9, 1, -1.4); sh.closePath(); }, .3, .05);
      shp(GC.wd2, sh => { sh.moveTo(-2.4, 1.6); sh.lineTo(-2.4, -1.4); sh.quadraticCurveTo(-1.2, -1.7, -1.3, -2.9); sh.quadraticCurveTo(-1.5, -4.4, -3.1, -4.4); sh.quadraticCurveTo(-4.2, -4.3, -4.9, -3.1); sh.quadraticCurveTo(-10, -4.3, -14.9, -5.1); sh.lineTo(-14.9, 1.1);
        sh.quadraticCurveTo(-10, 1.55, -5.5, 1.55); sh.quadraticCurveTo(-3.6, 1.6, -2.4, 1.6); sh.closePath(); }, 2.1, .4);
      shp(0x161616, sh => { sh.moveTo(-14.9, 1.25); sh.lineTo(-16, 1.3); sh.quadraticCurveTo(-16.2, -2, -15.95, -5.2); sh.lineTo(-14.9, -5.2); sh.closePath(); }, 2.4, .2);
      for (let i = 0; i < 3; i++) box(0x222222, 0, -1.9 + i * .1, -15.6 + i * .04, 2.5, .08, .9);
      muz = 22.8;
    } else if (w === 4) { // снайперская винтовка: тяжёлый рифлёный ствол с тормозом, прицел с турелями, синтетическое ложе с пистолетной рукоятью, сошки
      tube(GC.st, 0, .1, 2.3, 1.15, 9.6, 18); tube(GC.st, 0, .1, -2.75, 1.0, .9, 16, .9); box(GC.dk, 0, 1.3, 2.4, 1, .25, 9.2); for (let i = 0; i < 12; i++) box(0x101010, 0, 1.44, -1.8 + i * .75, 1.02, .08, .22);
      rod(GC.st, V3(.9, .5, -.7), V3(2.4, -.4, -1.1), .2); ball(GC.dk, 2.55, -.5, -1.15, .58, .58, .58); box(0x0c0c0c, 1.05, .55, 3.2, .06, .8, 2.6);
      tube(GC.dk, 0, .15, 17, .72, 20, 16, .78); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; box(0x101010, Math.sin(a) * .66, .15 + Math.cos(a) * .66, 15, .12, .12, 10, 0, 0, -a); }
      tube(GC.dk, 0, .15, 28.3, .82, 2.6, 16); for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) box(0x050505, sd * .72, .15, 27.6 + i * .7, .14, .5, .35); tube(0x050505, 0, .15, 29.62, .4, .04, 10);
      tube(GC.dk, 0, 3.6, 3.2, .78, 10.6, 18); tube(GC.dk, 0, 3.6, 9.9, 1.55, 3, 20, 1.18); tube(GC.dk, 0, 3.6, 12.2, 1.6, 1.6, 20); tube(LENS, 0, 3.6, 13.02, 1.42, .05, 20);
      tube(GC.dk, 0, 3.6, -2.7, 1.25, 2.4, 20, .66); tube(0x141414, 0, 3.6, -4.2, 1.3, .8, 20); tube(LENS, 0, 3.6, -4.62, .95, .04, 16);
      post(GC.dk, 0, 4.75, 3.4, .55, 1.1, 14); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; box(GC.st, Math.sin(a) * .56, 5.05, 3.4 + Math.cos(a) * .56, .1, .5, .1); }
      side(GC.dk, 1.05, 3.6, 3.4, .5, 1.1, 14); side(GC.dk, -.95, 3.6, 3.4, .42, .9, 12);
      for (const z of [0, 6.4]) { box(GC.dk, 0, 2.15, z, 1.1, 1.4, .9); ring(GC.dk, 0, 3.6, z, .9, .22); box(GC.st, .75, 2.4, z, .3, .5, .5); }
      shp(GC.tn, sh => { sh.moveTo(-2.9, 1); sh.lineTo(14.8, .85); sh.quadraticCurveTo(15.6, .7, 15.6, -.2); sh.lineTo(15.4, -1.2); sh.quadraticCurveTo(15, -1.9, 14, -1.95); sh.lineTo(4.4, -2.1); sh.lineTo(3.9, -2.4);
        sh.quadraticCurveTo(1.4, -2.4, .9, -2.9); sh.quadraticCurveTo(-.2, -4.2, -.6, -6); sh.quadraticCurveTo(-1.6, -6.5, -2.6, -6); sh.quadraticCurveTo(-3.2, -4, -3.3, -3.4); sh.quadraticCurveTo(-8, -3.2, -16.4, -4.7);
        sh.lineTo(-16.6, 1.3); sh.quadraticCurveTo(-11, 1.6, -6.5, 1.5); sh.quadraticCurveTo(-4, 1.35, -2.9, 1); sh.closePath(); }, 2.1, .38, 0,
        h => { h.moveTo(-.9, -2.2); h.quadraticCurveTo(-.5, -3.6, -1.3, -4.9); h.quadraticCurveTo(-2.2, -4.6, -2.4, -3.2); h.quadraticCurveTo(-2.1, -2.3, -.9, -2.2); h.closePath(); });
      for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) box(0x6a5c3e, sd * 1.25, -1, 6 + i * 1.3, .05, .9, .45);
      box(GC.tn, 0, 2.35, -9.6, 1.9, .6, 5.6); for (const z of [-8.2, -11]) rod(GC.cr, V3(0, 1.4, z), V3(0, 2.1, z), .18);
      shp(0x151515, sh => { sh.moveTo(-16.5, 1.35); sh.lineTo(-17.6, 1.4); sh.quadraticCurveTo(-17.8, -1.8, -17.5, -4.85); sh.lineTo(-16.4, -4.75); sh.closePath(); }, 2.3, .2);
      rod(GC.dk, V3(0, -4.4, -12.5), V3(0, -6.4, -12.6), .26); ball(GC.dk, 0, -6.5, -12.6, .4, .3, .4);
      shp(GC.dk, sh => { sh.moveTo(1.2, -2.05); sh.lineTo(4.2, -2.05); sh.lineTo(4.1, -3.6); sh.lineTo(1.4, -3.6); sh.closePath(); }, 1.5, .12); box(GC.st, 0, -3.7, 2.75, 1.6, .2, 2.9);
      shp(GC.dk, sh => { sh.moveTo(-.2, -2.1); sh.lineTo(1.1, -2.1); sh.quadraticCurveTo(1.2, -3.2, .2, -3.3); sh.quadraticCurveTo(-.4, -3.2, -.5, -2.4); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(.05, -2.4); h.lineTo(.85, -2.4); h.quadraticCurveTo(.85, -3.05, .25, -3.05); h.quadraticCurveTo(-.15, -3, -.2, -2.6); h.closePath(); });
      box(GC.dk, 0, -2.3, 13.2, 1.8, .6, 1.4); for (const sd of [-1, 1]) { rod(GC.st, V3(sd * .55, -2.55, 13), V3(sd * .55, -2.65, 21), .22); ball(GC.dk, sd * .55, -2.65, 21.2, .32, .32, .5); }
      muz = 29.8;
    } else if (w === 5) { // Узи: штампованная коробка с рёбрами, крышка с рукояткой взведения, магазин в рукояти, большая скоба, приклад
      shp(GC.st, sh => { sh.moveTo(-2.6, -1.2); sh.lineTo(8.4, -1.2); sh.lineTo(8.4, 1.5); sh.quadraticCurveTo(8.35, 1.75, 8.1, 1.75); sh.lineTo(-2.3, 1.75); sh.quadraticCurveTo(-2.6, 1.7, -2.6, 1.4); sh.closePath(); }, 2, .18);
      for (const sd of [-1, 1]) { box(GC.st, sd * 1.2, .75, 3, .1, .35, 9.8); box(GC.st, sd * 1.2, -.4, 3, .1, .35, 9.8); box(GC.dk, sd * 1.2, .18, 3, .06, .12, 10.4); }
      shp(GC.dk, sh => { sh.moveTo(-2.5, 1.7); sh.lineTo(6.6, 1.7); sh.quadraticCurveTo(7, 1.72, 7, 2.05); sh.lineTo(7, 2.25); sh.lineTo(-2.2, 2.25); sh.quadraticCurveTo(-2.5, 2.22, -2.5, 2); sh.closePath(); }, 1.9, .12);
      box(0x0c0c0c, 0, 2.3, 3, .3, .05, 7.4); box(GC.dk, 0, 2.7, 5.2, .5, .7, .9); for (let i = 0; i < 4; i++) box(GC.st, 0, 2.7, 4.85 + i * .23, .55, .72, .08);
      for (const sd of [-1, 1]) { box(GC.st, sd * .55, 2.55, -1.6, .25, .9, .6); box(GC.st, sd * .55, 2.6, 7.8, .25, 1.05, .55); } box(GC.dk, 0, 2.45, 7.8, .2, .8, .3);
      box(0x0c0c0c, 1.13, .55, 4.6, .06, 1, 2.6); box(GC.st, 1.16, 1.12, 4.6, .08, .1, 2.7);
      tube(GC.dk, 0, .3, 8.9, 1.05, 1.1, 18); for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283; box(GC.st, Math.sin(a) * 1.07, .3 + Math.cos(a) * 1.07, 8.9, .14, .14, 1.05, 0, 0, -a); }
      tube(GC.dk, 0, .3, 10.4, .5, 2.2, 12); tube(0x050505, 0, .3, 11.52, .3, .05, 10);
      shp(PO, sh => { sh.moveTo(.4, -1.2); sh.lineTo(3.9, -1.2); sh.lineTo(3.7, -7.7); sh.quadraticCurveTo(3.6, -7.95, 3.3, -7.95); sh.lineTo(.6, -7.95); sh.quadraticCurveTo(.3, -7.9, .25, -7.6); sh.closePath(); }, 2.05, .2);
      for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) box(GC.dk, sd * 1.24, -2.4 - i * .85, 2.1, .04, .1, 2.8);
      box(GC.st, 0, -3.3, .2, .9, 3.2, .5, .02); shp(GC.dk, sh => { sh.moveTo(.2, -7.95); sh.lineTo(4, -7.95); sh.lineTo(4.1, -8.55); sh.lineTo(.1, -8.55); sh.closePath(); }, 2.3, .1);
      shp(GC.st, sh => { sh.moveTo(3.9, -1.15); sh.lineTo(7.5, -1.15); sh.lineTo(7.5, -2.5); sh.quadraticCurveTo(7.5, -3, 7, -3); sh.lineTo(3.8, -3); sh.closePath(); }, .7, .1, 0,
        h => { h.moveTo(4.2, -1.45); h.lineTo(4.15, -2.7); h.lineTo(6.9, -2.7); h.quadraticCurveTo(7.2, -2.7, 7.2, -2.4); h.lineTo(7.2, -1.45); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(4.5, -1.45); sh.quadraticCurveTo(5.05, -1.9, 4.85, -2.45); sh.lineTo(4.6, -2.45); sh.quadraticCurveTo(4.7, -1.95, 4.25, -1.45); sh.closePath(); }, .3, .05);
      side(GC.dk, -1.15, -.6, 1.2, .35, .3, 10); box(GC.dk, -1.2, .9, 8.6, .1, .7, .3);
      box(GC.st, 0, .2, -3, 1.6, 1.4, .8); for (const sd of [-1, 1]) rod(GC.st, V3(sd * .95, .1, -3.1), V3(sd * .95, -1.1, -10.2), .22);
      shp(GC.st, sh => { sh.moveTo(-10, 1.1); sh.quadraticCurveTo(-10.7, -.8, -10.5, -2.9); sh.lineTo(-10.05, -2.9); sh.quadraticCurveTo(-10.2, -.8, -9.6, 1.1); sh.closePath(); }, 2.3, .12);
      muz = 11.6;
    } else if (w === 7) { // пулемёт ПКМ: штампованная коробка с заклёпками, крышка с прицелом, ствол с ручкой, скелетный приклад, патронная коробка и лента
      shp(GC.dk, sh => { sh.moveTo(-3.6, -1.6); sh.lineTo(8.6, -1.6); sh.lineTo(8.6, 1.4); sh.lineTo(-3.2, 1.4); sh.quadraticCurveTo(-3.6, 1.3, -3.6, .9); sh.closePath(); }, 2.4, .18);
      for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) ball(GC.st, sd * 1.36, .9, -2.6 + i * 2.6, .18, .18, .06);
      shp(GC.st, sh => { sh.moveTo(-3.4, 1.35); sh.lineTo(7.2, 1.35); sh.lineTo(7.2, 1.9); sh.quadraticCurveTo(7, 2.5, 6, 2.55); sh.lineTo(-2.2, 2.55); sh.quadraticCurveTo(-3.4, 2.4, -3.4, 1.8); sh.closePath(); }, 2.2, .15);
      for (let i = 0; i < 6; i++) box(0x111111, 0, 2.72, -1.8 + i * 1.3, 1.6, .06, .3); box(GC.dk, 0, 3.1, 6.6, .8, .5, 1.6); shp(GC.dk, sh => { sh.moveTo(5.8, 2.9); sh.lineTo(8, 2.9); sh.lineTo(8, 3.2); sh.lineTo(6, 3.6); sh.closePath(); }, .5, .06);
      tube(GC.dk, 0, .5, 17.5, .74, 18, 14); tube(GC.dk, 0, .5, 26.7, .95, 2.6, 12); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .4; box(0x050505, Math.sin(a) * .9, .5 + Math.cos(a) * .9, 26.8, .25, .25, 1.8, 0, 0, -a); }
      tube(GC.st, 0, -.95, 12.5, .5, 8.5, 12); box(GC.st, 0, -.2, 16.8, 1.2, 2.2, 1.1); box(GC.st, 0, -.2, 8.6, 1.4, 2.2, .8);
      shp(GC.wd2, sh => { sh.moveTo(9.6, 3.3); sh.lineTo(13.4, 3.3); sh.quadraticCurveTo(14, 3.3, 14, 3.8); sh.quadraticCurveTo(14, 4.3, 13.4, 4.3); sh.lineTo(9.6, 4.3); sh.quadraticCurveTo(9, 4.3, 9, 3.8); sh.quadraticCurveTo(9, 3.3, 9.6, 3.3); sh.closePath(); }, .9, .15);
      for (const z of [9.9, 13.1]) rod(GC.st, V3(0, 1.2, z), V3(0, 3.4, z), .26);
      shp(GC.dk, sh => { sh.moveTo(23.4, 1.1); sh.lineTo(24.6, 1.1); sh.lineTo(24.6, 2); sh.lineTo(24.2, 3.4); sh.lineTo(23.8, 3.4); sh.lineTo(23.4, 2); sh.closePath(); }, .8, .08); for (const sd of [-1, 1]) box(GC.dk, sd * .55, 2.7, 24, .15, 1.4, .6);
      for (const sd of [-1, 1]) { rod(GC.st, V3(sd * .55, -1.6, 18.8), V3(sd * .6, -1.7, 25), .22); ball(GC.dk, sd * .6, -1.7, 25.2, .3, .3, .45); } box(GC.st, 0, -1.4, 18.6, 1.5, .6, .9);
      shp(GC.wd2, sh => { sh.moveTo(-3.6, 1.2); sh.lineTo(-3.6, -1.6); sh.quadraticCurveTo(-6, -2.6, -9, -3.6); sh.quadraticCurveTo(-13, -4.8, -15.4, -5.2); sh.lineTo(-15.6, 1.4); sh.quadraticCurveTo(-10, 1.5, -3.6, 1.2); sh.closePath(); }, 1.8, .3, 0,
        h => { h.moveTo(-5.2, .2); h.lineTo(-13.6, .25); h.quadraticCurveTo(-14.2, .2, -14.2, -.5); h.lineTo(-14, -3.6); h.quadraticCurveTo(-9.6, -2.9, -6.4, -1.6); h.quadraticCurveTo(-5.2, -1.2, -5.2, .2); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(-15.4, 1.5); sh.lineTo(-16.3, 1.55); sh.lineTo(-16.2, -5.35); sh.lineTo(-15.3, -5.3); sh.closePath(); }, 2, .15);
      shp(GC.wd2, sh => { sh.moveTo(-1.3, -1.55); sh.lineTo(.3, -1.55); sh.quadraticCurveTo(0, -3.4, -1.2, -6.2); sh.quadraticCurveTo(-2.2, -6.6, -3, -6.1); sh.quadraticCurveTo(-2.1, -3.8, -2.4, -1.9); sh.closePath(); }, 1.6, .25);
      shp(GC.dk, sh => { sh.moveTo(.2, -1.55); sh.lineTo(3.4, -1.55); sh.lineTo(3.4, -1.9); sh.quadraticCurveTo(3.2, -3, 2.2, -3.05); sh.lineTo(.6, -3.05); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(.6, -1.85); h.lineTo(3, -1.85); h.quadraticCurveTo(2.9, -2.72, 2.15, -2.75); h.lineTo(.9, -2.75); h.closePath(); });
      shp(GC.ol, sh => { sh.moveTo(1.6, -2.2); sh.lineTo(7.4, -2.2); sh.lineTo(7.4, -7.6); sh.quadraticCurveTo(7.4, -8, 7, -8); sh.lineTo(2, -8); sh.quadraticCurveTo(1.6, -8, 1.6, -7.6); sh.closePath(); }, 3.4, .2, -3);
      box(GC.ol2, -3, -1.95, 4.5, 3.9, .45, 6.2); box(GC.st, -4.9, -3.6, 4.5, .25, .9, 1.8); rod(GC.st, V3(-3, -1.6, 3), V3(-3, -1.6, 6), .2); box(0xd8d0b0, -4.82, -5.2, 4.5, .06, 1.2, 3.2);
      for (let i = 0; i < 6; i++) { const t = i / 5, x = -2.4 + t * 2.4, y = -1.7 + t * 2.4, z = 3.2 + t * 1.2; rod(GC.br, V3(x - .05, y, z - 1.2), V3(x - .05, y, z + .5), .26, 8); rod(0x8a8a8a, V3(x - .05, y, z + .5), V3(x - .05, y, z + 1.1), .22, 6); box(GC.st, x, y - .25, z, .5, .12, 2.6); }
      muz = 28;
    } else if (w === 13) { // миниган: блок из 6 стволов, зажимы, корпус с мотором, рукоять сверху, гибкий рукав подачи
      tube(GC.st, 0, 0, 2.3, 2.4, 7.4, 22); for (let i = 0; i < 4; i++) ring(GC.dk, 0, 0, -.8 + i * 2, 2.42, .14); tube(GC.dk, 0, 0, -2.6, 2.6, 2, 22); tube(GC.st, 0, 0, -4, 1.8, 1, 18);
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; box(0x101010, Math.sin(a) * 2.55, Math.cos(a) * 2.55, -2.6, .3, .3, 1.8, 0, 0, -a); }
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = Math.sin(a) * 1.4, y = Math.cos(a) * 1.4; tube(GC.dk, x, y, 14.6, .4, 17.6, 10); tube(GC.st, x, y, 23.2, .48, .5, 10); tube(0x050505, x, y, 23.47, .26, .04, 8); }
      for (const z of [7, 14.5, 21.6]) { tube(GC.st, 0, 0, z, 2.1, .9, 22); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; tube(0x0a0a0a, Math.sin(a) * 1.55, Math.cos(a) * 1.55, z + .46, .3, .03, 8); } }
      tube(GC.dk, 0, 0, 14.6, .62, 17.6, 10);
      shp(GC.dk, sh => { sh.moveTo(-1, 2.5); sh.lineTo(-.4, 4.3); sh.lineTo(5.8, 4.3); sh.lineTo(6.2, 2.5); sh.lineTo(5.6, 2.5); sh.lineTo(5.2, 3.6); sh.lineTo(.2, 3.6); sh.lineTo(-.3, 2.5); sh.closePath(); }, .9, .15);
      for (let i = 0; i < 6; i++) box(0x161616, 0, 4.4, .6 + i * .7, 1, .1, .3);
      for (const sd of [-1, 1]) { box(GC.dk, sd * 1.2, -3.2, -3.4, .7, 3.4, 1.4, 0, 0, sd * .1); box(GC.rd, sd * 1.2, -1.6, -3, .5, .4, .5); }
      { const cv = new T.CatmullRomCurve3([V3(-2.4, -.6, 3), V3(-4, -1, 2), V3(-4.8, -2.8, -.5), V3(-4.2, -4.4, -2.6)]); L.push([new T.TubeGeometry(cv, 18, .75, 8), new T.Matrix4(), GC.ol2]); }
      for (let i = 0; i < 6; i++) { const p = new T.CatmullRomCurve3([V3(-2.4, -.6, 3), V3(-4, -1, 2), V3(-4.8, -2.8, -.5), V3(-4.2, -4.4, -2.6)]).getPoint(i / 6); ring(GC.dk, p.x, p.y, p.z, .82, .1); }
      shp(GC.ol, sh => { sh.moveTo(-6, -3.5); sh.lineTo(1.8, -3.5); sh.lineTo(1.8, -8.4); sh.lineTo(-6, -8.4); sh.closePath(); }, 3.6, .25, -4);
      box(GC.ol2, -4, -3.3, -2.1, 4, .5, 8.2); box(0xd8d0b0, -5.85, -6, -2.1, .06, 1.4, 3.6);
      muz = 23.5;
    } else if (w === 10) { // револьверный гранатомёт: барабан на 6 гранат, рама с планкой и коллиматором, толстый ствол, телескопический приклад
      tube(GC.ol, 0, -.4, 3, 3, 6.2, 24); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + .52, x = Math.sin(a) * 1.9, y = -.4 + Math.cos(a) * 1.9; tube(GC.dk, x, y, 6.12, .82, .1, 14); tube(GC.br, x, y, 6.15, .55, .06, 12); box(GC.ol2, Math.sin(a + .52) * 2.98, -.4 + Math.cos(a + .52) * 2.98, 3, .7, .5, 5.8, 0, 0, -(a + .52)); }
      tube(GC.dk, 0, -.4, -.25, 3.05, .5, 24); tube(GC.dk, 0, -.4, 6.35, 3.05, .4, 24); tube(GC.st, 0, -.4, 3, .6, 7.4, 12);
      tube(GC.ol2, 0, .7, 11.8, 1.42, 11.2, 20); for (let i = 0; i < 4; i++) ring(GC.dk, 0, .7, 8 + i * 2.6, 1.46, .16); tube(GC.dk, 0, .7, 17.42, 1.5, .4, 20); tube(0x050505, 0, .7, 17.64, 1.15, .04, 16);
      shp(GC.dk, sh => { sh.moveTo(-1, 2.3); sh.lineTo(16.5, 2.3); sh.lineTo(16.5, 2.75); sh.lineTo(-1, 2.75); sh.closePath(); }, 1, .1); for (let i = 0; i < 22; i++) box(0x101010, 0, 2.8, -.6 + i * .78, 1.02, .1, .26);
      for (const z of [0, 6.1]) box(GC.dk, 0, 1.7, z, 1.2, 1.6, .6);
      shp(GC.dk, sh => { sh.moveTo(7, 2.8); sh.lineTo(10.6, 2.8); sh.lineTo(10.6, 4.1); sh.quadraticCurveTo(10.6, 5.3, 9.6, 5.3); sh.lineTo(7.8, 5.3); sh.quadraticCurveTo(7, 5.3, 7, 4.3); sh.closePath(); }, 1.6, .12, 0, h => { h.moveTo(7.5, 3.3); h.lineTo(10.1, 3.3); h.lineTo(10.1, 4.6); h.lineTo(7.5, 4.6); h.closePath(); });
      box(0x3a6f5a, 0, 3.95, 9.9, 1.1, 1.1, .05); ball(new T.Color(2.6, .2, .1), 0, 3.95, 8.6, .08);
      shp(PO, sh => { sh.moveTo(10.6, -.8); sh.lineTo(12.4, -.8); sh.lineTo(12.6, -4.6); sh.quadraticCurveTo(12.4, -5.2, 11.6, -5.2); sh.quadraticCurveTo(10.8, -5.1, 10.9, -4.4); sh.closePath(); }, 1.5, .2);
      for (let i = 0; i < 4; i++) box(GC.dk, 0, -1.7 - i * .85, 12.55, 1.6, .25, .25);
      shp(PO, sh => { sh.moveTo(-2.4, -2.4); sh.lineTo(-.6, -2.4); sh.quadraticCurveTo(-.8, -4.2, -1.8, -7); sh.quadraticCurveTo(-2.8, -7.4, -3.6, -6.9); sh.quadraticCurveTo(-2.9, -4.6, -3.2, -2.8); sh.closePath(); }, 1.6, .25);
      shp(GC.dk, sh => { sh.moveTo(-.8, -2.3); sh.lineTo(2.2, -2.3); sh.quadraticCurveTo(2.2, -3.7, 1, -3.75); sh.lineTo(-.2, -3.75); sh.closePath(); }, .6, .07, 0, h => { h.moveTo(-.35, -2.6); h.lineTo(1.85, -2.6); h.quadraticCurveTo(1.8, -3.42, 1, -3.45); h.lineTo(-.1, -3.45); h.closePath(); });
      box(GC.dk, 0, -2.2, 3, 1.8, .6, 6.6);
      tube(GC.dk, 0, .2, -5.2, .75, 8.6, 12); tube(GC.st, 0, .2, -1.6, .9, 1.4, 12);
      shp(PO, sh => { sh.moveTo(-9, 1.6); sh.lineTo(-10.8, 1.7); sh.quadraticCurveTo(-11.1, -2, -10.8, -5); sh.lineTo(-9.2, -4.9); sh.quadraticCurveTo(-9.6, -1.8, -8.4, .2); sh.closePath(); }, 2.2, .25);
      muz = 17.6;
    } else if (w === 11) { // огнемёт: ствол с перфорированным кожухом, запальник с огоньком, вентиль-маховик, два баллона, шланг, манометр
      tube(GC.st, 0, 1, 12.5, .8, 15, 12); tube(GC.dk, 0, 1, 19.2, 1.5, 8.6, 20);
      for (let i = 0; i < 6; i++) for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + i * .45; tube(0x050505, Math.sin(a) * 1.5, 1 + Math.cos(a) * 1.5, 15.6 + i * 1.3, .3, .05, 8); }
      tube(GC.dk, 0, 1, 23.9, 1.2, 1.4, 16, .7); tube(0x2a1408, 0, 1, 24.62, .7, .05, 12); for (let i = 0; i < 3; i++) ring(GC.st, 0, 1, 15 + i * 4.2, 1.53, .1);
      tube(GC.st, 0, -.9, 21.8, .55, 3.2, 12); tube(GC.dk, 0, -.9, 23.5, .62, .3, 12); ball(GLOW_B, 0, -.9, 23.8, .34); ball(GLOW_O, 0, -.6, 24.4, .4, .6, .4);
      ring(GC.rd, 0, 1, 3.6, 1.5, .22); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; rod(GC.rd, V3(0, 1, 3.6), V3(Math.sin(a) * 1.45, 1 + Math.cos(a) * 1.45, 3.6), .12, 6); } tube(GC.st, 0, 1, 4.4, .6, 2, 10);
      for (const sd of [-1, 1]) { const x = sd * 1.7; tube(GC.rd, x, -4.1, 3.6, 1.6, 10.6, 20); ball(GC.rd, x, -4.1, 8.9, 1.6, 1.6, 1.1); ball(GC.rd, x, -4.1, -1.7, 1.6, 1.6, 1.1);
        for (const z of [.8, 6.2]) ring(GC.dk, x, -4.1, z, 1.63, .16); tube(GC.st, x, -4.1, 10.1, .45, .8, 10); box(0xe8e0c8, x + sd * 1.55, -4.1, 3.6, .05, 1.2, 4.6); }
      box(GC.dk, 0, -4.1, 3.6, 1.2, .9, 9.6);
      post(GC.st, 0, -1.4, 9.4, .3, 2, 8); side(GC.cr, .9, -.6, 9.4, .85, .4, 16); side(GC.wh, 1.12, -.6, 9.4, .7, .05, 16); box(GC.rd, 1.15, -.4, 9.5, .02, .55, .07, 0, 0, .7);
      { const cv = new T.CatmullRomCurve3([V3(-1.7, -5.6, -2.2), V3(-2.8, -7, -4.6), V3(-3.4, -3.6, -6.4), V3(-2.4, .4, -3.2), V3(-.9, 1, 1)]); L.push([new T.TubeGeometry(cv, 24, .48, 8), new T.Matrix4(), GC.dk]);
        for (let i = 1; i < 8; i++) { const p = cv.getPoint(i / 8); ball(GC.st, p.x, p.y, p.z, .55, .55, .55); } }
      shp(PO, sh => { sh.moveTo(-.8, .3); sh.lineTo(.8, .3); sh.quadraticCurveTo(.5, -1.8, -.6, -4.8); sh.quadraticCurveTo(-1.6, -5.2, -2.4, -4.7); sh.quadraticCurveTo(-1.6, -2.4, -1.9, -.1); sh.closePath(); }, 1.6, .25);
      shp(GC.dk, sh => { sh.moveTo(.7, .2); sh.lineTo(3.6, .2); sh.quadraticCurveTo(3.6, -1.1, 2.4, -1.2); sh.lineTo(1.1, -1.2); sh.closePath(); }, .6, .07, 0, h => { h.moveTo(1.05, -.1); h.lineTo(3.2, -.1); h.quadraticCurveTo(3.15, -.88, 2.4, -.9); h.lineTo(1.3, -.9); h.closePath(); });
      shp(PO, sh => { sh.moveTo(12.8, .1); sh.lineTo(14.6, .1); sh.lineTo(14.9, -3.6); sh.quadraticCurveTo(14.6, -4.3, 13.8, -4.3); sh.quadraticCurveTo(13, -4.2, 13.1, -3.4); sh.closePath(); }, 1.5, .2);
      muz = 24.7;
    } else if (w === 12) { // базука (РПГ-7): труба с деревянными накладками, раструб, оптика ПГО, граната ПГ-7 (точёный профиль)
      tube(GC.dk, 0, 1.5, 2.5, 1.45, 29, 22); tube(GC.st, 0, 1.5, 16.9, 1.6, .7, 22);
      tube(GC.wd2, 0, 1.5, -1, 1.78, 7.6, 22); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; box(GC.wd, Math.sin(a) * 1.8, 1.5 + Math.cos(a) * 1.8, -1, .12, .12, 7.4, 0, 0, -a); }
      for (const z of [-4.9, 2.9]) ring(GC.dk, 0, 1.5, z, 1.82, .22);
      tube(GC.dk, 0, 1.5, -14.6, 2.7, 5.2, 24, 1.45 / 2.7); tube(0x060606, 0, 1.5, -17.22, 2.48, .04, 22); ring(GC.st, 0, 1.5, -17.2, 2.68, .2); ring(GC.st, 0, 1.5, -12, 1.5, .18);
      { const lp = [[.82, 0], [.82, 1], [1.15, 1.25], [2.45, 2.2], [2.45, 4.7], [2.25, 5.5], [1.45, 8.2], [.75, 9.8], [.36, 10.6], [0, 10.95]].map(([r, y]) => new T.Vector2(r, y));
        const lt = new T.LatheGeometry(lp, 20); L.push([lt, RX(0, 1.5, 17.2, 1, 1, 1, H), GC.ol2]); ring(GC.ol, 0, 1.5, 20.6, 2.45, .1); ring(GC.ol, 0, 1.5, 21.6, 2.45, .08); tube(GC.br, 0, 1.5, 28.2, .3, .6, 8, .3); box(0x1a1a1a, 1.5, 1.5, 23, .05, 1.2, 1.4); }
      shp(GC.dk, sh => { sh.moveTo(1.4, .1); sh.lineTo(5.6, .1); sh.lineTo(5.6, -.9); sh.lineTo(1.4, -.9); sh.closePath(); }, 1.4, .12);
      shp(GC.dk, sh => { sh.moveTo(-.4, -.8); sh.lineTo(1.4, -.8); sh.quadraticCurveTo(1.1, -2.8, .1, -5.4); sh.quadraticCurveTo(-.9, -5.8, -1.7, -5.3); sh.quadraticCurveTo(-.9, -3, -1.2, -1.2); sh.closePath(); }, 1.5, .22);
      shp(GC.dk, sh => { sh.moveTo(1.3, -.8); sh.lineTo(4.4, -.8); sh.quadraticCurveTo(4.4, -2.2, 3.2, -2.25); sh.lineTo(1.7, -2.25); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(1.65, -1.1); h.lineTo(4, -1.1); h.quadraticCurveTo(3.95, -1.92, 3.2, -1.95); h.lineTo(1.9, -1.95); h.closePath(); });
      shp(GC.wd2, sh => { sh.moveTo(6.6, -.1); sh.lineTo(8.2, -.1); sh.lineTo(8.6, -4.4); sh.quadraticCurveTo(8.3, -5, 7.5, -5); sh.quadraticCurveTo(6.7, -4.9, 6.8, -4.1); sh.closePath(); }, 1.5, .22);
      box(GC.dk, -2.35, 3, 2.6, 1.4, 2.2, 4.8); tube(GC.dk, -2.35, 3.4, -.5, .55, 2.6, 14); tube(0x141414, -2.35, 3.4, -1.9, .62, .6, 14); tube(LENS, -2.35, 3.4, 5.06, .55, .05, 14); box(GC.dk, -1.4, 2.4, 2.6, 1, .6, 1.8);
      side(GC.dk, -3.1, 3.6, 2, .32, .4, 10); post(GC.dk, -2.35, 4.25, 3.4, .3, .5, 10);
      box(GC.dk, 0, 3.3, 10.6, .3, 1, .4); box(GC.dk, 0, 3.3, 4.2, .9, .9, .35); box(0x000000, 0, 3.4, 4.2, .25, .5, .37);
      for (const z of [-7, 12]) { ring(GC.st, 0, 1.5, z, 1.52, .12); box(GC.st, 1.6, 1.5, z, .2, .7, .7); }
      muz = 29.5;
    } else if (w === 14) { // арбалет (блочный): скелетное ложе, изогнутые плечи с блоками, тетива и тросы, прицел, болт с оперением
      shp(PO, sh => { sh.moveTo(-14, 1.2); sh.quadraticCurveTo(-14.3, -1.4, -13.8, -3.9); sh.lineTo(-12.6, -3.9); sh.quadraticCurveTo(-8, -2.4, -4.2, -1.6); sh.quadraticCurveTo(-3.2, -2.8, -3.1, -5.8); sh.quadraticCurveTo(-2, -6.4, -.9, -5.9);
        sh.quadraticCurveTo(-.6, -3, .4, -1.3); sh.lineTo(12.4, -1); sh.lineTo(12.4, .8); sh.lineTo(-2, 1); sh.quadraticCurveTo(-8, 1.3, -14, 1.2); sh.closePath(); }, 1.8, .3, 0,
        h => { h.moveTo(-11.8, .2); h.lineTo(-5, -.1); h.quadraticCurveTo(-5.4, -.9, -6, -1.6); h.quadraticCurveTo(-9.5, -2.4, -11.8, -2.9); h.closePath(); });
      shp(0x181818, sh => { sh.moveTo(-14, 1.3); sh.lineTo(-14.9, 1.3); sh.quadraticCurveTo(-15.1, -1.4, -14.7, -4); sh.lineTo(-13.8, -4); sh.closePath(); }, 2, .15);
      box(GC.st, 0, 1.05, 5.2, 1, .35, 14.2); box(0x101010, 0, 1.24, 5.2, .25, .05, 14); box(GC.dk, 0, 1.45, 3.2, 1.6, .9, 2.6);
      shp(GC.dk, sh => { sh.moveTo(-1, -1.2); sh.lineTo(1.8, -1.2); sh.quadraticCurveTo(1.8, -2.6, .6, -2.7); sh.lineTo(-.6, -2.7); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(-.65, -1.5); h.lineTo(1.4, -1.5); h.quadraticCurveTo(1.35, -2.35, .6, -2.4); h.lineTo(-.4, -2.4); h.closePath(); });
      box(GC.dk, 0, .5, 12.6, 3.6, 2.2, 1.6); for (const sd of [-1, 1]) { const cv = new T.QuadraticBezierCurve3(V3(sd * 1.6, .7, 12.6), V3(sd * 5.4, .7, 13.4), V3(sd * 8.8, .7, 10.4));
        L.push([new T.TubeGeometry(cv, 14, .42, 6), new T.Matrix4().makeScale(1, 1.6, 1), GC.dk]); side(GC.st, sd * 8.9, .7, 10.2, .85, .5, 16); side(GC.dk, sd * 9.2, .7, 10.2, .4, .2, 10); }
      for (const sd of [-1, 1]) { rod(0xdccfb0, V3(sd * 8.9, .9, 10.6), V3(0, 1.4, 2.9), .07, 4); rod(0x555555, V3(sd * 8.9, .5, 10), V3(-sd * 1.2, .55, 12), .05, 4); }
      { const st = new T.TorusGeometry(1.4, .18, 6, 16, Math.PI); L.push([st, RX(0, -.1, 14.2, 1, 1, 1, 0, 0, Math.PI), GC.dk]); }
      tube(GC.cr, 0, 1.75, 9.6, .17, 13.2, 6); tube(GC.dk, 0, 1.75, 16.6, .42, 1.4, 8, .05); for (let k = 0; k < 3; k++) { const a = k * 2.094; box(GC.rd, Math.sin(a) * .42, 1.75 + Math.cos(a) * .42, 3.9, .05, .8, 1.8, 0, 0, -a); } ring(GC.br, 0, 1.75, 3.1, .2, .08);
      tube(GC.dk, 0, 3.3, 1.2, .72, 7, 16); tube(GC.dk, 0, 3.3, 5, 1.05, 1.4, 16, 1.2); tube(LENS, 0, 3.3, 5.72, .95, .04, 14); tube(GC.dk, 0, 3.3, -2.6, .85, 1.2, 14); tube(LENS, 0, 3.3, -3.22, .6, .04, 12);
      for (const z of [-.4, 3]) box(GC.dk, 0, 2.25, z, .8, 1.3, .7); post(GC.dk, 0, 4.2, 1.4, .4, .7, 10);
      muz = 17.2;
    } else if (w === 15) { // обрез двустволки: горизонтальные стволы с планкой, колодка с гравировкой, внешние курки, два спуска, цевьё и обрезанная рукоять
      for (const sd of [-1, 1]) { tube(GC.st, sd * .76, .95, 8.2, .76, 10.4, 16); tube(0x050505, sd * .76, .95, 13.42, .58, .04, 14); tube(GC.st, sd * .76, .95, 13.2, .8, .3, 16); }
      box(GC.st, 0, 1.7, 8.2, .5, .25, 10.3); box(GC.st, 0, .2, 8.2, .5, .3, 10.3); ball(GC.br, 0, 1.92, 13.1, .16);
      shp(GC.cr, sh => { sh.moveTo(-.6, -.6); sh.lineTo(3, -.6); sh.lineTo(3, 1.8); sh.lineTo(.2, 1.85); sh.quadraticCurveTo(-.6, 1.8, -.7, 1.1); sh.closePath(); }, 2.1, .15);
      for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) box(0x8a8f95, sd * 1.21, .1 + (i % 3) * .55, .2 + i * .38, .03, .08, .5, i * .4);
      box(GC.cr, 0, 2.05, .9, .5, .4, 2, .25); shp(GC.wd2, sh => { sh.moveTo(3.1, .25); sh.lineTo(9.4, .25); sh.quadraticCurveTo(9.8, .2, 9.8, -.3); sh.quadraticCurveTo(9.6, -1.1, 8.8, -1.15); sh.lineTo(3.4, -1.15); sh.quadraticCurveTo(3, -1, 3.1, .25); sh.closePath(); }, 2, .25);
      for (const sd of [-1, 1]) { shp(GC.dk, sh => { sh.moveTo(-.3, 1.2); sh.lineTo(.2, 1.2); sh.lineTo(.1, 2.2); sh.quadraticCurveTo(-.4, 3.1, -1.3, 3); sh.quadraticCurveTo(-.6, 2.4, -.4, 1.9); sh.closePath(); }, .35, .06, sd * .55); }
      shp(GC.cr, sh => { sh.moveTo(.2, -.6); sh.lineTo(3, -.6); sh.quadraticCurveTo(3.2, -2, 2, -2.1); sh.lineTo(.6, -2.1); sh.quadraticCurveTo(0, -1.9, .2, -.6); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(.5, -.9); h.lineTo(2.7, -.9); h.quadraticCurveTo(2.85, -1.75, 2, -1.8); h.lineTo(.7, -1.8); h.quadraticCurveTo(.35, -1.7, .5, -.9); h.closePath(); });
      for (const z of [1.1, 1.9]) shp(GC.cr, sh => { sh.moveTo(z, -.6); sh.quadraticCurveTo(z + .5, -1, z + .3, -1.55); sh.lineTo(z + .1, -1.55); sh.quadraticCurveTo(z + .25, -1.1, z - .2, -.6); sh.closePath(); }, .25, .04);
      shp(GC.wd2, sh => { sh.moveTo(-.6, 1.6); sh.lineTo(-.6, -.6); sh.quadraticCurveTo(-1, -2, -2.2, -4); sh.quadraticCurveTo(-3.6, -4.9, -5, -4.3); sh.quadraticCurveTo(-4.6, -2.4, -3.6, -.6); sh.quadraticCurveTo(-3, .8, -3.2, 1.7); sh.quadraticCurveTo(-1.8, 1.9, -.6, 1.6); sh.closePath(); }, 1.9, .4);
      for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) box(GC.wd, sd * 1.15, -1.4 - i * .55, -2 - i * .3, .04, .08, 1.2, .5);
      muz = 13.5;
    } else if (w === 16) { // автоматический дробовик (Сайга): коробка АК, полимерное цевьё, дульный тормоз, барабан, складной скелетный приклад, коллиматор
      shp(GC.dk, sh => { sh.moveTo(-3, -1.4); sh.lineTo(8, -1.4); sh.lineTo(8, 1.3); sh.lineTo(-2.6, 1.3); sh.quadraticCurveTo(-3, 1.2, -3, .8); sh.closePath(); }, 2.3, .15);
      shp(GC.dk, sh => { sh.moveTo(-2.7, 1.25); sh.lineTo(7.9, 1.25); sh.lineTo(7.9, 1.7); sh.quadraticCurveTo(7.8, 2.4, 7, 2.45); sh.lineTo(-1.4, 2.45); sh.quadraticCurveTo(-2.6, 2.4, -2.7, 1.65); sh.closePath(); }, 2.1, .18);
      box(0x0c0c0c, 1.22, .6, 3.6, .06, 1, 3.4); box(GC.st, 1.35, .25, 1.6, .14, .55, 5.6, .04);
      box(GC.dk, 0, 2.75, 3, .9, .2, 8); for (let i = 0; i < 11; i++) box(0x101010, 0, 2.88, -1.2 + i * .82, .92, .08, .3);
      shp(GC.dk, sh => { sh.moveTo(1.2, 2.85); sh.lineTo(4.4, 2.85); sh.lineTo(4.4, 3.9); sh.quadraticCurveTo(4.3, 4.7, 3.5, 4.7); sh.lineTo(1.9, 4.7); sh.quadraticCurveTo(1.2, 4.6, 1.2, 3.9); sh.closePath(); }, 1.5, .1, 0, h => { h.moveTo(1.6, 3.2); h.lineTo(4, 3.2); h.lineTo(4, 4.3); h.lineTo(1.6, 4.3); h.closePath(); }); box(0x3a6f5a, 0, 3.75, 4.2, 1.1, 1, .05);
      shp(PO, sh => { sh.moveTo(8.6, 1.4); sh.lineTo(15, 1.3); sh.lineTo(15, -.8); sh.quadraticCurveTo(14.9, -1.7, 14, -1.7); sh.lineTo(9.6, -1.7); sh.quadraticCurveTo(8.6, -1.6, 8.6, -.6); sh.closePath(); }, 2.5, .3);
      for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) box(0x0c0c0c, sd * 1.45, 0, 9.6 + i * 1.1, .06, 1.6, .4);
      tube(GC.dk, 0, .4, 18.2, .8, 6.8, 14); tube(GC.dk, 0, .4, 22.2, 1.15, 2.4, 16); for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) box(0x050505, sd * 1, .4, 21.4 + i * .5, .3, .7, .22); tube(0x050505, 0, .4, 23.42, .6, .04, 12);
      tube(GC.st, 0, 1.9, 16.2, .45, 2, 10); box(GC.st, 0, 1.4, 17.2, 1.1, 1.4, .8);
      { const dr = new T.CylinderGeometry(4.2, 4.2, 2.9, 28); L.push([dr, RX(0, -6, 4.6, 1, 1, 1, 0, 0, H), PO]); side(GC.dk, 0, -6, 4.6, 4.25, .5, 28); side(GC.st, 0, -6, 4.6, 1.3, 3.1, 14); side(0x4a3a20, 1.5, -6, 4.6, 3.6, .02, 24);
        for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; box(GC.dk, 1.48, -6 + Math.cos(a) * 3, 4.6 + Math.sin(a) * 3, .05, .25, 1.2, a); } box(PO, 0, -1.9, 4.6, 1.6, 1.4, 3.2); }
      shp(PO, sh => { sh.moveTo(-.4, -1.35); sh.lineTo(1.2, -1.35); sh.quadraticCurveTo(.8, -3.4, -.3, -6); sh.quadraticCurveTo(-1.3, -6.4, -2.1, -5.9); sh.quadraticCurveTo(-1.2, -3.6, -1.5, -1.7); sh.closePath(); }, 1.6, .25);
      shp(GC.dk, sh => { sh.moveTo(1.1, -1.35); sh.lineTo(3.4, -1.35); sh.lineTo(3.4, -1.7); sh.lineTo(1.9, -2.8); sh.quadraticCurveTo(1.1, -2.9, .9, -2.3); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(1.45, -1.6); h.lineTo(2.9, -1.6); h.lineTo(1.9, -2.45); h.quadraticCurveTo(1.45, -2.5, 1.4, -2.1); h.closePath(); });
      shp(PO, sh => { sh.moveTo(-3, 1.1); sh.lineTo(-3, -1.3); sh.lineTo(-13, -3.8); sh.lineTo(-13.4, -3.7); sh.lineTo(-13.4, 1.4); sh.lineTo(-3, 1.1); sh.closePath(); }, 1.6, .25, 0,
        h => { h.moveTo(-4.6, .1); h.lineTo(-11.9, .4); h.lineTo(-11.9, -2.6); h.lineTo(-4.6, -.9); h.closePath(); });
      shp(0x151515, sh => { sh.moveTo(-13.4, 1.5); sh.lineTo(-14.2, 1.5); sh.lineTo(-14.2, -4); sh.lineTo(-13.4, -3.9); sh.closePath(); }, 1.9, .15);
      muz = 23.4;
    } else if (w === 17) { // плазмаган: обтекаемый корпус с панелями и стыками, светящиеся катушки и вентиляция, стеклянная энергоячейка, голографический прицел
      shp(0xb8bec6, sh => { sh.moveTo(-9, 1.4); sh.quadraticCurveTo(-9.4, -1, -8.6, -2.4); sh.lineTo(-6.4, -2.4); sh.quadraticCurveTo(-4.6, -1, -2.6, -1); sh.lineTo(6, -1.3); sh.quadraticCurveTo(11, -1, 13.6, .2); sh.quadraticCurveTo(14.6, 1.2, 13.2, 2.2);
        sh.quadraticCurveTo(8, 2.9, 3, 2.9); sh.quadraticCurveTo(-3, 2.9, -6, 2.4); sh.quadraticCurveTo(-8.6, 2.1, -9, 1.4); sh.closePath(); }, 2.2, .45);
      for (const z of [-3.6, 2.6, 8.4]) for (const sd of [-1, 1]) box(0x55606a, sd * 1.56, .9, z, .03, 3.4, .1); for (const sd of [-1, 1]) box(0x55606a, sd * 1.56, 1.8, 3, .03, .08, 16);
      box(GC.dk, 0, .5, 4.6, 3.2, 1.2, 9); for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) box(GLOW_C, sd * 1.62, .5, 1.2 + i * 1.1, .05, .7, .5);
      tube(GC.dk, 0, .6, 17.2, 1.05, 7, 18); for (let i = 0; i < 5; i++) { ring(GLOW_C, 0, .6, 14.6 + i * 1.3, 1.25, .2); ring(GC.st, 0, .6, 15.25 + i * 1.3, 1.15, .14); }
      tube(GC.st, 0, .6, 21, 1.3, .8, 18, .85); tube(GLOW_C, 0, .6, 21.42, .7, .04, 16);
      shp(GC.dk, sh => { sh.moveTo(-3.4, -1.1); sh.lineTo(-1.6, -1.1); sh.quadraticCurveTo(-1.9, -3.4, -2.8, -6); sh.quadraticCurveTo(-3.8, -6.4, -4.6, -5.9); sh.quadraticCurveTo(-3.8, -3.6, -4.2, -1.5); sh.closePath(); }, 1.6, .25);
      shp(GC.dk, sh => { sh.moveTo(-1.8, -1.1); sh.lineTo(1, -1.1); sh.quadraticCurveTo(1, -2.4, -.1, -2.5); sh.lineTo(-1.3, -2.5); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(-1.45, -1.4); h.lineTo(.6, -1.4); h.quadraticCurveTo(.55, -2.15, -.1, -2.2); h.lineTo(-1.1, -2.2); h.closePath(); });
      post(GC.dk, 0, -2.2, 4, 1.25, .6, 18); post(GLOW_C, 0, -4.1, 4, .85, 3.2, 18); post(0x8fa6b0, 0, -4.1, 4, 1.05, 3.4, 18); post(GC.dk, 0, -6, 4, 1.25, .6, 18);
      shp(GC.dk, sh => { sh.moveTo(1, 2.8); sh.lineTo(5, 2.8); sh.lineTo(5, 3.7); sh.quadraticCurveTo(4.9, 4.6, 4, 4.6); sh.lineTo(2, 4.6); sh.quadraticCurveTo(1, 4.6, 1, 3.7); sh.closePath(); }, 1.4, .1, 0, h => { h.moveTo(1.4, 3.1); h.lineTo(4.6, 3.1); h.lineTo(4.6, 4.2); h.lineTo(1.4, 4.2); h.closePath(); });
      box(new T.Color(.4, 1.4, 1.6), 0, 3.65, 4.3, .9, .9, .04);
      muz = 21.5;
    } else if (w === 18) { // рельсотрон: две направляющие с горящим каналом, кольца-ускорители, рёбра охлаждения, банки конденсаторов, кабели, прицел
      for (const y of [2.4, -1.2]) { shp(GC.dk, sh => { sh.moveTo(-.6, y - .55); sh.lineTo(26.4, y - .55); sh.lineTo(26.8, y); sh.lineTo(26.4, y + .55); sh.lineTo(-.6, y + .55); sh.closePath(); }, 1.5, .12); box(GC.cr, 0, y + (y > 0 ? -.6 : .6), 13, 1.2, .1, 26.6); }
      box(GLOW_B, 0, .6, 13.4, .45, .45, 25.4); for (let i = 0; i < 7; i++) { const z = 3 + i * 3.4; ring(GC.st, 0, .6, z, 2.45, .36); ring(GLOW_B, 0, .6, z, 2.45, .08); box(GC.st, 0, .6, z, 3.4, 4.6, .3); }
      for (let i = 0; i < 9; i++) box(GC.st, 0, 3.4, 4 + i * 2.2, 1.8, .9, .25);
      shp(0x30343a, sh => { sh.moveTo(-4.4, 3.2); sh.lineTo(1.2, 3.2); sh.lineTo(1.2, -2.2); sh.lineTo(-1.6, -2.6); sh.lineTo(-4.4, -2.6); sh.closePath(); }, 3, .35);
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const z = -3.4 + i * 1.9; post(0x3a5c8c, sd * 1.05, -3.7, z, .82, 2.6, 14); post(GC.cr, sd * 1.05, -2.35, z, .5, .15, 10); post(GC.dk, sd * 1.05, -5.05, z, .85, .12, 14); }
      for (const sd of [-1, 1]) { const cv = new T.CatmullRomCurve3([V3(sd * 1.4, -2.4, -.4), V3(sd * 2, -1.6, 2.2), V3(sd * 1.7, -.2, 4.6), V3(sd * 1.2, .4, 6)]); L.push([new T.TubeGeometry(cv, 14, .22, 6), new T.Matrix4(), sd > 0 ? GC.rd : GC.dk]); }
      shp(0x30343a, sh => { sh.moveTo(-4.4, 2.2); sh.lineTo(-4.4, -1.6); sh.quadraticCurveTo(-8, -2.4, -14, -3.8); sh.lineTo(-15, -3.8); sh.lineTo(-15, 1.4); sh.quadraticCurveTo(-9, 1.8, -4.4, 2.2); sh.closePath(); }, 2, .35, 0,
        h => { h.moveTo(-6.4, .9); h.lineTo(-12.8, .8); h.lineTo(-12.8, -2.4); h.quadraticCurveTo(-9, -1.8, -6.4, -1); h.closePath(); });
      shp(PO, sh => { sh.moveTo(-.4, -2.4); sh.lineTo(1.2, -2.4); sh.quadraticCurveTo(.9, -4.4, -.1, -7); sh.quadraticCurveTo(-1.1, -7.4, -1.9, -6.9); sh.quadraticCurveTo(-1, -4.6, -1.3, -2.8); sh.closePath(); }, 1.6, .25);
      tube(GC.dk, 0, 4.6, 1.8, .7, 6.4, 16); tube(GLOW_B, 0, 4.6, 5.02, .6, .04, 14); for (const z of [0, 3.6]) box(GC.dk, 0, 3.95, z, .7, .9, .6);
      ball(GLOW_B, 0, .6, 26.4, .75); muz = 27;
    } else if (w === 19) { // ракетница (4 трубы, как M202): короб из труб, откидная крышка, прицел, рукояти, ремни
      shp(GC.ol, sh => { sh.moveTo(-1.4, -.85); sh.lineTo(17.6, -.85); sh.lineTo(17.6, 4.05); sh.lineTo(-1.4, 4.05); sh.closePath(); }, 4.4, .35);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const x = sx * 1.12, y = 1.6 + sy * 1.12; tube(0x0a0a0a, x, y, 17.97, .92, .05, 14); tube(GC.rd, x, y, 17.4, .72, 1, 12, .35); tube(0x0a0a0a, x, y, -1.77, .92, .05, 14); }
      for (const z of [2, 9.4, 15.6]) { box(GC.ol2, 0, 1.6, z, 5.2, 5.2, .6); for (const sd of [-1, 1]) ball(GC.st, sd * 2.62, 1.6, z, .12, .25, .25); }
      for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) box(GC.ol2, sd * 2.5, -.2 + i * .9, 6, .05, .12, 6);
      shp(GC.ol2, sh => { sh.moveTo(18.1, -1); sh.lineTo(18.6, -1); sh.lineTo(18.6, 4.2); sh.lineTo(18.1, 4.2); sh.closePath(); }, 4.6, .12, 0); box(GC.dk, 0, 4.5, 17.9, 1.4, .5, .5);
      shp(GC.dk, sh => { sh.moveTo(5.8, -.85); sh.lineTo(7.6, -.85); sh.quadraticCurveTo(7.4, -3, 6.4, -5.6); sh.quadraticCurveTo(5.4, -6, 4.6, -5.5); sh.quadraticCurveTo(5.4, -3.2, 5.1, -1.2); sh.closePath(); }, 1.5, .22);
      shp(GC.dk, sh => { sh.moveTo(7.4, -.85); sh.lineTo(10, -.85); sh.quadraticCurveTo(10, -2.2, 8.8, -2.25); sh.lineTo(7.8, -2.25); sh.closePath(); }, .55, .07, 0, h => { h.moveTo(7.8, -1.15); h.lineTo(9.6, -1.15); h.quadraticCurveTo(9.55, -1.95, 8.8, -1.95); h.lineTo(8, -1.95); h.closePath(); });
      shp(GC.dk, sh => { sh.moveTo(-.2, -.85); sh.lineTo(1.5, -.85); sh.quadraticCurveTo(1.2, -3, .2, -5.6); sh.quadraticCurveTo(-.8, -6, -1.6, -5.5); sh.quadraticCurveTo(-.8, -3.2, -1.1, -1.2); sh.closePath(); }, 1.5, .22);
      box(GC.dk, -3, 2.6, 6, 1.3, 2.4, 3.6); tube(GC.dk, -3, 3, 3.4, .5, 1.8, 12); tube(LENS, -3, 3, 7.82, .5, .04, 12); box(GC.dk, -2.4, 2.6, 6, .6, 1, 2);
      rod(GC.dk, V3(0, 4.5, 5), V3(0, 5.6, 6.6), .25); rod(GC.dk, V3(0, 5.6, 6.6), V3(0, 5.6, 10.4), .3); rod(GC.dk, V3(0, 5.6, 10.4), V3(0, 4.5, 12), .25);
      box(0xd8d0b0, 2.55, 1.6, 12.6, .05, 1.6, 3.4);
      muz = 18.2;
    } else { box(GC.st, 0, 0, 3, 2.4, 3, 10); tube(GC.st, 0, .4, 12, .6, 10); }
    GMUZ[w] = muz; return mergeG(L);
  }
  const gunMat = lam(0xffffff, { vertexColors: true });
  function gunMesh(w, rar) {
    const k = w + '|' + (rar || 0); let g = gunGeos[k];
    if (!g) { const base = gunGeos[w + '|0'] || (gunGeos[w + '|0'] = gunGeo(w)); g = base;
      if (rar > 0) { g = mergeG([[base, new T.Matrix4(), 0xffffff], [geo.box, RX(0, -.2, -2.6, 2.5, .8, 1.2), new T.Color(RARITY[rar]).getHex()]]); gunGeos[k] = g; } }
    const grp = new T.Group(), m = new T.Mesh(g, gunMat); grp.add(m); grp.userData.muz = GMUZ[w] || 22; return grp;
  }
  // Один снимок на пушку. Лента показывает обычные картинки, без 3D-рендера при свайпе.
  const weaponImages = new Map(), weaponImageMaterials = new Map();
  let weaponImageScene, weaponImageCamera, weaponImageTarget;
  // иконка оружия (рендер один раз): физический материал (металл отражает студийное окружение, дерево с волокнами,
  // пластик и краска матовые), мягкий студийный свет, лёгкая перспектива, суперсэмплинг ×3, тень и светлый контур
  let weaponEnv = null;
  function weaponEnvMap() {
    if (weaponEnv) return weaponEnv;
    const es = new T.Scene(), sg = new T.SphereGeometry(50, 32, 16), cols = [], P = sg.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 50, c = new T.Color().setRGB(.06, .06, .07).lerp(new T.Color(.55, .52, .48), Math.max(0, y) ** .7).lerp(new T.Color(.18, .14, .1), Math.max(0, -y) * .6); cols.push(c.r, c.g, c.b); }
    sg.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); es.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const panel = (w, h, x, y, z, c) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(40, 18, -20, 34, 18, new T.Color(4, 3.7, 3.3)); panel(8, 50, 34, 8, -20, new T.Color(2.2, 2.4, 2.8)); panel(30, 6, 0, -20, 40, new T.Color(1.4, 1.1, .8)); panel(14, 14, -40, 4, -10, new T.Color(1.5, 1.5, 1.6));
    const pm = new T.PMREMGenerator(renderer); weaponEnv = pm.fromScene(es, .02).texture; pm.dispose(); return weaponEnv;
  }
  function weaponIconMat() {
    let m = weaponImageMaterials.get('pbr'); if (m) return m;
    m = new T.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMap: weaponEnvMap(), envMapIntensity: 1.15 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
      sh.fragmentShader = 'varying vec3 vLP;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `
          vec3 vc = vColor.rgb; float gl = max(max(vc.r, vc.g), vc.b), mn = min(min(vc.r, vc.g), vc.b), sat = gl > .001 ? (gl - mn) / gl : 0.;
          float n = sin(vLP.x * 9.1 + vLP.y * 5.3) * sin(vLP.y * 7.7 - vLP.z * 3.9) * sin(vLP.z * 6.1 + vLP.x * 2.3);
          float gM = 0., gR = .6; vec3 gE = vec3(0.), base = vc;
          if (gl > 1.05) { gE = vc * .9; base = vc * .3; gR = .4; }
          else if (vc.b > vc.r * 1.25 && sat > .25 && gl < .8) { gM = .1; gR = .05; base = vc * .6; } // линза
          else if (sat < .2) { float bright = gl; // металл: воронёная сталь, хром; тёмный пластик — чуть шероховатее
            gM = bright < .3 ? .78 : .95; gR = (bright < .3 ? .34 : .2) + n * .03; base = mix(vec3(.3, .31, .34), vec3(.86, .88, .9), smoothstep(.3, .75, bright)) * (.9 + .04 * n); }
          else if (vc.r > vc.g && vc.g > vc.b && sat > .35 && gl < .75) { // дерево: волокна вдоль ствола, лак
            float grain = sin(vLP.y * 7.5 + vLP.x * 2. + sin(vLP.z * .55 + vLP.y * 1.3) * 2.6), fine = sin(vLP.y * 31. + sin(vLP.z * 1.7) * 3.); base = vc * (.84 + .14 * grain + .05 * fine) * vec3(.8, .62, .5); gR = .4 + .08 * grain; }
          else { gR = .55 + n * .05; base = vc * (.74 + .05 * n); } // краска, ткань, резина
          diffuseColor.rgb *= base;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gR, .04, 1.);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gM;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gE;');
    };
    weaponImageMaterials.set('pbr', m); return m;
  }
  function weaponImage(id) {
    if (weaponImages.has(id)) return weaponImages.get(id);
    const OW = 640, OH = 320, SS = 2, width = OW * SS, height = OH * SS;
    if (!weaponImageTarget) {
      weaponImageTarget = new T.WebGLRenderTarget(width, height, { depthBuffer: true });
      weaponImageScene = new T.Scene();
      weaponImageScene.add(new T.HemisphereLight(0xfff1e0, 0x30343c, .25));
      const key = new T.DirectionalLight(0xfff0dc, 1.6); key.position.set(-5, 8, 4); weaponImageScene.add(key);
      const rim = new T.DirectionalLight(0xffd6a0, 1.2); rim.position.set(6, 3, -3); weaponImageScene.add(rim);
      weaponImageCamera = new T.PerspectiveCamera(16, OW / OH, 1, 2000);
    }
    const gun = gunMesh(ZW[id].m, 0), mesh = gun.children[0]; mesh.material = weaponIconMat();
    gun.rotation.set(0, 0, 0); gun.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(gun), center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
    const half = Math.max(8, Math.max(size.z * .55, size.y * 1.1)), dist = (half / 2) / Math.tan(8 * Math.PI / 180) * 1.02;
    const dir = new T.Vector3(-90, 30, 26).normalize(); weaponImageCamera.position.copy(center).addScaledVector(dir, dist); weaponImageCamera.lookAt(center); weaponImageCamera.updateProjectionMatrix();
    const currentTarget = renderer.getRenderTarget(), clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha(), pixels = new Uint8Array(width * height * 4);
    weaponImageScene.add(gun);
    try { renderer.setRenderTarget(weaponImageTarget); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(weaponImageScene, weaponImageCamera); renderer.readRenderTargetPixels(weaponImageTarget, 0, 0, width, height, pixels); }
    finally { weaponImageScene.remove(gun); renderer.setRenderTarget(currentTarget); renderer.setClearColor(clear, alpha); }
    const big = document.createElement('canvas'); big.width = width; big.height = height; const bp = big.getContext('2d'), image = bp.createImageData(width, height);
    const G = new Uint8Array(256); for (let i = 0; i < 256; i++) G[i] = Math.round(255 * Math.pow(i / 255, 1 / 1.4)); // линейный рендер → экран
    for (let y = 0; y < height; y++) { const row = (height - 1 - y) * width * 4, dst = y * width * 4; for (let x = 0; x < width * 4; x += 4) { image.data[dst + x] = G[pixels[row + x]]; image.data[dst + x + 1] = G[pixels[row + x + 1]]; image.data[dst + x + 2] = G[pixels[row + x + 2]]; image.data[dst + x + 3] = pixels[row + x + 3]; } }
    bp.putImageData(image, 0, 0);
    const canvas = document.createElement('canvas'); canvas.width = OW; canvas.height = OH; const paint = canvas.getContext('2d'); paint.imageSmoothingQuality = 'high';
    paint.save(); paint.shadowColor = 'rgba(0,0,0,.75)'; paint.shadowBlur = 16; paint.shadowOffsetY = 8; paint.drawImage(big, 0, 0, OW, OH); paint.restore();
    const sil = document.createElement('canvas'); sil.width = OW; sil.height = OH; const sp = sil.getContext('2d'); sp.drawImage(big, 0, 0, OW, OH); sp.globalCompositeOperation = 'source-in'; sp.fillStyle = '#ffe9c8'; sp.fillRect(0, 0, OW, OH);
    paint.save(); paint.globalCompositeOperation = 'destination-over'; paint.filter = 'blur(2.2px)'; paint.globalAlpha = .5; for (const [dx, dy] of [[-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4]]) paint.drawImage(sil, dx, dy); paint.restore();
    paint.drawImage(big, 0, 0, OW, OH);
    const url = canvas.toDataURL(); weaponImages.set(id, url); return url;
  }
  // головные уборы
  function hat(ch) {
    const g = new T.Group(); const m = (gg, c, x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); g.add(o); return o; };
    switch (ch % 10) {
      case 0: m(geo.dome, 0x4b5320, 0, 1, 0, 5.4, 5, 5.6); m(geo.box, 0x1a1a1a, 0, 1.6, 4.4, 6, 1.6, 1.2); break; // каска + очки
      case 1: m(geo.cyl10, 0xa08a5c, 0, 2.2, 0, 8, .6, 8); m(geo.dome, 0xa08a5c, 0, 2.2, 0, 4.8, 3.5, 4.8); break; // панама
      case 2: m(geo.sph, 0x7a1f1f, -.8, 3.4, 0, 5, 1.8, 5, 0, .25); break; // берет
      case 3: m(geo.dome, 0x2a2a2a, 0, 1.6, 0, 4.9, 3.8, 4.9); m(geo.box, 0x2a2a2a, 0, 1.8, 5, 5, .6, 4); break; // кепка
      case 4: m(geo.dome, 0xa89a72, 0, 1, 0, 5.4, 5, 5.6); for (const s of [-1, 1]) m(geo.cyl10, 0x222222, s * 4.6, -.6, 0, 1.8, 1.4, 1.8, 0, 1.57); break; // каска + наушники
      case 5: m(geo.sph, 0x1c1c1c, 0, 0, 0, 4.5, 5.3, 4.8); m(geo.box, 0xc8956c, 0, .8, 4.3, 5, 1.4, .8); break; // балаклава
      case 6: m(geo.dome, 0x55603a, 0, 1.4, 0, 4.7, 3.6, 4.8); m(geo.box, 0x55603a, 0, 1, -4.8, 1.6, 1.2, 3, .6); break; // бандана
      case 7: m(geo.dome, 0x222222, 0, 1, 0, 5.4, 5, 5.6); m(geo.box, 0x111111, 0, 4.4, 4, 3, 2.2, 2.4); m(geo.cyl10, 0x111111, 0, 4, 5.6, 1.1, 2.4, 1.1, 1.57); break; // спецназ + ПНВ
      case 8: m(geo.dome, 0x3a2a1c, 0, 1.4, -.3, 4.6, 3, 4.7); break; // короткая стрижка
      case 9: m(geo.dome, 0x6e6a64, 0, 1.6, 0, 5.2, 4.4, 5.2); m(geo.box, 0x6e6a64, 0, -1, -.5, 10, 4, 7); break; // зимняя шапка
    }
    return g;
  }
  // жители (ch 100+): одежда, головной убор, вещь в руке — характер виден сразу
  const CIV = [
    { n: 'бабушка', shirt: 0x8a3a5a, pants: 0xc9a88a, skin: 0xe8c0a0, skirt: 0x7a3050, hat: 'scarf', item: 'bag' },
    { n: 'студент', shirt: 0xf08c1e, pants: 0x3a5a9a, skin: 0xd9a47e, hat: 'capback', back: 0x2f6a40 },
    { n: 'параноик', shirt: 0x6e7a52, pants: 0x5a4a3a, skin: 0xe0b48e, hat: 'foil' },
    { n: 'бизнесмен', shirt: 0x2a2e3a, pants: 0x2a2e3a, skin: 0xc8956c, hat: 'slick', tie: 1, item: 'case' },
    { n: 'дед', shirt: 0x6a5a4a, pants: 0x4a4a52, skin: 0xe0b896, hat: 'flatcap', item: 'cane' },
    { n: 'девушка', shirt: 0xd94a8a, pants: 0xe0b48e, skin: 0xedc4a0, skirt: 0x2a2a6a, hat: 'longhair', item: 'phone' },
    { n: 'рабочий', shirt: 0xf08a24, pants: 0x3a4a6a, skin: 0xc8956c, hat: 'hardhat', item: 'wrench' },
    { n: 'качок', shirt: 0xf2f2f2, pants: 0x34343a, skin: 0xb07850, hat: 'buzz', wide: 1 },
  ];
  // члены сект (агенты и игроки): ch 120 + секта
  const CIV_S = [
    { n: 'Тапок', shirt: 0xf2f2ee, pants: 0x3a3a48, skin: 0xedc4a0, hat: 'neat', boots: 0xf08ab0, tie: 1, item: 'leaflets' },
    { n: 'Орден', shirt: 0x1c1820, pants: 0x1c1820, skin: 0xd9c0a8, skirt: 0x1c1820, long: 1, hat: 'hood', trim: 0xa01818, item: 'candle' },
    { n: 'Заговор', shirt: 0x8a7a5a, pants: 0x4a4038, skin: 0xd4a07a, skirt: 0x8a7a5a, hat: 'fedora', item: 'folder' },
    { n: 'Плакат', shirt: 0x2a6ad8, pants: 0x2a6ad8, skin: 0x9c6a48, hat: 'capyel', item: 'roll' },
  ];
  const HERO_MODELS = {
    10: { shirt: 0x4b646f, skin: 0xd2aa91, pants: 0x40474e, hat: 'darkhair', jacket: true },
    11: { shirt: 0x333136, skin: 0xc39a80, pants: 0x312e2e, hat: 'priest', wide: true, robe: true, cross: true },
    12: { shirt: 0x242c33, skin: 0xd0aa92, pants: 0x282a31, hat: 'veil', robe: true },
    13: { shirt: 0x8c664d, skin: 0xd2ac90, pants: 0x514548, hat: 'elder', jacket: true },
    14: { shirt: 0xe3d8bd, skin: 0xbe9376, pants: 0x3c6390, hat: 'redcap', tank: true, wide: true },
    15: { shirt: 0x8c3944, skin: 0xd7ad95, pants: 0x383b44, hat: 'medic', jacket: true, patch: true },
    16: { shirt: 0x456888, skin: 0xc69579, pants: 0x466381, hat: 'mechanic', jacket: true, gloves: true, wide: true }
  };
  geo.heroRobe = new T.CylinderGeometry(.36, .5, 1, 10);
  const rigidCharCache = new Map();
  function mergeRigidChar(node, skin, cloth) {
    for (const child of [...node.children]) if (child.isGroup) mergeRigidChar(child, skin, cloth);
    for (const isSkin of [false, true]) {
      const parts = node.children.filter(o => o.isMesh && !o.userData.noMerge && (o.material === skin) === isSkin);
      if ((parts.length < 2 && isSkin) || !parts.length) continue;
      parts.forEach(o => o.updateMatrix());
      const key = isSkin + '|' + parts.map(o => o.geometry.uuid + ':' + o.matrix.elements.join(',') + ':' + o.material.color.getHex()).join('|');
      let geometry = rigidCharCache.get(key);
      if (!geometry) {
        const positions = [], normals = [], colors = [];
        for (const mesh of parts) {
          const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); g.applyMatrix4(mesh.matrix);
          positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array);
          const color = isSkin ? new T.Color(0xffffff) : mesh.material.color;
          for (let i = 0; i < g.attributes.position.count; i++) colors.push(color.r, color.g, color.b);
          g.dispose();
        }
        geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere(); rigidCharCache.set(key, geometry);
      }
      parts.forEach(o => node.remove(o)); node.add(new T.Mesh(geometry, isSkin ? skin : cloth));
    }
  }
  const faceTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#604b3d'; x.fillRect(13, 14, 12, 3); x.fillRect(39, 14, 12, 3);
    x.fillStyle = '#f0e3cd'; x.fillRect(14, 21, 11, 5); x.fillRect(39, 21, 11, 5);
    x.fillStyle = '#3e4745'; x.fillRect(19, 21, 4, 5); x.fillRect(41, 21, 4, 5);
    x.strokeStyle = '#956958'; x.lineWidth = 2; x.beginPath(); x.moveTo(23, 46); x.quadraticCurveTo(32, 49, 41, 46); x.stroke(); return new T.CanvasTexture(c); })();
  // игровые герои: цельное тело со скелетом (HeroBody, src/hero.js) на тех же суставах — анимация общая
  function makeHero(ch) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    if (STYLE !== 'real') g.scale.setScalar(1.15);
    const grp = par => { const o = new T.Group(); par.add(o); return o; };
    const legR = grp(body), kneeR = grp(legR), legL = grp(body), kneeL = grp(legL), armR = grp(body), elR = grp(armR), armL = grp(body), elL = grp(armL), head = grp(body);
    const hb = HeroBody.attach(T, RAIDER_SUIT_MODEL, ch, { body, head, armR, elR, armL, elL, legR, kneeR, legL, kneeL }), gy = armR.position.y - 39;
    armR.rotation.set(-.35, 0, .12); elR.rotation.x = -1.25; armL.rotation.set(-1.0, 0, -.45); elL.rotation.set(-.5, 0, .35);
    const gunHold = grp(body); gunHold.position.set(2.6, 32.5 + gy, 8);
    const handHold = new T.Group(); handHold.position.set(0, -hb.hand, .5); handHold.rotation.x = Math.PI / 2 - .2; elR.add(handHold);
    const itemG = grp(elR), vest = grp(body); vest.visible = false; vest.position.y = gy; vest.scale.set(.8, .9, .92);
    const vp = (c, x, y, z, sx, sy, sz) => { const o = new T.Mesh(geo.box, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; vest.add(o); };
    vp(0x6b6248, 0, 31.5, .6, 14.4, 12, 9.4); for (let i = -1; i <= 1; i++) vp(0x585040, i * 4.2, 29.5, 5.6, 3.6, 4.6, 1.6);
    const shadow = new T.Mesh(new T.CircleGeometry(11, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .6; g.add(shadow);
    const m = hb.mesh.material, mats = { shirt: m, skin: m, pants: m };
    g.userData = { body, legL, legR, kneeL, kneeR, armL, armR, elL, elR, itemG, civ: false, sectLook: false, head, torso: null, vest, gunHold, handHold, gunNode: gunHold, muz: 18, gunKey: '', mats, shadow, ready: 0, fireT: 9, hero: 1, arm: hb.arm, gy };
    return g;
  }
  function makeChar(ch) {
    if (HeroBody.has(ch) && typeof RAIDER_SUIT_MODEL !== 'undefined') return makeHero(ch);
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const hero = HERO_MODELS[ch];
    const cv = hero || (ch >= CH_SECT ? CIV_S[(ch - CH_SECT) % 4] : ch >= 100 ? CIV[(ch - 100) % CIV.length] : null);
    const refined = ch === CH_SECT, rounded = refined || !cv || !!hero;
    if (STYLE !== 'real') g.scale.setScalar(1.15); // в ярких стилях люди крупнее
    const cm = camo(ch), mats = cv ? { shirt: charrable(MAT({ color: cv.shirt })), skin: charrable(MAT({ color: cv.skin })), pants: charrable(MAT({ color: cv.pants })) } : { shirt: charrable(MAT({ color: 0xffffff, map: cm })), skin: charrable(MAT({ color: SKIN[ch % 10] })), pants: charrable(MAT({ color: 0xe8e8e8, map: cm })) };
    if (refined) {
      Object.values(mats).forEach(m => m.dispose());
      mats.shirt = charrable(new T.MeshLambertMaterial({ color: 0xc9c3ae })); mats.skin = charrable(new T.MeshLambertMaterial({ color: 0xd4aa88 })); mats.pants = charrable(new T.MeshLambertMaterial({ color: 0x3d4655 }));
    }
    const part = (gg, mat, x, y, z, sx, sy, sz, par = body) => { const o = new T.Mesh(gg, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); par.add(o); return o; };
    const boot = lam(refined ? 0xc78e9d : cv && cv.boots || 0x2e241b), gear = lam(0x3b3d30), belt = lam(cv ? 0x2a2420 : 0x26261f);
    // ноги: бедро + голень (колено гнётся)
    const leg = s => { const hip = new T.Group(); hip.position.set(s * 3.1, 24, 0); body.add(hip); part(rounded ? geo.humanLimb : geo.box, mats.pants, 0, -6, 0, 5, 12, 5.6, hip);
      const knee = new T.Group(); knee.position.y = -12; hip.add(knee); part(rounded ? geo.humanLimb : geo.box, mats.pants, 0, -5.5, 0, 4.6, 11, 5.2, knee); part(refined ? geo.slipperShoe : geo.box, boot, 0, -11, 1.2, 5, 3.4, 8, knee); return [hip, knee]; };
    const [legL, kneeL] = leg(-1), [legR, kneeR] = leg(1);
    part(geo.box, belt, 0, 25, 0, 13.6, 2.4, 7.6);
    const torso = part(rounded ? geo.tailoredTorso : geo.box, mats.shirt, 0, 33, 0, cv && cv.wide ? 16 : 13, 15, cv && cv.wide ? 8.5 : 7);
    if (!cv) { part(geo.box, gear, 0, 33.5, 3.8, 9, 7, 1); for (const s of [-1, 1]) part(geo.box, gear, s * 3.8, 33.5, 0, 1.4, 15.2, 7.4); } // разгрузка — только у бойцов
    else {
      if (cv.skirt) part(geo.box, lam(cv.skirt), 0, cv.long ? 14 : 20, 0, 14, cv.long ? 24 : 12, 9); // юбка / плащ / ряса
      if (cv.tie && !refined) { part(geo.box, lam(0xf4f4f0), 0, 36, 3.6, 4, 9, .6); part(geo.box, lam(cv.n === 'Тапок' ? 0x2a50a0 : 0xc02020), 0, 34.5, 3.9, 1.4, 8, .6); }
      if (refined) {
        for (const side of [-1, 1]) part(geo.box, lam(0xe3ddcc), side * 1.9, 39.2, 3.6, 3.2, 2.8, .5).rotation.z = side * .45;
        part(geo.box, lam(0x334b66), 0, 35, 3.9, 1.3, 7, .4); part(geo.box, lam(0x334b66), 0, 39, 4, 1.8, 1.6, .5);
        part(geo.box, boot, 3.8, 35, 3.4, 2.2, 2.8, .5);
      }
      if (cv.trim) part(geo.box, lam(cv.trim), 0, 33, 3.6, 2, 15, .6);
      if (cv.back) part(geo.box, lam(cv.back), 0, 33, -5.6, 10, 12, 4);
    }
    if (hero?.robe) {
      part(geo.heroRobe, mats.shirt, 0, 16, 0, hero.wide ? 19 : 16, 29, hero.wide ? 15 : 12);
      part(geo.sph, mats.shirt, 0, 29, 1, hero.wide ? 8.3 : 6.5, 7, hero.wide ? 5.6 : 4.4);
      if (hero.cross) {
        const chain = lam(0xab8956), cross = lam(0xd1ad68);
        for (const side of [-1, 1]) part(geo.box, chain, side * 1.9, 37, 4.95, .55, 7, .7).rotation.z = -side * .52;
        part(geo.box, cross, 0, 31.4, 6.5, 1.35, 5.4, .9);
        part(geo.box, cross, 0, 32.3, 6.55, 4, 1.15, .95);
      }
    }
    if (hero?.jacket) {
      const trim = lam(hero.patch ? 0xd8b9a2 : 0xaaa59a);
      part(geo.box, trim, 0, 33, 4, .8, 13.1, .55);
      for (const side of [-1, 1]) {
        part(geo.box, trim, side * 2.3, 38.6, 3.92, 3.2, 2, .75).rotation.z = side * .28;
        part(geo.box, lam(hero.shirt), side * 3.1, 31.5, 4.05, 3, 3.7, 1.1);
      }
      if (hero.patch) {
        part(geo.box, lam(0xeadbc5), -3.8, 35.5, 4.2, 3.8, 3.6, .42);
        part(geo.box, lam(0x9e3547), -3.8, 35.5, 4.5, 2.65, .75, .28);
        part(geo.box, lam(0x9e3547), -3.8, 35.5, 4.5, .75, 2.65, .28);
      }
    }
    const vest = new T.Group(); body.add(vest); vest.visible = false; // бронежилет (если подобрал броню)
    part(geo.box, lam(0x6b6248), 0, 33, 0, 14.4, 13, 9, vest); for (let i = -1; i <= 1; i++) part(geo.box, lam(0x585040), i * 4.2, 31, 4.9, 3.6, 5, 1.6, vest);
    if (!cv) part(geo.box, gear, 0, 30, -4.6, 8, 8, 2.4); // рюкзак-подсумок сзади
    part(geo.box, mats.skin, 0, 41.5, 0, 3.4, 2.4, 3.4); // шея
    const head = new T.Group(); head.position.set(0, 46.5, 0); body.add(head);
    part(geo.sph, mats.skin, 0, 0, .3, 4.1, 4.9, 4.5, head);
    if (!rounded) part(geo.box, lam(0x1a1a1a), 0, .7, 4.1, 4.8, .9, .6, head);
    else {
      const face = part(geo.facePlane, new T.MeshLambertMaterial({ map: faceTex, transparent: true, depthWrite: false, alphaTest: .1 }), 0, .1, 4.83, 5.2, 5.2, 1, head); face.userData.noMerge = face.userData.noOutline = face.userData.noShadow = true;
      part(geo.faceDetail, mats.skin, 0, -.2, 4.7, .75, 1.1, 1, head);
      for (const side of [-1, 1]) part(geo.faceDetail, mats.skin, side * 4, -.3, .1, .7, 1.2, .7, head);
    }
    if (STYLE !== 'real') head.scale.setScalar(refined ? 1.06 : rounded ? 1.14 : 1.25);
    if (!cv) {
      head.add(hat(ch));
      if (ch === 0) part(geo.sph, lam(0x514037), 0, -2.55, 3.85, 3.15, 1.52, 1, head);
    }
    else { const hm = (gg, c, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; head.add(o); };
      ({ darkhair: () => {
          hm(geo.dome, 0x292127, 0, 1.45, -.2, 4.75, 4.25, 4.75);
          for (const side of [-1, 1]) hm(geo.sph, 0x292127, side * 3.6, -2.6, -.65, 1.45, 5.1, 2.65, side * .09);
          hm(geo.sph, 0x382c2c, 0, -3.1, -2.8, 4.2, 5.3, 1.95);
        },
        priest: () => {
          hm(geo.dome, 0x665d54, 0, 1.25, -.55, 4.5, 3.5, 4.5);
          hm(geo.sph, 0x6e665d, 0, -3.65, 3.9, 3.6, 3.65, 2.25);
          hm(geo.sph, 0x948778, 0, -2.0, 4.7, 2.2, 1.04, .8);
        },
        veil: () => {
          hm(geo.dome, 0x20262d, 0, 1.15, -.25, 5.25, 4.9, 5.2);
          hm(geo.box, 0x20262d, 0, -2.5, -2.65, 10, 11, 5);
          for (const side of [-1, 1]) hm(geo.sph, 0x30383e, side * 4.15, -2, 1.7, 1.08, 5.55, 2.55);
          hm(geo.box, 0xa7a6a0, 0, 2.1, 4.15, 7.7, .67, .8);
        },
        elder: () => {
          hm(geo.dome, 0xa59077, 0, 1.25, -.5, 5.03, 4, 4.9);
          for (const side of [-1, 1]) {
            hm(geo.sph, 0xa48871, side * 3.85, -.9, 1.05, 1.32, 3.9, 2.6);
            hm(geo.sph, 0x8c6158, side * 3.45, 1.7, 2.85, 1.0, 1.0, .5);
            hm(geo.sph, 0x8c6a56, side * 1.8, -.7, 4.1, 1.1, .28, .43);
          }
          hm(geo.sph, 0xa59077, 0, -4.4, 1.75, 2.15, 2.0, 1.75);
        },
        redcap: () => {
          hm(geo.dome, 0xa63434, 0, 1.6, 0, 4.95, 3.8, 4.9);
          hm(geo.box, 0x963136, 0, 1.8, 5.1, 6.35, .8, 4.8);
        },
        medic: () => {
          hm(geo.dome, 0x713f30, 0, 1.55, -.45, 4.75, 4.05, 4.85);
          hm(geo.sph, 0x784836, -2.65, .75, 1.7, 2, 3.3, 2.4);
        },
        mechanic: () => {
          hm(geo.dome, 0x554136, 0, 1.35, -.5, 4.4, 3.4, 4.65);
          hm(geo.sph, 0x54413c, 0, -2.3, 3.9, 2.9, 1.6, 1.05);
        },
        scarf: () => { hm(geo.dome, 0xd8a23a, 0, .6, -.2, 4.8, 4.6, 5); hm(geo.box, 0xd8a23a, 0, -4.4, 2.6, 2.4, 2, 1.6); },
        capback: () => { hm(geo.dome, 0xd23a3a, 0, 1.6, 0, 4.9, 3.8, 4.9); hm(geo.box, 0xd23a3a, 0, 1.8, -5, 5, .6, 4); },
        foil: () => hm(geo.cone7, 0xdfe3e8, 0, 6, 0, 4.4, 9, 4.4),
        slick: () => hm(geo.dome, 0x1e1a16, 0, 1.4, -.4, 4.6, 3.2, 4.8),
        neat: () => hm(geo.dome, refined ? 0x5e4935 : 0x6a4a2a, 0, refined ? 1.9 : 1.4, refined ? -.45 : -.3, refined ? 4.35 : 4.6, refined ? 3.3 : 3.2, refined ? 4.6 : 4.7),
        hood: () => { hm(geo.dome, 0x1c1820, 0, .4, -.6, 5.4, 5.8, 5.6); hm(geo.box, 0x1c1820, 0, -2, -3.5, 9, 6, 4); },
        fedora: () => { hm(geo.cyl10, 0x3a3228, 0, 3, 0, 7, .6, 7); hm(geo.cyl10, 0x3a3228, 0, 5, 0, 4.4, 4, 4.4); hm(geo.box, 0x1a1a1a, 0, 3.6, 0, 9, 1, 9); },
        capyel: () => { hm(geo.dome, 0xffd43b, 0, 1.6, 0, 4.9, 3.8, 4.9); hm(geo.box, 0xffd43b, 0, 1.8, 5, 5, .6, 4); },
        flatcap: () => { hm(geo.dome, 0x5a5048, 0, 1.8, 0, 4.9, 3, 5.2); hm(geo.box, 0x5a5048, 0, 2.2, 4.4, 5.4, .6, 3); hm(geo.box, 0xd8d8d8, 0, -2.6, 3.8, 3, 1.6, 1); },
        longhair: () => { hm(geo.dome, 0x7a4a24, 0, 1.2, -.3, 4.7, 4, 4.9); hm(geo.box, 0x7a4a24, 0, -3.5, -2.8, 8, 8, 3); },
        hardhat: () => { hm(geo.dome, 0xffc61a, 0, 1.6, 0, 5.2, 4.4, 5.4); hm(geo.cyl10, 0xffc61a, 0, 1.4, .4, 6.4, .6, 6.6); },
        buzz: () => hm(geo.dome, 0x2a2018, 0, 1.6, -.2, 4.4, 2.4, 4.6) })[cv.hat](); }
    // руки: плечо + предплечье, держат оружие двумя руками
    const arm = s => { const sh = new T.Group(); sh.position.set(s * 8.2, 39, 0); body.add(sh); part(rounded ? geo.humanLimb : geo.box, mats.shirt, 0, -4.8, 0, 3.8, 9.6, 3.8, sh);
      const el = new T.Group(); el.position.y = -9.4; sh.add(el); part(rounded ? geo.humanLimb : geo.box, mats.shirt, 0, -4.2, 0, 3.4, 8.4, 3.4, el); part(refined ? geo.faceDetail : geo.box, refined ? mats.skin : lam(0x2a2a24), 0, -9.2, 0, refined ? 1.5 : 3, refined ? 2 : 2.6, refined ? 1.4 : 3, el); return [sh, el]; };
    const [armL, elL] = arm(-1), [armR, elR] = arm(1);
    if (hero?.tank) for (const joint of [armL, elL, armR, elR]) joint.children.find(o => o.isMesh).material = mats.skin;
    if (hero?.gloves) for (const joint of [elL, elR]) joint.children.filter(o => o.isMesh).at(-1).material = lam(0x82654e);
    armR.rotation.set(-.35, 0, .12); elR.rotation.x = -1.25;
    armL.rotation.set(-1.0, 0, -.45); elL.rotation.set(-.5, 0, .35);
    const gunHold = new T.Group(); gunHold.position.set(2.6, 32.5, 8); body.add(gunHold);
    const handHold = new T.Group(); handHold.position.set(0, -9.4, .6); handHold.rotation.x = Math.PI / 2 - .2; elR.add(handHold); // пистолет — в правой руке
    const itemG = new T.Group(); elR.add(itemG);
    if (cv && !hero) { // жители без оружия: руки вниз, в руке — своя вещь
      armL.rotation.set(0, 0, -.12); elL.rotation.set(-.25, 0, 0); armR.rotation.set(-.2, 0, .12); elR.rotation.x = -.5;
      const it = (gg, c, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; itemG.add(o); };
      const items = { bag: () => it(geo.box, 0x4a2e1e, 0, -12, 0, 3, 7, 7), case: () => it(geo.box, 0x2a1e14, 0, -13, 0, 2.6, 8, 10), leaflets: () => it(geo.box, 0xfafafa, 0, -10, 2.5, 5, 1.6, 6.5), candle: () => { it(geo.cyl6, 0xf2e6c0, 0, -8, 3, 1, 6, 1); it(geo.sph, 0xffb020, 0, -4.4, 3, 1, 1.6, 1); }, folder: () => it(geo.box, 0xc9a85a, 0, -10, 2.5, 1.4, 8, 6), roll: () => it(geo.cyl10, 0xf6f6f2, 0, -9, 3, 1.6, 14, 1.6, 1.4), cane: () => it(geo.cyl6, 0x4a3020, 0, -14, 1.5, .8, 22, .8), phone: () => it(geo.box, 0x1a1a1a, 0, -10, 2, 2.6, 1, 4.6), wrench: () => it(geo.box, 0x8a9096, 0, -12, 1, 1.4, 10, 1.6) };
      if (cv.item) items[cv.item](); }
    const shadow = new T.Mesh(new T.CircleGeometry(11, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .6; g.add(shadow);
    if (refined) {
      const cloth = charrable(new T.MeshLambertMaterial({ vertexColors: true })), shirt = mats.shirt, pants = mats.pants;
      mergeRigidChar(body, mats.skin, cloth); mats.shirt = mats.pants = cloth; shirt.dispose(); pants.dispose();
      head.traverse(o => { if (o.isMesh) o.userData.noOutline = true; });
    }
    body.traverse(o => { if (o.isMesh) o.castShadow = !o.userData.noShadow; }); if (STYLE === 'toon') { const ms = []; body.traverse(o => { if (o.isMesh && !o.userData.noOutline) ms.push(o); }); ms.forEach(o => addOutline(o, refined ? OUT_P : OUT_C)); }
    g.userData = { body, legL, legR, kneeL, kneeR, armL, armR, elL, elR, itemG, civ: !!cv && !hero, sectLook: ch >= CH_SECT, head, torso, vest, gunHold, handHold, gunNode: gunHold, muz: 18, gunKey: '', mats, shadow, ready: 0, fireT: 9 };
    return g;
  }
  const ONEH = w => w === 1 || w === 8; // пистолет, револьвер — одной рукой
  function setGun(c, wb) {
    const u = c.userData; if (u.gunKey === wb) return; u.gunKey = wb;
    u.gunHold.clear(); u.handHold.clear(); const w = wb & 31;
    if (u.civ) u.itemG.visible = !w; // житель взял оружие — вещь убираем
    if (w) { const gm = gunMesh(w, wb >> 5); gm.traverse(o => { if (o.isMesh) o.castShadow = true; });
      if (ONEH(w)) { gm.position.set(0, 2.2, -.6); u.handHold.add(gm); u.gunNode = u.handHold; u.muz = gm.userData.muz + 1.5; } else { u.gunHold.add(gm); u.gunNode = u.gunHold; u.muz = gm.userData.muz; } }
  }
  // руки к точке: плечо + локоть (простая двухзвенная IK), локти смотрят вниз-наружу
  const _ik = { t: new T.Vector3(), h: new T.Vector3(), q: new T.Quaternion(), q2: new T.Quaternion(), p: new T.Vector3() };
  function reach(sh, el, target, side, A = 9.4, Bn = 9.2) {
    const t = _ik.t.copy(target).sub(sh.position); let d = t.length(); d = Math.min(A + Bn - .1, Math.max(1.5, d));
    const th = Math.PI - Math.acos(Math.max(-1, Math.min(1, (A * A + Bn * Bn - d * d) / (2 * A * Bn))));
    el.rotation.set(-th, 0, 0);
    _ik.h.set(0, -A - Bn * Math.cos(th), Bn * Math.sin(th)).normalize(); t.normalize();
    sh.quaternion.setFromUnitVectors(_ik.h, t); _ik.q2.setFromAxisAngle(t, side * .55); sh.quaternion.premultiply(_ik.q2);
  }
  const GRIP = new T.Vector3(0, -2.6, .4), FORE = { 2: 10.5, 3: 11.2, 4: 11, 5: 5, 7: 13, 10: 11.6, 11: 13.8, 12: 7.4, 13: 3, 14: 8, 15: 6.5, 16: 11.5, 17: 11, 18: 10, 19: 6.6 };
  function sectAcc(c, s) {
    const u = c.userData; if (u.accS === s) return; u.accS = s;
    for (const g of u.acc || []) g.parent && g.parent.remove(g); u.acc = [];
    const add_ = (par, gg, col, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(col)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; par.add(o); u.acc.push(o); if (STYLE === 'toon') addOutline(o, OUT_C); return o; };
    if (s === 0) { add_(u.elL, geo.box, 0x24346e, 0, -9.5, 2.4, 1.6, 6.4, 5); add_(u.elL, geo.box, 0xf4f0e0, .2, -9.5, 2.4, 1.2, 6, 4.6); for (const k of [u.kneeL, u.kneeR]) add_(k, geo.box, 0xf08ab0, 0, -11.6, 1.6, 5.6, 2.8, 8.8); } // книжка и розовые тапки
    else if (s === 1) { add_(u.head, geo.dome, 0x4a2478, 0, .2, -.6, 5.7, 6.2, 5.9); add_(u.body, geo.box, 0x3a1c60, 0, 28, -4.4, 13.4, 24, 2); add_(u.body, geo.box, 0x7a1a2a, 0, 40, 0, 14.4, 1.6, 8.2); } // капюшон и плащ
    else if (s === 2) add_(u.head, geo.cone7, 0xdfe3e8, 0, 6.4, 0, 4.4, 9, 4.4); // шапочка из фольги
    else if (s === 3) { add_(u.body, geo.box, 0x2f6ad8, 0, 32, 4.6, 13, 15, 1); add_(u.body, geo.box, 0xfafaf4, 0, 32, 5.2, 11, 13, .6); add_(u.body, geo.box, 0x2f6ad8, 0, 32, -4.6, 13, 15, 1); add_(u.body, geo.box, 0xd23a3a, 0, 33, 5.6, 7, 2, .4); } // плакат-бутерброд
  }
  let curDT = .016, curNow = 0;
  const angD = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function poseChar(c, p, aim, walk, opt = {}) {
    const u = c.userData, dt = Math.min(.05, curDT), now = curNow / 1000, id = opt.id || 0;
    if (!u.lp) { u.lp = [p[0], p[1]]; u.vx = u.vz = 0; u.yaw = Math.atan2(aim[0], aim[1]); u.amp = 0; u.fl = 0; u.rec = 0; u.wasHit = false; }
    const dx = p[0] - u.lp[0], dz = p[1] - u.lp[1], jump = Math.hypot(dx, dz) > 60, kv = Math.min(1, dt * 9);
    u.vx += ((jump ? 0 : dx / Math.max(dt, 1e-3)) - u.vx) * kv; u.vz += ((jump ? 0 : dz / Math.max(dt, 1e-3)) - u.vz) * kv; u.lp = [p[0], p[1]];
    const spd = Math.hypot(u.vx, u.vz), tgt = Math.atan2(aim[0], aim[1]);
    if (opt.dead) u.yaw = tgt; else if (jump) u.yaw = tgt; else u.yaw += angD(u.yaw, tgt) * Math.min(1, dt * (opt.fire ? 28 : 12)); // корпус поворачивается плавно
    c.position.set(p[0], opt.alt || 0, p[1]); c.rotation.set(0, u.yaw, 0);
    const sy = Math.sin(u.yaw), cy = Math.cos(u.yaw), fwd = u.vx * sy + u.vz * cy, side = u.vx * cy - u.vz * sy;
    const B = u.body, armed = (opt.wb & 31) > 0;
    // сброс позы
    B.position.set(0, 0, 0); B.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0);
    u.vest.visible = !!opt.armor; u.shadow.visible = !opt.alt;
    if (u.civ && !u.sectLook) sectAcc(c, opt.sect ?? -1);
    if (opt.down) { // упал: лежит на животе и ползёт — руки по очереди тянутся вперёд, ноги толкаются, голова приподнята
      const k = Math.min(1, (opt.deadT || 0) / .35), e = 1 - Math.pow(1 - k, 3), cr = Math.min(1, spd / 30), ph2 = walk * .55, s2 = Math.sin(ph2), c2 = Math.cos(ph2);
      B.rotation.x = 1.42 * e; B.position.y = 4.5 * e + Math.max(0, s2) * .8 * cr; B.position.z = -22 * e; B.rotation.z = s2 * .08 * cr; B.rotation.y = s2 * .06 * cr;
      const reachL = -2.5 - .55 * s2 * cr, reachR = -2.5 + .55 * s2 * cr;
      u.armL.rotation.set(-.6 * (1 - e) + reachL * e, 0, -.35 * e); u.elL.rotation.set(-(.35 + .7 * Math.max(0, -c2) * cr) * e, 0, 0);
      u.armR.rotation.set(-.4 * (1 - e) + reachR * e, 0, .35 * e); u.elR.rotation.set(-(.35 + .7 * Math.max(0, c2) * cr) * e, 0, 0);
      u.legL.rotation.x = (.1 + s2 * .22 * cr) * e; u.legR.rotation.x = (.1 - s2 * .22 * cr) * e; u.kneeL.rotation.x = (.5 + Math.max(0, s2) * .6 * cr) * e; u.kneeR.rotation.x = (.5 + Math.max(0, -s2) * .6 * cr) * e;
      u.head.rotation.x = -1.0 * e + (cr ? 0 : Math.sin(now * 3) * .08);
      const pulse = .25 + .25 * Math.sin(now * 7); u.mats.shirt.emissive.setRGB(pulse * .5, 0, 0); u.mats.skin.emissive.setRGB(pulse * .3, 0, 0); u.gunHold.position.set(2.6, 32.5 + (u.gy || 0), 8); u.gunHold.rotation.set(0, 0, 0); return;
    }
    if (opt.dead) { // смерть: подкашиваются колени, падает от выстрела, отскок, руки разлетаются
      const t = opt.deadT || 0, f = opt.fall || [-sy, -cy], lf = f[0] * sy + f[1] * cy, lr = f[0] * cy - f[1] * sy;
      const kb = Math.min(1, t / .16), k = Math.max(0, Math.min(1, (t - .1) / .36)), e = 1 - Math.pow(1 - k, 3);
      const ang = 1.52 * e + (t > .46 ? Math.sin((t - .46) * 16) * Math.exp(-(t - .46) * 7) * .1 : 0);
      B.rotation.x = ang * lf; B.rotation.z = -ang * lr; B.rotation.y = ((id % 3) - 1) * .5 * e; B.position.y = -kb * 3 * (1 - e);
      const sl = Math.min(1, t / .4); c.position.x += f[0] * (1 - Math.pow(1 - sl, 2)) * 12; c.position.z += f[1] * (1 - Math.pow(1 - sl, 2)) * 12;
      u.kneeL.rotation.x = kb * 1.1 * (1 - e * .7); u.kneeR.rotation.x = kb * .8 * (1 - e * .6); u.legL.rotation.x = -kb * .5 * (1 - e) + e * .2; u.legR.rotation.x = -kb * .3 * (1 - e) - e * .15;
      u.armL.rotation.set(-.6 - e * 1.4 * (id % 2 ? 1 : .4), 0, -.3 - e * .7); u.armR.rotation.set(-.4 - e * 1.1 * (id % 2 ? .5 : 1), 0, .3 + e * .8); u.elL.rotation.set(-.3, 0, 0); u.elR.rotation.set(-.4, 0, 0);
      u.head.rotation.x = -e * .4 * lf; u.mats.shirt.emissive.setScalar(0); u.mats.skin.emissive.setScalar(0); u.gunHold.position.set(2.6, 32.5 + (u.gy || 0), 8); u.gunHold.rotation.set(.9, -.3, 0); return;
    }
    // походка: амплитуда от реальной скорости — шаг жителя и бег бойца отличаются
    u.amp += (Math.min(1.2, spd / 150) * (opt.moving || spd > 25 ? 1 : 0) - u.amp) * Math.min(1, dt * 8);
    const a = u.amp, ph = walk, s1 = Math.sin(ph), run = Math.max(0, (a - .55) / .65), limp = opt.hp !== undefined && opt.hp < 35 && a > .1;
    const ampR = limp ? .45 : 1;
    u.legL.rotation.x = s1 * (.55 + run * .3) * a; u.legR.rotation.x = -s1 * (.55 + run * .3) * a * ampR;
    u.kneeL.rotation.x = (Math.max(0, -s1) * (.9 + run * .6) + run * .25) * a; u.kneeR.rotation.x = (Math.max(0, s1) * (.9 + run * .6) + run * .25) * a * ampR;
    B.position.y = Math.abs(Math.cos(ph)) * (1.2 + run * 1.4) * a * (limp && s1 > 0 ? .3 : 1) + (a < .1 ? Math.sin(now * 2.2 + id) * .25 : 0);
    B.rotation.y = s1 * .08 * a; // корпус качается в такт шагам
    B.rotation.x = Math.max(-.12, Math.min(.22, fwd / SPEED * .2)) + run * .05; // наклон в беге
    B.rotation.z = Math.max(-.14, Math.min(.14, -side / SPEED * .14)) + (limp ? Math.sin(ph) * .09 : 0);
    const w = opt.wb & 31, one = ONEH(w), sw = (.5 + run * .4) * a;
    u.fireT = opt.fire ? 0 : u.fireT + dt; u.ready += ((u.fireT < 1.6 ? 1 : 0) - u.ready) * Math.min(1, dt * 9); // стрелял недавно — оружие у плеча
    if (!w || one) { // свободные руки машут в противофазе ногам
      u.armL.rotation.set(-s1 * sw, 0, -.12 - run * .1); u.elL.rotation.set(-.25 - run * .9 * a, 0, 0);
      if (!w) { u.armR.rotation.set(-.15 + s1 * sw, 0, .12 + run * .1); u.elR.rotation.set(-.5 - run * .6 * a, 0, 0); }
      if (a < .1 && u.civ) u.head.rotation.y = Math.sin(now * .45 + id * 1.7) * .4; // стоит — оглядывается
    }
    if (w && one) { // пистолет: опущен в руке и покачивается при ходьбе; стреляет — рука вытянута вперёд
      const r = u.ready, swR = s1 * sw * .6;
      u.armR.rotation.set((-.1 + swR) * (1 - r) + (-1.5 - u.rec * .35) * r, 0, .1 * (1 - r) - .12 * r); u.elR.rotation.set(-.55 * (1 - r) - .05 * r, 0, 0);
      u.handHold.rotation.x = (Math.PI / 2 - .2) * r + (Math.PI / 2 + .55) * (1 - r);
      if (r > .5) { u.armL.rotation.set(-1.1 * r, 0, -.35 * r + -.12 * (1 - r)); u.elL.rotation.set(-.8 * r, 0, 0); } // вторая рука подхватывает при стрельбе
    } else if (w) { // длинное оружие: обе руки на оружии; на ходу — стволом вниз поперёк груди, при стрельбе — к плечу
      const r = u.ready, G = u.gunHold;
      const hz = u.hero ? 2.6 : 0; // у героев руки короче и реалистичнее: оружие ближе к телу, на высоте их плеча
      G.position.set(2.2 * r + 1 * (1 - r), (35.5 * r + 31.5 * (1 - r)) + (u.gy || 0) + Math.sin(ph * 2) * .7 * a, (4.5 * r + 5.5 * (1 - r)) - hz - u.rec * 3.2);
      G.rotation.set(.5 * (1 - r) - u.rec * .08, -.45 * (1 - r), .25 * (1 - r)); G.updateMatrix();
      const AR = u.arm || [9.4, 9.2];
      reach(u.armR, u.elR, _ik.p.copy(GRIP).applyMatrix4(G.matrix), 1, AR[0], AR[1]);
      reach(u.armL, u.elL, _ik.p.set(0, -2, (FORE[w] || 9) * (u.hero ? .7 : 1)).applyMatrix4(G.matrix), -1, AR[0], AR[1]);
    }
    // отдача и вздрагивание от попадания (откидывает назад)
    if (opt.hit && !u.wasHit) u.fl = 1; u.wasHit = !!opt.hit; u.fl = Math.max(0, u.fl - dt * 5);
    u.rec = Math.max(u.kick || 0, opt.fire ? .5 : 0, u.rec - dt * 14); u.kick = 0;
    const fl = u.fl * u.fl; B.rotation.x -= fl * .45 + u.rec * .05; u.head.rotation.x = -fl * .5; c.position.x -= sy * fl * 5; c.position.z -= cy * fl * 5;
    const em = fl * .7; u.mats.shirt.emissive.setRGB(em, em * .15, em * .1); u.mats.skin.emissive.setRGB(em, em * .15, em * .1);
  }
  // ===== лут =====
  const lootG = new Map();
  const ringGeo = new T.RingGeometry(9, 13, 20);
  function lootMesh(it) {
    if (it.k === 4 && it.x === 1) { // голубь: без подсветки, клюёт землю
      const g = new T.Group(), item = new T.Group(); g.add(item); const m = (gg, c, x, y, z, sx, sy, sz) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); item.add(o); return o; };
      m(geo.sph, 0x8a8f9a, 0, 4.5, 0, 3, 3, 4.6); m(geo.sph, 0x6a7080, 0, 7.6, 3.6, 1.9, 1.9, 2); m(geo.cone7, 0xe0a030, 0, 7.4, 5.8, .6, 1.4, .6).rotation.x = 1.57; m(geo.box, 0x5a6070, 0, 4.8, -4.6, 2.6, .8, 3); m(geo.sph, 0x4a8a6a, 0, 6.2, 2.4, 2.2, 1.2, 1.4);
      if (STYLE === 'toon') [...item.children].forEach(o => addOutline(o, OUT_C));
      g.userData.item = item; g.userData.bird = 1; g.position.set(it.p[0], 0, it.p[1]); g.rotation.y = it.id * 2.3; return g; }
    if (it.k === 7) { // бонус зомби-коопа: светящийся шар с иконкой и кольцо
      const B = ZB[it.x] || ZB[0], g = new T.Group(), item = new T.Group(); g.add(item); item.position.y = 14;
      const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: new T.Color(B.c), transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; ring.scale.setScalar(1.3); g.add(ring);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(B.c), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.setScalar(46); item.add(glow);
      const ic = new T.Sprite(new T.SpriteMaterial({ map: iconTex(B.i, B.c), depthWrite: false, transparent: true })); ic.scale.setScalar(28); item.add(ic);
      g.userData.item = item; g.userData.bonus = 1; g.userData.ring = ring; g.position.set(it.p[0], 0, it.p[1]); return g; }
    const g = new T.Group(), col = it.k === 0 ? RARITY[it.r] : it.k === 1 ? AMMO_COL[it.x] : it.k === 2 ? '#ff6b6b' : it.k === 4 ? SECTS[it.x].col : it.k === 5 ? '#69db7c' : '#4dabf7';
    const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: new T.Color(col), transparent: true, opacity: .7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; g.add(ring);
    const item = new T.Group(); item.position.y = 9; g.add(item);
    if (it.k === 0) { const gm = gunMesh(it.x, it.r); gm.position.z = -8; item.add(gm); }
    else if (it.k === 1) { const b = new T.Mesh(geo.box, lam(0x495057)); b.scale.set(11, 7, 8); item.add(b); for (let i = -1; i <= 1; i++) { const c = new T.Mesh(geo.cyl6, lam(new T.Color(col).getHex())); c.scale.set(1.4, 5, 1.4); c.position.set(i * 3.3, 5, 0); item.add(c); } }
    else if (it.k === 2) { const b = new T.Mesh(geo.box, lam(0xffffff)); b.scale.set(13, 9, 10); item.add(b); const c1 = new T.Mesh(geo.box, lam(0xe03131)); c1.scale.set(3, 9.4, 7); item.add(c1); const c2 = new T.Mesh(geo.box, lam(0xe03131)); c2.scale.set(9, 9.4, 3); item.add(c2); }
    else if (it.k === 4) { const b = new T.Mesh(geo.box, lam(0xc9a85a)); b.scale.set(12, 2, 9); item.add(b); const p_ = new T.Mesh(geo.box, lam(0xf4f0e0)); p_.scale.set(11, 2.2, 8); p_.position.y = .4; item.add(p_); } // улики
    else if (it.k === 5) { for (let i = 0; i < 3; i++) { const b = new T.Mesh(geo.box, lam(0x5aa05a)); b.scale.set(12, 1.4, 6); b.position.y = i * 1.6; b.rotation.y = i * .3; item.add(b); } } // деньги
    else { const b = new T.Mesh(geo.box, lam(0x1c7ed6)); b.scale.set(13, 15, 5); item.add(b); }
    g.userData.item = item; g.position.set(it.p[0], 0, it.p[1]);
    return g;
  }
  const iconCache = {};
  function iconTex(ch, col) { return iconCache[ch] || (iconCache[ch] = cvTex(64, 64, g => { g.fillStyle = 'rgba(10,10,10,.65)'; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = col; g.stroke(); g.font = '900 34px system-ui,"Segoe UI Emoji","Apple Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(ch, 32, 35); })); }
  function syncLoot(loot, now) {
    for (const [id, g] of lootG) if (!loot.has(id)) { scene.remove(g); lootG.delete(id); }
    for (const it of loot.values()) { let g = lootG.get(it.id); if (!g) { g = lootMesh(it); lootG.set(it.id, g); scene.add(g); } const i = g.userData.item; if (g.userData.bonus) { i.position.y = 14 + Math.sin(now / 250 + it.id) * 3; const k = it.exp ? Math.max(0, (it.exp - now) / 1000) : 99; g.visible = k > 5 || Math.sin(now / 90) > -.2; g.userData.ring.rotation.z = now / 600; continue; } if (g.userData.bird) { const ph = (now / 1000 + it.id * .37) % 2.4; i.rotation.x = ph < .3 ? Math.sin(ph / .3 * Math.PI) * .7 : 0; i.position.y = 0; continue; } i.rotation.y = now / 700 + it.id; i.position.y = 9 + Math.sin(now / 300 + it.id) * 2; }
  }
  // ===== трассеры, огонь =====
  function cvTex(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return new T.CanvasTexture(c); }
  // пули в полёте (как в Crimsonland): светящийся штрих — яркая голова, хвост тает; ядро + ореол; следы снайперки/рельсы
  const streakTex = cvTex(128, 32, (g, w, h) => { const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(.75, 'rgba(255,255,255,.75)'); gx.addColorStop(.95, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,.2)'); g.fillStyle = gx; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in'; const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gy; g.fillRect(0, 0, w, h); });
  const beamTex = cvTex(16, 32, (g, w, h) => { const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(255,255,255,0)'); gy.addColorStop(.5, 'rgba(255,255,255,1)'); gy.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gy; g.fillRect(0, 0, w, h); });
  const quadGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const streakMesh = (tex, n) => { const m = new T.InstancedMesh(quadGeo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }), n); m.frustumCulled = false; m.renderOrder = 6; m.setColorAt(0, new T.Color()); m.count = 0; scene.add(m); return m; };
  const BN = 260, bCore = streakMesh(streakTex, BN), bGlow = streakMesh(streakTex, BN), bTrail = streakMesh(beamTex, 40);
  const bShadow = new T.InstancedMesh(quadGeo, new T.MeshBasicMaterial({ map: streakTex, color: 0x000000, transparent: true, opacity: .4, depthWrite: false, fog: false }), BN); bShadow.frustumCulled = false; bShadow.renderOrder = 2; bShadow.count = 0; scene.add(bShadow); // тень пули на земле — штрих читается на светлом асфальте
  const _bm = new T.Matrix4(), _bq = new T.Quaternion(), _bv = new T.Vector3(), _bs = new T.Vector3(), _be = new T.Euler(), _bc = new T.Color(), _bw = new T.Color(1, 1, 1);
  function putStreak(m, i, a, b, h, w, col, k = 1) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < .01) { m.setMatrixAt(i, _bm.makeScale(0, 0, 0)); return; }
    m.setMatrixAt(i, _bm.compose(_bv.set((a[0] + b[0]) / 2, h, (a[1] + b[1]) / 2), _bq.setFromEuler(_be.set(0, -Math.atan2(dz, dx), 0)), _bs.set(l, 1, w))); m.setColorAt(i, _bc.copy(col).multiplyScalar(k)); }
  // снаряды, которые видно в полёте: ракета базуки, болт арбалета, малые ракеты (вдоль +x)
  const PJ = (() => { const Z = -Math.PI / 2, c = (seg, top = 1) => new T.CylinderGeometry(top, 1, 1, seg);
    const rocket = mergeG([[c(12), RX(4, 0, 0, 2.4, 4, 2.4, 0, 0, Z), GC.ol2], [c(12, .3), RX(8, 0, 0, 2.4, 4, 2.4, 0, 0, Z), GC.ol2], [c(8), RX(10.4, 0, 0, .5, 1, .5, 0, 0, Z), GC.br], [c(10), RX(.6, 0, 0, .85, 3.2, .85, 0, 0, Z), GC.ol], [c(10), RX(-5, 0, 0, 1, 8, 1, 0, 0, Z), GC.dk],
      ...[0, 1, 2, 3].map(k => [geo.box, RX(-8, 0, 0, 3, .2, 4.4, k * Math.PI / 4, 0, 0), GC.ol]), [geo.sph, RX(-9.4, 0, 0, 1.6, 1.1, 1.1), GLOW_O]]);
    const bolt = mergeG([[c(6), RX(0, 0, 0, .3, 16, .3, 0, 0, Z), GC.cr], [c(8, .05), RX(8.8, 0, 0, .6, 1.8, .6, 0, 0, Z), GC.dk], ...[0, 1, 2].map(k => [geo.box, RX(-6.6, 0, 0, 2.4, .1, 1.2, k * 1.047, 0, 0), GC.rd])]);
    const mk = (g) => { const m = new T.InstancedMesh(g, gunMat, 24); m.frustumCulled = false; m.count = 0; m.castShadow = true; scene.add(m); return m; };
    return { 1: mk(rocket), 2: mk(bolt), 3: mk(rocket) }; })(), PJS = { 1: 1, 2: 1, 3: .55 }, _pn = { 1: 0, 2: 0, 3: 0 };
  function drawBullets(list, trails) {
    let n = 0;
    for (const b of list) { if (n >= BN) break; const head = Math.min(b.s, b.end), tail = Math.max(0, Math.min(b.end, b.s - b.bl)); if (head - tail < .5) continue;
      if (b.W.proj && PJ[b.W.proj] && b.s < b.end + 4) { const k = b.W.proj, m = PJ[k]; if (_pn[k] < 24) { const h_ = add(b.from, b.d, head), sc = PJS[k]; m.setMatrixAt(_pn[k]++, _bm.compose(_bv.set(h_[0], 23, h_[1]), _bq.setFromEuler(_be.set(k === 2 ? 0 : b.s * .05, -Math.atan2(b.d[1], b.d[0]), 0, 'YXZ')), _bs.set(sc, sc, sc))); } if (k === 2) continue; }
      const A = add(b.from, b.d, tail), Bp = add(b.from, b.d, head); _bc.setHex(b.bc || 0xffe066); const col = _bc.clone();
      putStreak(bShadow, n, A, Bp, 1.4, (b.bw || 2.4) * 1.6, col, 1); putStreak(bGlow, n, A, Bp, 23, (b.bw || 2.4) * 4, col, .7); putStreak(bCore, n, A, Bp, 23.2, (b.bw || 2.4) * 1.3, col.lerp(_bw, .5), 1); n++; }
    for (const k in PJ) { PJ[k].count = _pn[k]; PJ[k].instanceMatrix.needsUpdate = true; _pn[k] = 0; }
    bCore.count = bGlow.count = bShadow.count = n; bCore.instanceMatrix.needsUpdate = bGlow.instanceMatrix.needsUpdate = bShadow.instanceMatrix.needsUpdate = true; if (n) bCore.instanceColor.needsUpdate = bGlow.instanceColor.needsUpdate = true;
    let m = 0; for (const t of trails) { if (m >= 40) break; const k = Math.max(0, 1 - t.t / t.life); _bc.setHex(t.c); putStreak(bTrail, m++, t.a, t.b, 22.8, t.w * (1 + t.t * 2), _bc.clone(), k * k * t.k); }
    bTrail.count = m; bTrail.instanceMatrix.needsUpdate = true; if (m) bTrail.instanceColor.needsUpdate = true;
  }
  const flameTex = cvTex(64, 96, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * .7, 2, w / 2, h * .6, w * .55); gr.addColorStop(0, '#fff3bf'); gr.addColorStop(.35, '#ffd43b'); gr.addColorStop(.7, '#ff6b1a'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, 4); g.quadraticCurveTo(w, h * .6, w / 2, h - 2); g.quadraticCurveTo(0, h * .6, w / 2, 4); g.fill(); });
  const glowTex = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,220,120,.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const smokeTex = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(70,65,65,.55)'); gr.addColorStop(1, 'rgba(70,65,65,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const flames = []; for (let i = 0; i < 90; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: flameTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); s.center.set(.5, .05); s.visible = false; scene.add(s); flames.push(s); }
  const smokes = []; for (let i = 0; i < 40; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true })); s.visible = false; s.userData = { t: 9 }; scene.add(s); smokes.push(s); }
  const flashes = []; for (let i = 0; i < 36; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; s.userData = { t: 9 }; scene.add(s); flashes.push(s); }
  let flashI = 0; function flashAt(v, size) { const s = flashes[flashI++ % flashes.length]; s.position.copy(v); s.scale.setScalar(size); s.userData.t = 0; s.userData.size = size; s.visible = true; }
  // ===== транспорт =====
  function plane() { const g = new T.Group(); const m = (gg, c, x, y, z, sx, sy, sz) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o; };
    const f = m(geo.cyl10, 0xdee2e6, 0, 0, 0, 14, 110, 14); f.rotation.x = Math.PI / 2; m(geo.box, 0xadb5bd, 0, 0, 5, 130, 3, 24); m(geo.box, 0xadb5bd, 0, 8, -48, 40, 3, 12); m(geo.box, 0xe03131, 0, 16, -50, 3, 22, 14); const n = m(geo.cone7, 0x4dabf7, 0, 0, 61, 13, 14, 13); n.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) { const e = m(geo.cyl10, 0x495057, s * 34, -6, 8, 6, 22, 6); e.rotation.x = Math.PI / 2; } return g; }
  // метка под своим солдатом — тонкое кольцо на земле, видно и за стеной
  const meRing = new T.Mesh(new T.RingGeometry(15, 17.5, 32), new T.MeshBasicMaterial({ color: 0xe9f5dc, transparent: true, opacity: .45, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); meRing.rotation.x = -Math.PI / 2; meRing.renderOrder = 3 /* кольцо на земле под ногами: ноги его перекрывают */; meRing.visible = false; scene.add(meRing);
  // пыль/искры там, куда попала пуля
  const puffs = []; for (let i = 0; i < 30; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, color: 0xd8ccb0 })); s.visible = false; s.userData = { t: 9 }; scene.add(s); puffs.push(s); }
  let puffI = 0; function puffAt(v) { const s = puffs[puffI++ % puffs.length]; s.position.copy(v); s.userData.t = 0; s.visible = true; }
  // кровь: брызги и лужи на земле
  const bloodTex = cvTex(64, 64, g => { for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${120 + Math.random() * 40 | 0},0,0,.85)`; g.beginPath(); g.arc(32 + (Math.random() - .5) * 30, 32 + (Math.random() - .5) * 30, 4 + Math.random() * 12, 0, 6.28); g.fill(); } });
  const sprays = []; for (let i = 0; i < 40; i++) { const s = new T.Sprite(new T.SpriteMaterial({ color: 0xb0101a, depthWrite: false, transparent: true })); s.visible = false; s.userData = { t: 9, v: new T.Vector3() }; scene.add(s); sprays.push(s); }
  const pools = []; const poolGeo = new T.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 60; i++) { const m = new T.Mesh(poolGeo, new T.MeshBasicMaterial({ map: bloodTex, transparent: true, depthWrite: false, opacity: .85 })); m.visible = false; m.renderOrder = 1; m.userData = { t: 99 }; scene.add(m); pools.push(m); }
  let sprI = 0, poolI = 0;
  function bloodAt(p, h = 26, big) {
    for (let k = 0; k < (big ? 10 : 6); k++) { const s = sprays[sprI++ % sprays.length]; s.position.set(p[0], h, p[1]); s.userData.v.set((Math.random() - .5) * 90, 30 + Math.random() * 60, (Math.random() - .5) * 90); s.userData.t = 0; s.scale.setScalar(2 + Math.random() * 3); s.visible = true; }
    const m = pools[poolI++ % pools.length], sc = (big ? 34 : 14) + Math.random() * 10; m.position.set(p[0] + (Math.random() - .5) * 8, .9 + (poolI % 60) * .002, p[1] + (Math.random() - .5) * 8); m.scale.set(sc, 1, sc); m.rotation.y = Math.random() * 6; m.userData.t = 0; m.material.opacity = .85; m.visible = true;
  }
  // гильзы
  const shells = []; const shellGeo = new T.BoxGeometry(1.2, 1.2, 2.6); for (let i = 0; i < 70; i++) { const m = new T.Mesh(shellGeo, lam(0xd4a020)); m.visible = false; m.userData = { t: 9, v: new T.Vector3() }; scene.add(m); shells.push(m); }
  let shellI = 0; function shellAt(v, right) { const m = shells[shellI++ % shells.length]; m.position.copy(v); m.userData.v.set(right.x * 60 + (Math.random() - .5) * 20, 50 + Math.random() * 30, right.z * 60 + (Math.random() - .5) * 20); m.userData.t = 0; m.visible = true; }
  let zoomCur = 1;
  const transport = plane(); transport.scale.setScalar(1.3); transport.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(transport);
  // ===== превью персонажа на старте =====
  let pvR = null, pvScene = null, pvCam = null, pvChar = null, pvCh = -1, pvLast = 0;
  const previewHeroes = new Map();
  let pvStill = false;
  const previewMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function preview(canvas, ch) {
    if (!pvR) {
      pvR = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      pvR.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      pvR.setSize(258, 258, false);
      pvScene = new T.Scene();
      pvScene.add(new T.HemisphereLight(0xf5e7d7, 0x768992, 1.05));
      const key = new T.DirectionalLight(0xffdfb4, .76);
      key.position.set(30, 60, 50); pvScene.add(key);
      const rim = new T.DirectionalLight(0x9bbcc9, .45);
      rim.position.set(-30, 38, -50); pvScene.add(rim);
      pvCam = new T.PerspectiveCamera(34, 1, 1, 500);
      pvCam.position.set(0, 36, 116); pvCam.lookAt(0, 29, 0);
    }
    const now = performance.now();
    const still = previewMotion.matches;
    if (pvCh === ch && pvStill === still && (still || now - pvLast < 32)) return;
    if (pvCh !== ch) {
      if (pvChar) pvScene.remove(pvChar);
      if (!previewHeroes.has(ch)) {
        const figure = makeChar(ch), u = figure.userData;
        u.armL.rotation.set(-.08, 0, -.19); u.armR.rotation.set(-.06, 0, .19);
        u.elL.rotation.set(-.18, 0, 0); u.elR.rotation.set(-.18, 0, 0);
        previewHeroes.set(ch, figure);
      }
      pvChar = previewHeroes.get(ch);
      pvScene.add(pvChar); pvCh = ch;
    }
    pvChar.rotation.y = still ? .31 : .31 + Math.sin(now / 1150) * .56;
    pvStill = still;
    pvR.render(pvScene, pvCam); pvLast = now;
  }
  // ===== кадр =====
  const chars = {}; // id -> group
  let worldBuilt = null, W3 = 1, H3 = 1;
  const tmpV = new T.Vector3(), tmpA = new T.Vector3(), tmpB = new T.Vector3();
  const VIEW = 470; // сколько единиц карты видно по короткой стороне экрана
  function resize(w, h) {
    W3 = w; H3 = h; renderer.setPixelRatio(HD ? Math.min(devicePixelRatio || 1, lowEnd ? 1.25 : 1.75) : Math.min(devicePixelRatio || 1, PIXH / Math.min(w, h))); renderer.setSize(w, h, false);
    applyFrustum();
  }
  const bufV = new T.Vector2(), SIN_EL = CAM_OFF.y / CAM_OFF.length();
  function applyFrustum() { const asp = W3 / H3, v = VIEW * zoomCur; let hh, hw; if (asp >= 1) { hh = v / 2; hw = hh * asp; } else { hw = v / 2; hh = hw / asp; } camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix(); }
  function setCam(p) {
    // камеру двигаем шагами ровно в один пиксель картинки — так низкое разрешение не «дрожит» при движении
    if (!HD) { renderer.getDrawingBufferSize(bufV); const px = (camera.top - camera.bottom) / Math.max(1, bufV.y), a = Math.round(dot(p, CAM_R) / px) * px, b = Math.round(dot(p, CAM_F) / (px / SIN_EL)) * (px / SIN_EL); p = add(mul(CAM_R, a), CAM_F, b); }
    camera.position.set(p[0] + CAM_OFF.x, CAM_OFF.y, p[1] + CAM_OFF.z); camera.lookAt(p[0], 0, p[1]); camera.updateMatrixWorld();
    // тень считаем вокруг камеры; шаг привязки к текселю — чтобы тени не дрожали
    const sx = Math.round(p[0] / 4) * 4, sz = Math.round(p[1] / 4) * 4; sun.target.position.set(sx, 0, sz); sun.position.set(sx + SUN_DIR.x * 1500, SUN_DIR.y * 1500, sz + SUN_DIR.z * 1500); sun.target.updateMatrixWorld(); }
  // направления «вверх» и «вправо» экрана на карте
  const CAM_F = norm([-CAM_OFF.x, -CAM_OFF.z]), CAM_R = [-CAM_F[1], CAM_F[0]];
  // экранные координаты точки на высоте h
  function project(p, h = 0) { tmpV.set(p[0], h, p[1]).project(camera); const vis = Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15; return [(tmpV.x + 1) / 2 * W3, (1 - tmpV.y) / 2 * H3, vis]; }
  // луч из камеры через точку экрана → точка на карте на высоте h
  function screenToGround(sx, sy, h = 20) {
    const x = sx / W3 * 2 - 1, y = -(sy / H3 * 2 - 1);
    tmpA.set(x, y, -1).unproject(camera); tmpB.set(x, y, 1).unproject(camera);
    const dy = tmpB.y - tmpA.y; if (Math.abs(dy) < 1e-6) return null; const t = (h - tmpA.y) / dy;
    return [tmpA.x + (tmpB.x - tmpA.x) * t, tmpA.z + (tmpB.z - tmpA.z) * t];
  }
  function frame(st) {
    const { now, dt, objs, zone, plan, matchT, phase, loot, list, tracers, shipS, shipD, camP, inB, me, zoom } = st;
    { const z = zoom || 1; if (Math.abs(z - zoomCur) > .002) { zoomCur += (z - zoomCur) * Math.min(1, dt * 4); applyFrustum(); } }
    curDT = dt || .016; curNow = now;
    meRing.visible = !!me; if (me) meRing.position.set(me[0], 2.3, me[1]);
    if (worldBuilt !== objs) { buildWorld(objs); worldBuilt = objs; }
    setInside(inB ?? -1);
    setCam(camP);
    U.t.value = now / 1000;
    if (GROUNDED) { updateCarpet(camP, zoomCur); setBenders(st.benders || list.filter(e => !e.dead).map(e => [e.p[0], e.p[1], 24])); }
    if (phase >= 1 && !zone.pre) { U.zc.value.set(zone.c[0], zone.c[1]); U.zrho.value = zone.rho; } else U.zrho.value = 1e5;
    const nz = phase === 1 ? nextZone(zone, plan) : null;
    if (nz) { U.nc.value.set(nz.c[0], nz.c[1]); U.nrho.value = nz.rho; } else U.nrho.value = -1;
    // персонажи
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id); let c = chars[e.id];
      if (!c || c.userData.ch !== e.ch) { if (c) scene.remove(c); c = chars[e.id] = makeChar(e.ch); c.userData.ch = e.ch; scene.add(c); }
      c.visible = true; setGun(c, e.wb); poseChar(c, e.p, e.aim, e.walk, e);
      // парашют
      if (e.alt) { if (!c.userData.chute) { const ch = new T.Group(); for (let i = 0; i < 6; i++) { const seg = new T.Mesh(new T.SphereGeometry(24, 6, 4, i * Math.PI / 3, Math.PI / 3, 0, Math.PI / 2), lam(i % 2 ? 0xd8d4c8 : CAMO[e.ch % 10][0])); ch.add(seg); } ch.position.y = 64; c.add(ch); c.userData.chute = ch; } c.userData.chute.visible = true; }
      else if (c.userData.chute) c.userData.chute.visible = false;
    }
    for (const id in chars) if (!seen.has(+id)) chars[id].visible = false;
    syncLoot(loot, now);
    // трассеры
    drawBullets(tracers || [], st.trails || []);
    if (st.shots) for (const [id, big] of st.shots) { const c = chars[id]; if (!c || !c.visible) continue; const u = c.userData, tip = u.gunNode.localToWorld(new T.Vector3(0, 0, u.muz)); flashAt(tip, (22 + Math.random() * 14) * big); u.kick = 1;
      if (big > 0) { const rt = new T.Vector3(1, 0, 0).applyQuaternion(c.quaternion); shellAt(u.gunNode.localToWorld(new T.Vector3(0, 2, 2)), rt); } }
    for (const s of sprays) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > .5 || s.position.y < 1) { s.visible = false; continue; } u.v.y -= 260 * dt; s.position.addScaledVector(u.v, dt); }
    for (const m of pools) { if (!m.visible) continue; m.userData.t += dt; if (m.userData.t > 25) m.material.opacity = Math.max(0, .85 - (m.userData.t - 25) / 5); if (m.userData.t > 30) m.visible = false; }
    for (const m of shells) { if (!m.visible) continue; const u = m.userData; u.t += dt; if (u.t > 3) { m.visible = false; continue; } if (m.position.y > 1) { u.v.y -= 300 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += dt * 15; m.rotation.y += dt * 9; } else { m.position.y = 1; u.v.set(0, 0, 0); } }
    for (const s of puffs) { if (!s.visible) continue; s.userData.t += dt; const k = s.userData.t / .45; if (k >= 1) { s.visible = false; continue; } s.scale.setScalar(6 + k * 18); s.material.opacity = .8 * (1 - k); s.position.y += dt * 12; }
    for (const s of flashes) { if (!s.visible) continue; s.userData.t += dt; const k = 1 - s.userData.t / .09; if (k <= 0) s.visible = false; else s.scale.setScalar(s.userData.size * (.6 + .4 * k)); }
    // языки пламени вдоль фронта — только рядом с камерой
    camP_ = camP; let fi = worldFx(dt, now, objs);
    if (phase >= 1 && !zone.pre && zone.rho > 2) {
      const c = zone.c, N = Math.min(4000, Math.max(16, Math.ceil(zone.rho * 6.2832 / 24)));
      for (let i = 0; i < N && fi < flames.length; i++) {
        const a = i / N * 6.2832, q = [c[0] + Math.cos(a) * zone.rho, c[1] + Math.sin(a) * zone.rho];
        if (Math.abs(q[0] - camP[0]) > 650 || Math.abs(q[1] - camP[1]) > 650) continue;
        const s = flames[fi++], f = .75 + .35 * Math.sin(now / 90 + i * 1.7) + .2 * Math.sin(now / 37 + i * 3.1);
        s.position.set(q[0], 0, q[1]); s.scale.set(26 * f, 46 * f, 1); s.visible = true;
        if (Math.random() < .01) { const sm = smokes.find(x => x.userData.t > 2.5); if (sm) { sm.userData.t = 0; sm.userData.p = q; sm.visible = true; } }
      }
    }
    for (; fi < flames.length; fi++) flames[fi].visible = false;
    for (const s of smokes) { if (!s.visible) continue; s.userData.t += dt; const k = s.userData.t / 2.5; if (k >= 1) { s.visible = false; continue; } s.position.copy(at(s.userData.p, 30 + k * 90)); s.scale.setScalar(30 + k * 70); s.material.opacity = .9 * (1 - k); }
    // транспорт
    transport.visible = phase === 1 && matchT < DROP_T + 4;
    if (transport.visible) { const sp = add(shipS, shipD, SHIP_V * matchT); transport.position.set(sp[0], 250, sp[1]); transport.rotation.set(0, Math.atan2(shipD[0], shipD[1]), 0); }
    if (st.extra) st.extra(dt, now);
    renderer.render(scene, camera);
  }
  return { gunMesh, flameJet, pyre, weaponImage, ruin: () => ({ decals: ruinDecals, v: ruinV, fires: fireSpots, plumes: plumeSrc }), scene, camera, MAT, smashWall, flash: (p, h, s) => flashAt(at(p, h), s), puff: (p, h) => puffAt(at(p, h)), hitNear: (objs, p) => hitNear(objs, p), chars, frame, resize, project, screenToGround, killObj, preview, renderer, CAM_F, CAM_R, bloodAt, altarBroken, breakGlass, reviveObj, boom, objState, debris: (p, h, n, col, sp, sz) => debrisAt(at(p, h), n, col, sp, sz) };
})();
