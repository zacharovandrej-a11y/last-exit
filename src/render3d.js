// ===== LAST EXIT — 3D-мир (Three.js, low-poly), изометрическая камера над плоской картой =====
// Визуальные улицы строятся по реальным препятствиям, без вмешательства в генератор мира.
function planStreets(objs) {
  const step = 30, radius = 28, size = Math.floor((HALF * 2 - 160) / step), origin = -HALF + 80;
  const point = k => [origin + k % size * step, origin + Math.floor(k / size) * step];
  const clear = (p, r, publicRoad = true) => {
    if (!inMap(p, r + 50)) return false;
    for (const b of objs.blds) {
      const q = sub(p, b.p), x = Math.abs(dot(q, b.u)), y = Math.abs(dot(q, b.v));
      const w = publicRoad && b.yard ? b.yard[0] : b.w, h = publicRoad && b.yard ? b.yard[1] : b.h;
      if (x < w / 2 + r && y < h / 2 + r) return false;
    }
    return !nearObjs(objs, p, r).some(o => !o.nc && objPush(o, p, r));
  };
  const segment = (a, b, r, road = true) => {
    const n = Math.ceil(dist(a, b) / 6);
    for (let i = 0; i <= n; i++) if (!clear(lerp(a, b, i / Math.max(1, n)), r, road)) return false;
    return true;
  };
  const free = new Uint8Array(size * size);
  for (let k = 0; k < free.length; k++) free[k] = clear(point(k), radius) ? 1 : 0;
  const ends = [];
  for (const b of objs.blds) for (const d of b.doors) {
    const outward = norm(sub(d.o, d.i)), threshold = lerp(d.i, d.o, .5);
    const start = b.yard ? add(b.p, outward, b.yard[1] / 2 + 65) : d.o;
    ends.push({ bid: b.id, points: b.yard ? [threshold, d.o, start] : [threshold, d.o], start });
  }
  const closest = (p, reachable = null) => {
    let best = -1, distance = 200;
    const cx = Math.round((p[0] - origin) / step), cy = Math.round((p[1] - origin) / step);
    for (let y = Math.max(0, cy - 5); y < Math.min(size, cy + 6); y++) for (let x = Math.max(0, cx - 5); x < Math.min(size, cx + 6); x++) {
      const k = y * size + x; if (!free[k] || reachable && !Number.isFinite(reachable[k])) continue;
      const q = point(k), d = dist(p, q); if (d < distance && segment(p, q, PR + 2, false)) { best = k; distance = d; }
    }
    return best;
  };
  const root = closest(ends[0].start), distance = new Float64Array(free.length).fill(Infinity), parent = new Int32Array(free.length).fill(-1);
  if (root < 0) return { roads: [], walks: [], missed: ends.map(e => e.bid) };
  const heap = [];
  const push = (k, d) => { let i = heap.length; heap.push([k, d]); while (i > 0) { const p = (i - 1) >> 1; if (heap[p][1] <= d) break; heap[i] = heap[p]; i = p; } heap[i] = [k, d]; };
  const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1][1] < heap[c][1]) c++; if (heap[c][1] >= last[1]) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return first; };
  distance[root] = 0; push(root, 0);
  while (heap.length) {
    const [k, cost] = pop(); if (cost !== distance[k]) continue;
    const x = k % size, y = Math.floor(k / size);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, next = yy * size + xx;
      if (xx < 0 || yy < 0 || xx >= size || yy >= size || !free[next]) continue;
      const nd = cost + step; if (nd >= distance[next] || !segment(point(k), point(next), radius)) continue;
      distance[next] = nd; parent[next] = k; push(next, nd);
    }
  }
  // Узкий выход возле забора или берега может требовать обхода, а не прямого отрезка.
  const detour = start => {
    const fine = 20, n = Math.ceil((HALF * 2 - 160) / fine), key = (x, y) => y * n + x;
    const pos = k => [origin + k % n * fine, origin + Math.floor(k / n) * fine];
    const cx = Math.round((start[0] - origin) / fine), cy = Math.round((start[1] - origin) / fine), prev = new Map(), queue = [];
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const k = key(x, y); if (segment(start, pos(k), PR + 2, false)) { prev.set(k, -1); queue.push(k); }
    }
    for (let i = 0; i < queue.length && i < 5000; i++) {
      const k = queue[i], p = pos(k), gx = Math.round((p[0] - origin) / step), gy = Math.round((p[1] - origin) / step);
      for (let yy = gy - 1; yy <= gy + 1; yy++) for (let xx = gx - 1; xx <= gx + 1; xx++) {
        const target = yy * size + xx;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size || !Number.isFinite(distance[target]) || !segment(p, point(target), PR + 2, false)) continue;
        const route = []; for (let a = k; a >= 0; a = prev.get(a)) route.push(pos(a));
        return { target, points: route.reverse() };
      }
      const x = k % n, y = Math.floor(k / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, next = key(xx, yy);
        if (xx < 0 || yy < 0 || xx >= n || yy >= n || prev.has(next) || dist(start, pos(next)) > 500 || !segment(p, pos(next), PR + 2, false)) continue;
        prev.set(next, k); queue.push(next);
      }
    }
    return null;
  };
  const edges = new Map(), walks = [], missed = [];
  for (const e of ends) {
    let k = closest(e.start, distance), extra = [];
    if (k < 0) { const route = detour(e.start); if (!route) { missed.push(e.bid); continue; } k = route.target; extra = route.points; }
    walks.push({ bid: e.bid, points: e.points.concat(extra, [point(k)]) });
    for (let i = k; parent[i] >= 0; i = parent[i]) { const j = parent[i], key = Math.min(i, j) + ':' + Math.max(i, j); edges.set(key, [point(i), point(j)]); }
  }
  // Убираем ступеньки сетки между развилками, сохраняя подключения всех дверей.
  const graph = new Map(), coordinates = new Map(), key = p => p.join(','), used = new Set();
  for (const [a, b] of edges.values()) for (const [p, q] of [[a, b], [b, a]]) {
    const k = key(p); coordinates.set(k, p); if (!graph.has(k)) graph.set(k, []); graph.get(k).push(key(q));
  }
  const stops = new Set(walks.map(w => key(w.points[w.points.length - 1])));
  for (const [k, next] of graph) if (next.length !== 2) stops.add(k);
  const roads = [], edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  for (const start of stops) for (const neighbor of graph.get(start) || []) {
    if (used.has(edgeKey(start, neighbor))) continue;
    const chain = [coordinates.get(start)]; let previous = start, current = neighbor;
    used.add(edgeKey(previous, current)); chain.push(coordinates.get(current));
    while (!stops.has(current)) {
      const next = graph.get(current).find(k => k !== previous); used.add(edgeKey(current, next));
      previous = current; current = next; chain.push(coordinates.get(current));
    }
    for (let i = 0; i < chain.length - 1;) {
      let next = chain.length - 1; while (next > i + 1 && !segment(chain[i], chain[next], radius)) next--;
      roads.push([chain[i], chain[next]]); i = next;
    }
  }
  return { roads, walks, missed };
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
  const worldMats = {};
  const worldMat = (opt = {}) => { const k = JSON.stringify(opt); return worldMats[k] || (worldMats[k] = charrable((GROUNDED ? o => new T.MeshLambertMaterial(o) : MAT)(Object.assign({ color: 0xffffff, map: grunge }, opt)))); };

  // ===== земля =====
  const loader = new T.TextureLoader();
  const grassTex = typeof ART === 'object' && ART.grass ? loader.load(ART.grass) : null;
  if (grassTex) { grassTex.wrapS = grassTex.wrapT = T.MirroredRepeatWrapping; }
  const crateTex = typeof ART === 'object' && ART.crate ? loader.load(ART.crate) : null;
  const gsize = HALF * 2 + 4000, gg = new T.PlaneGeometry(gsize, gsize, 1, 1); gg.rotateX(-Math.PI / 2);
  const ground = new T.Mesh(gg, new T.ShaderMaterial({
    uniforms: Object.assign(T.UniformsUtils.clone(T.UniformsLib.lights), { grass: { value: grassTex }, hasGrass: { value: grassTex ? 1 : 0 }, bc: { value: BIOMES.map(b => new T.Vector2(b.c[0], b.c[1])) }, bcol: { value: BIOMES.map(b => new T.Color(b.col)) }, brad: { value: BIOMES.map(b => b.r) }, hallC: { value: new T.Vector2(1e6, 1e6) }, hallU: { value: new T.Vector2(1, 0) }, hallHalf: { value: new T.Vector2() }, orderC: { value: new T.Vector2(1e6, 1e6) } }, U),
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
  // приглушённые реальные цвета; у каждого экземпляра свой оттенок
  const VAR = {
    house: [0xd8cfbe, 0xc9b79c, 0xb9b3a6, 0xe0d5c0, 0xc4a98a], roof: [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34],
    car: [0x2f4a63, 0x6e2626, 0x8a7d5e, 0xaeb0ab, 0x3a4a3a, 0x232323, 0x5e6266], house2: [0xbdb5a6, 0xa9a39a, 0xc8bfae, 0x9c958a],
    leaf: [0x778850, 0x85874a, 0x717c42, 0x9a874e, 0x577346],
    leaf2: [0x4e6038, 0x646539, 0x485d37], leafTip: [0x9ba066, 0xb1a063, 0x839356], pine: [0x435e42, 0x4c6849, 0x566744],
    rock: [0x7d7b74, 0x8a857a, 0x6e6c66],
  };
  // части каждого типа: [геометрия, цвет (или ключ VAR), матрица в единицах w/h объекта]
  const PARTS = {
    shed: (w, h) => [[geo.box, 0x79614b, M(0, 30, 0, w, 60, h)], [geo.roof, 0x4c555a, M(0, 60, 0, w + 8, 24, h + 8)],
      [geo.box, 0x40352a, M(0, 24, h / 2 + .6, 38, 48, 1.2)], [geo.box, 0xb8aea0, M(14, 24, h / 2 + 1.4, 2, 3, 1.5)]],
    tree: (w, h, o) => {
      const k = w / 44, variant = o.id % 3, tall = [1, 1.14, .87][variant];
      const branch = [geo.cyl6, 0x5c452f, M(-4 * k, 33 * k * tall, 1 * k, 1.65 * k, 22 * k, 1.6 * k, .6, .55)];
      return [[geo.cyl6, 0x49362a, M(0, 18 * k * tall, 0, 3.4 * k, 36 * k * tall, 3.4 * k)], branch,
        [geo.foliage, 'leaf2', M(0, 39 * k * tall, 0, 20 * k, 13 * k, 18 * k)],
        [geo.foliage, 'leaf', M(-12 * k, 45 * k * tall, 4 * k, 14 * k, 11 * k, 12 * k, 1)],
        [geo.foliage, 'leaf', M(12 * k, 49 * k * tall, -6 * k, 13 * k, 12 * k, 12 * k, 2)],
        [geo.foliage, 'leaf', M(-2 * k, 55 * k * tall, -9 * k, 14 * k, 10 * k, 10 * k, 3)],
        [geo.foliage, 'leafTip', M(3 * k, 57 * k * tall, 7 * k, 11 * k, 10 * k, 12 * k, 2)]];
    },
    pine: (w) => { const k = w / 40; return [[geo.cyl6, 0x4a3626, M(0, 8 * k, 0, 2.6 * k, 16 * k, 2.6 * k)], [geo.cone7, 'pine', M(0, 26 * k, 0, 21 * k, 30 * k, 21 * k)], [geo.cone7, 'pine', M(0, 44 * k, 0, 16 * k, 26 * k, 16 * k, .5)], [geo.cone7, 'pine', M(0, 60 * k, 0, 10 * k, 22 * k, 10 * k, 1)], [geo.cone7, 0xe4e9ec, M(0, 66 * k, 0, 5 * k, 10 * k, 5 * k)]]; },
    rock: (w) => { const k = w / 36; return [[geo.dod, 'rock', M(0, 5 * k, 0, 18 * k, 12 * k, 15 * k, 0, .2)], [geo.dod, 'rock', M(9 * k, 3 * k, 6 * k, 9 * k, 7 * k, 8 * k, 1)]]; },
    hay: (w) => { const k = w / 30; return [[geo.lay, 0xbfa25a, M(0, 14 * k, 0, 21 * k, 14 * k, 14 * k)]]; },
    cactus: (w) => { const k = w / 26; return [[geo.cyl6, 0x55703a, M(0, 22 * k, 0, 5 * k, 44 * k, 5 * k)], [geo.cyl6, 0x4f6a35, M(7 * k, 20 * k, 0, 3 * k, 6 * k, 3 * k, 0, 1.57)], [geo.cyl6, 0x4f6a35, M(10 * k, 28 * k, 0, 3 * k, 16 * k, 3 * k)],
      [geo.cyl6, 0x4f6a35, M(-6 * k, 16 * k, 0, 3 * k, 5 * k, 3 * k, 0, 1.57)], [geo.cyl6, 0x4f6a35, M(-8.5 * k, 22 * k, 0, 3 * k, 12 * k, 3 * k)]]; },
    snowman: (w) => { const k = w / 24; return [[geo.dod, 0x76746e, M(0, 5 * k, 0, 12 * k, 9 * k, 11 * k)], [geo.dod, 0xe6eaed, M(0, 8 * k, 0, 11 * k, 6 * k, 10 * k, .4)]]; }, // заснеженный валун
    igloo: (w) => [[geo.box, 0x6b4a2e, M(0, 13, 0, w * .7, 26, w * .7)], [geo.roof, 0x3e3328, M(0, 26, 0, w * .8, 18, w * .82)], [geo.box, 0xe4e9ec, M(0, 35, 0, w * .76, 1.5, w * .5)], [geo.box, 0x3a2a1c, M(0, 9, w * .35 + .6, 9, 18, 1.2)], [geo.box, 0x2e3a40, M(w * .2, 15, w * .35 + .6, 7, 6, 1.2)]], // бревенчатый домик
    house: (w, h) => [[geo.box, 'house', M(0, 20, 0, w * .75, 40, h * .75)], [geo.roof, 'roof', M(0, 40, 0, w * .86, 26, h * .9)],
      [geo.box, 0x4a3524, M(0, 12, h * .375 + .6, 11, 24, 1.5)], [geo.box, 0xe8e4da, M(w * .22, 25, h * .375 + .5, 13, 12, 1.2)], [geo.box, 0x2b363c, M(w * .22, 25, h * .375 + .8, 10, 9, 1.2)],
      [geo.box, 0xe8e4da, M(-w * .22, 25, h * .375 + .5, 13, 12, 1.2)], [geo.box, 0x2b363c, M(-w * .22, 25, h * .375 + .8, 10, 9, 1.2)], [geo.box, 0x2b363c, M(-w * .375 - .6, 25, 0, 1.2, 9, 12)], [geo.box, 0x7a4a3a, M(w * .2, 58, -h * .15, 7, 16, 7)], [geo.box, 0x6b6b66, M(0, 1.5, h * .375 + 4, 16, 3, 7)]],
    house2: (w, h) => [[geo.box, 'house2', M(0, 23, 0, w, 46, h)], [geo.box, 0x77726a, M(0, 47, 0, w * 1.02, 3, h * 1.02)], [geo.box, 0x8e8a82, M(-w * .2, 52, 0, 14, 8, 10)],
      [geo.box, 0x2b363c, M(-w * .22, 14, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w * .22, 14, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(-w * .22, 34, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w * .22, 34, h / 2 + .6, 12, 10, 1.2)], [geo.box, 0x2b363c, M(w / 2 + .6, 34, 0, 1.2, 10, 12)]],
    bunker: (w, h) => [[geo.box, 0x82827a, M(0, 13, 0, w, 26, h)], [geo.box, 0x6e6e66, M(0, 28, 0, w * .9, 4, h * .9)], [geo.box, 0x151515, M(0, 17, h / 2 + .6, w * .5, 4, 1)], [geo.box, 0xa8966e, M(0, 4, h / 2 + 4, w * 1.05, 8, 7)], [geo.box, 0x9c8a64, M(0, 11, h / 2 + 3.5, w * .9, 6, 6)]],
    barn: (w, h) => [[geo.box, 0x72302a, M(0, 23, 0, w, 46, h)], [geo.roof, 0x4e535a, M(0, 46, 0, w * 1.05, 28, h * 1.1)], [geo.box, 0xd6d2c8, M(0, 16, h / 2 + .6, 32, 32, 1.2)], [geo.box, 0x5a2520, M(0, 16, h / 2 + .9, 28, 28, 1.2)]],
    market: (w, h) => [[geo.box, 0xcfcac0, M(0, 26, 0, w, 52, h)], [geo.box, 0x7a2e38, M(0, 46, h / 2 + 1, w * .98, 9, 2)], [geo.box, 0x77726a, M(0, 53, 0, w * 1.01, 3, h * 1.01)], [geo.box, 0x34474f, M(0, 18, h / 2 + .6, w * .7, 22, 1.5)], [geo.box, 0x8e8a82, M(w * .3, 58, 0, 22, 9, 16)]],
    car: (w, h) => [
      [geo.carCabin, 'car', M(0, 15, 0, w, 14, h)],
      [geo.carCabin, 0x566970, M(-w * .08, 28, 0, w * .62, 13, h * .88)],
      [geo.box, 'car', M(-w * .08, 34.8, 0, w * .44, 1.8, h * .74)],
      [geo.box, 'car', M(0, 16.3, 0, w * .99, 3, h * .96)],
      [geo.box, 0x252726, M(w / 2, 10, 0, 3, 6, h * .93)],
      [geo.box, 0x252726, M(-w / 2, 10, 0, 3, 6, h * .93)],
      [geo.box, 0x9b9586, M(w / 2 + .3, 13.5, 0, 1.6, 1.6, h * .48)],
      ...[-1, 1].flatMap(side => [
        [geo.box, 0xe7d8ac, M(w * .48, 17, side * h * .31, 4, 3.6, 8)],
        [geo.box, 0xb5483c, M(-w * .48, 17, side * h * .31, 3.8, 3.4, 7)],
        [geo.box, 0x999183, M(-w * .13, 19, side * h * .47, 6, 1.25, 1.8)]
      ]),
      ...[-.3, .32].flatMap(x => [
        [geo.cyl10, 0x252524, MX(w * x, 9, 0, 9, h * 1.04, 9)],
        [geo.cyl10, 0x827d70, MX(w * x, 9, 0, 4.5, h * 1.06, 4.5)]
      ])
    ],
    truck: (w, h) => [[geo.box, 0x3d4a2a, M(w * .32, 24, 0, w * .3, 34, h)], [geo.carCabin, 0x556970, M(w * .43, 32, 0, w * .095, 12, h * .9)], [geo.box, 0x4a5233, M(-w * .15, 30, 0, w * .66, 40, h * 1.02)], [geo.box, 0x3a4228, M(-w * .15, 51, 0, w * .66, 3, h * 1.02)],
      ...[-1, 1].flatMap(side => [
        [geo.box, 0x868363, M(-w * .15, 43, side * (h * .51 + 1), w * .63, 2.2, 2)],
        [geo.box, 0xd1c5a3, M(w * .48, 16, side * h * .31, 3, 5, 10)]
      ]),
      [geo.box, 0x1e1e1e, M(0, 9, 0, w, 6, h * .7)], [geo.cyl10, 0x1c1c1c, MX(w * .32, 10, 0, 10, h * 1.04, 10)], [geo.cyl10, 0x1c1c1c, MX(-w * .05, 10, 0, 10, h * 1.04, 10)], [geo.cyl10, 0x1c1c1c, MX(-w * .35, 10, 0, 10, h * 1.04, 10)]],
    crate: () => [[geo.box, 'crate', M(0, 13, 0, 26, 26, 26)]],
    furn: (w, h, o) => { const k = o.fk;
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
    barrel: (w) => [[geo.cyl10, 0x4a5a3a, M(0, 12, 0, w / 2, 24, w / 2)], [geo.cyl10, 0x2e3a26, M(0, 8, 0, w / 2 + .3, 1.5, w / 2 + .3)], [geo.cyl10, 0x2e3a26, M(0, 17, 0, w / 2 + .3, 1.5, w / 2 + .3)]],
    fence: (w) => [[geo.box, 0x6b5238, M(0, 10, 0, w, 2, 2)], [geo.box, 0x6b5238, M(0, 18, 0, w, 2, 2)], ...[-.5, -.25, 0, .25, .5].map(k => [geo.box, 0x5a4430, M(w * k * .96, 11, 0, 3, 22, 3)])],
    bush: (w, h, o) => {
      const k = w / 34, spread = o.id % 2 ? 1 : .84;
      return [[geo.foliage, 'leaf2', M(0, 7 * k, 0, 14 * k, 9 * k, 13 * k)],
        [geo.foliage, 'leaf', M(8 * k, 9 * k, 5 * k, 9 * k * spread, 8 * k, 8 * k, 1)],
        [geo.foliage, 'leaf', M(-8 * k, 10 * k, -4 * k, 9 * k, 9 * k, 8 * k, 2)],
        [geo.foliage, 'leafTip', M(1 * k, 15 * k, 1 * k, 8 * k, 7 * k, 7 * k, 3)],
        [geo.foliage, 'leaf2', M(-3 * k, 6 * k, 9 * k, 8 * k, 6 * k, 7 * k, 2)]];
    },
    wall: (w, h) => [[geo.box, 0x8d8d86, M(0, 11, 0, w, 22, h)], [geo.box, 0x76766f, M(0, 22.5, 0, w * 1.02, 2, h * 1.3)]],
    tent: (w, h) => [[geo.roof, 0x5a5a3a, M(0, 0, 0, w, 30, h)], [geo.box, 0x2e2e20, M(w / 2 + .3, 8, 0, .8, 14, 8)]],
    grave: (w, h, o) => { const v = o.id % 4, st = 0x8a8a84, mound = [geo.box, 0x5a4a36, M(0, 1.5, 12, 12, 3, 18)];
      if (v === 0) return [mound, [geo.box, st, M(0, 8, 0, 14, 16, 5)], [geo.cyl10, st, MX(0, 16, 0, 7, 5, 7)]];
      if (v === 1) return [mound, [geo.box, 0x6e6e6a, M(0, 3, 0, 12, 6, 8)], [geo.box, 0x7a7a76, M(0, 18, 0, 6, 26, 6)], [geo.cone7, 0x7a7a76, M(0, 34, 0, 4.5, 7, 4.5)]];
      if (v === 2) return [mound, [geo.box, 0x76746c, M(0, 7, 0, 14, 14, 4.5, 0, .25)]];
      return [mound, [geo.box, 0x9a968c, M(0, 9, 0, 13, 18, 4)], [geo.box, 0x6e5a8a, M(0, 3, 6, 3, 6, 3)]]; },
    deadtree: (w) => { const k = w / 34; return [[geo.cyl6, 0x3a3430, M(0, 22 * k, 0, 3 * k, 44 * k, 3 * k)], [geo.cyl6, 0x3a3430, M(7 * k, 36 * k, 0, 1.5 * k, 22 * k, 1.5 * k, 0, -.8)], [geo.cyl6, 0x3a3430, M(-6 * k, 32 * k, 3 * k, 1.4 * k, 18 * k, 1.4 * k, 1, .9)], [geo.cyl6, 0x3a3430, M(2 * k, 46 * k, -3 * k, 1.2 * k, 14 * k, 1.2 * k, 2, .5)]]; },
    ifence: (w) => [[geo.box, 0x1e1e22, M(0, 6, 0, w, 2, 2)], [geo.box, 0x1e1e22, M(0, 26, 0, w, 2, 2)], ...[...Array(12)].map((_, i) => [geo.box, 0x1e1e22, M((i / 11 - .5) * w * .96, 15, 0, 1.6, 30, 1.6)]), ...[...Array(12)].map((_, i) => [geo.cone7, 0x1e1e22, M((i / 11 - .5) * w * .96, 32, 0, 2, 5, 2)])],
    antenna: () => [[geo.box, 0x6a6e72, M(0, 2, 0, 12, 4, 12)], [geo.cyl6, 0x9aa0a6, M(0, 24, 0, 1.6, 44, 1.6, 0, .35)], [geo.box, 0x9aa0a6, M(-5, 30, 0, 22, 1.2, 1.2, 0, .55)], [geo.box, 0x9aa0a6, M(-9, 40, 0, 16, 1.2, 1.2, 0, .1)], [geo.cyl6, 0x9aa0a6, M(14, 1.5, 6, 1.4, 30, 1.4, 0, 1.5)]],
    dish: () => [[geo.cyl6, 0x777b80, M(0, 9, 0, 2, 18, 2)], [geo.dome, 0xd8dde2, M(2, 22, 0, 13, 4, 13, 0, 1.9)], [geo.cyl6, 0x555a60, M(-4, 21, 0, 1, 12, 1, 0, 1.2)]],
    junk: () => [[geo.box, 0x7a6a4a, M(0, 6, 0, 18, 12, 14, .4)], [geo.box, 0x8a8e92, M(8, 4, -6, 12, 8, 10, 1.1)], [geo.lay, 0x1c1c1c, M(-8, 4, 8, 4, 4, 10)], [geo.box, 0xd8dde2, M(-2, 13, 0, 12, 3, 10, .2, .3)]],
    sandbag: (w, h) => { const n = Math.max(3, Math.round(w / 13)), bw = w / n, r = []; for (let row = 0; row < 3; row++) { const m = row === 2 ? n - 1 : n; for (let i = 0; i < m; i++) r.push([geo.sph, row === 1 ? 0x8a7a58 : 0x7d6e4e, M(-w / 2 + bw * (i + .5 + (row === 2 ? .5 : 0)), 4.5 + row * 6, (row % 2 ? .8 : -.8), bw * .56, 3.6, h * .5, (i * 1.7 + row) % .3)]); } return r; },
    jersey: (w, h) => [[geo.box, 0x9a958a, M(0, 3, 0, w, 6, h)], [geo.box, 0x8e897e, M(0, 12, 0, w * .99, 12, h * .55)], [geo.box, 0x9a958a, M(0, 19.5, 0, w * .98, 3, h * .42)], [geo.box, 0xb03a2a, M(-w * .25, 12, h * .28, w * .2, 4, .4)], [geo.box, 0xe8e4da, M(w * .1, 12, h * .28, w * .2, 4, .4)]],
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
  const wreckOf = o => { if (o.type !== 'car' && o.type !== 'truck') return 0; const r = rh(o.id, 5); return r < .28 ? 0 : r < .6 ? 1 : o.type === 'car' && r > .9 ? 3 : 2; };
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
        const bark = g === geo.cyl6 && (ty === 'tree' || ty === 'pine' || ty === 'deadtree');
        const surface = col === 'crate' ? 'crate' : col === 'leaf' || col === 'leaf2' || col === 'leafTip' || col === 'pine' ? 'foliage' : bark ? 'bark' : 'plain';
        const key = g.uuid + '|' + surface;
        (plan[key] = plan[key] || { g, surface, items: [] }).items.push([o, lm, col]);
      }
    }
    for (const key in plan) {
      const { g, surface, items } = plan[key];
      const options = surface === 'crate' && crateTex ? { map: crateTex }
        : surface === 'foliage' ? { map: leafPattern, vertexColors: g === geo.foliage }
        : surface === 'bark' ? { map: barkPattern } : {};
      const mesh = new T.InstancedMesh(g, worldMat(options), items.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
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
    wood: { tex: 'wood', cols: [0x8a5a3a, 0x7a3a2c, 0x6e5238] }, metal: { tex: 'metal', cols: [0x8a8f86, 0x7a8478, 0x9a9488] }, adobe: { tex: 'adobe', cols: [0xd9b88a, 0xcfa878, 0xe0c49a] },
    hallbrick: { tex: 'brick', cols: [0xe0c49a] }, stone: { tex: 'concrete', cols: [0x5a5660] }, white: { tex: 'plaster', cols: [0xf4f2ec] },
  };
  const FLOOR = { wood: ['fwood', 0x9a7350], tile: ['tile', 0xb8b4aa], concrete: ['floorc', 0x99968e], dirt: ['dirt', 0x8a7556] };
  const ROOFC = [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34];
  const wallParts = {}, wallGone = new Set(); // проломленные стены
  function smashWall(id, objs) { wallGone.add(id); if (boardMesh && boardIdx[id]) { for (const [i] of boardIdx[id]) boardMesh.setMatrixAt(i, zero); boardMesh.instanceMatrix.needsUpdate = true; } for (const [mesh, i] of wallParts[id] || []) { mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; } killObj(id); const o = objs && objs[id]; if (o) { debrisAt(at(o.p, 20), 18, o.type === 'bw' ? 0x8a7a6a : 0x6b4a2e, 120, 4); debrisAt(at(o.p, 30), 8, 0x5a5048, 90, 2.5); if (glassIdx[id]) breakGlass(id, objs); } }
  const boardPlan = [], boardIdx = {}, I4 = new T.Matrix4(); let boardMesh = null;
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
  let streetMeshes = [];
  let streetPlan = null;
  function buildStreets(objs) {
    for (const m of streetMeshes) scene.remove(m); streetMeshes = [];
    const plan = planStreets(objs), paths = []; streetPlan = plan;
    for (const walk of plan.walks) for (let i = 1; i < walk.points.length; i++) paths.push([walk.points[i - 1], walk.points[i]]);
    const layer = (segments, width, y, tx, color) => {
      const mesh = new T.InstancedMesh(streetPlane, texMat(tx, 48), segments.length);
      segments.forEach(([a, b], i) => { const d = sub(b, a), length = len(d);
        mesh.setMatrixAt(i, M((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, width, 1, length + (tx === 'asphalt' || width === 56 ? width : 2), Math.atan2(d[0], d[1])));
        mesh.setColorAt(i, new T.Color(color)); });
      mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh); streetMeshes.push(mesh);
    };
    layer(plan.roads, 56, .04, 'paving', 0x8e8a7b);
    layer(plan.roads, 50, .08, 'asphalt', 0x565b62);
    const dashes = [];
    for (const [a, b] of plan.roads) {
      const length = dist(a, b);
      if (length < 113) continue;
      const dir = norm(sub(b, a));
      for (let t = 37; t + 18 < length - 37; t += 45) dashes.push([add(a, dir, t), add(a, dir, t + 18)]);
    }
    layer(dashes, 2.1, .12, 'asphaltMark', 0xb7ad91);
    layer(paths, 28, .16, 'paving', 0xb1a995);
    if (GROUNDED) buildVergeGrass(objs, plan.roads, paths);

  }
  const vergeGrassGeometry = (() => {
    const pos = [];
    for (const [x, z, height, tip] of [[-2, .4, 7, -2.3], [0, -1.2, 9.5, 1.2], [1.9, .7, 6.4, 3.6], [.9, 1.9, 7.8, -.5]]) {
      pos.push(x - .7, 0, z, x + .8, 0, z + 1.1, tip, height, z + .65);
      pos.push(x, 0, z - .7, x, 0, z + .8, tip, height, z + .65);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.computeVertexNormals();
    return geometry;
  })();
  const vergeGrassMaterial = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide });
  function buildVergeGrass(objs, roads, paths) {
    const occupied = roads.map(segment => [segment, 29]).concat(paths.map(segment => [segment, 17]));
    const clear = p => !occupied.some(([[a, b], radius]) => {
      const ab = sub(b, a), delta = sub(p, a);
      const t = Math.min(1, Math.max(0, dot(delta, ab) / Math.max(1, dot(ab, ab))));
      return dist(p, add(a, ab, t)) < radius;
    }) && bldAt(objs.blds, p) < 0 && !nearObjs(objs, p, 7).some(o => !o.nc && objPush(o, p, 7));
    const tufts = [], spacing = lowEnd ? 92 : 68, cap = lowEnd ? 360 : 540;
    const colors = [0x757544, 0x857543, 0x62703c, 0x9e8b55];
    for (const [i, [a, b]] of roads.entries()) {
      const dir = norm(sub(b, a)), n = perp(dir), length = dist(a, b);
      for (let t = 17; t < length - 15 && tufts.length < cap; t += spacing) {
        const id = i * 100 + Math.floor(t);
        const p = add(add(a, dir, t + rh(id, 6) * 8), n, (rh(id, 8) < .5 ? -1 : 1) * (32 + rh(id, 10) * 19));
        if (!clear(p)) continue;
        for (let k = 0; k < 3 && tufts.length < cap; k++) {
          const q = add(add(p, dir, (k - 1) * 6), n, (rh(id, 11 + k) - .5) * 7);
          if (!clear(q)) continue;
          const h = .58 + rh(id, 14 + k) * .62;
          tufts.push([M(q[0], .12, q[1], 1.3, h, 1.25, rh(id, 17 + k) * 6.28), colors[(id + k) % colors.length]]);
        }
      }
      if (tufts.length >= cap) break;
    }
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
  const WOBBLY = { crate: .16, barrel: .2, car: .04, truck: .03, tree: .05, pine: .05, bush: .12, fence: .1, ifence: .08, grave: .06, billboard: .05, antenna: .15, dish: .15, junk: .12, deadtree: .06 };
  const MATC = { car: 0xffd080, truck: 0xffd080, barrel: 0xffd080, crate: 0x8a6a40, fence: 0x8a6a40, tree: 0x4a6b2a, pine: 0x2f5233, bush: 0x4a6b2a };
  function hitNear(objs, end) { let best = null, bd = 30; for (const o of nearObjs(objs, end, 40)) { if (o.dead || !WOBBLY[o.type]) continue; const d = Math.max(0, dist(o.p, end) - o.rad); if (d < bd) { bd = d; best = o; } } if (!best) return;
    wob.set(best.id, 0); if (MATC[best.type]) debrisAt(at(end, 18), 3, MATC[best.type], 50, 1.4); }
  function reviveObj(id) { for (const [mesh, i, m] of objIdx[id] || []) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; } }
  // взрыв: вспышка, огненный шар, дым, обломки, подпалина
  const fires = [], burning = new Map(); // burning: id -> {p, s, t}
  let scT = null; const scorchTex = () => scT || (scT = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(15,10,6,.95)'); gr.addColorStop(.6, 'rgba(25,18,10,.6)'); gr.addColorStop(1, 'rgba(25,18,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
  const scorch = []; const mkScorch = () => { if (scorch.length) return; for (let i = 0; i < 12; i++) { const m = new T.Mesh(poolGeo, new T.MeshBasicMaterial({ map: scorchTex(), transparent: true, opacity: .8, depthWrite: false })); m.visible = false; m.userData = { t: 99 }; scene.add(m); scorch.push(m); } };
  let scI = 0;
  function boom(p, r) {
    flashAt(at(p, 20), r * 1.6); flashAt(at(p, 40), r * 1.1);
    fires.push({ p, t: 0, life: .7, n: 10, r });
    for (let k = 0; k < 6; k++) { const sm = smokes.find(x => x.userData.t > 2.5); if (sm) { sm.userData.t = Math.random() * .5; sm.userData.p = [p[0] + (Math.random() - .5) * r * .5, p[1] + (Math.random() - .5) * r * .5]; sm.visible = true; } }
    debrisAt(at(p, 12), 16, 0x2a2622, 160, 3); debrisAt(at(p, 12), 8, 0xff9a30, 120, 1.6);
    mkScorch(); const m = scorch[scI++ % scorch.length]; m.position.set(p[0], .95, p[1]); m.scale.set(r * .9, 1, r * .9); m.rotation.y = Math.random() * 6; m.userData.t = 0; m.material.opacity = .7; m.visible = true;
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
    for (const [id, b] of burning) { b.t += dt; if (b.s === 2 && b.t < 25 && Math.abs(b.p[0] - camP_[0]) < 900 && Math.abs(b.p[1] - camP_[1]) < 900) for (let i = 0; i < 4; i++) { const f = .75 + .3 * Math.sin(now / 80 + i * 1.9 + id); put(b.p[0] + (i - 1.5) * 12, 18, b.p[1] + Math.sin(i * 2.1) * 8, 22 * f, 38 * f); }
      if (Math.random() < dt * (b.s === 2 ? 4 : 2.2)) { const sm = smokes.find(x => x.userData.t > 2.5); if (sm) { sm.userData.t = 0; sm.userData.p = [b.p[0] + (Math.random() - .5) * 20, b.p[1] + (Math.random() - .5) * 20]; sm.visible = true; } } }
    // постоянные очаги: горящие остовы машин, бочки, окна сгоревших домов — только рядом с камерой, не больше 8
    let nf = 0; for (const f of fireSpots) { if (nf >= 8 || fi >= flames.length - 3) break; if (Math.abs(f.p[0] - camP_[0]) > 650 || Math.abs(f.p[1] - camP_[1]) > 650) continue; const o = objs[f.id]; if (o && (o.dead && !f.win || burning.has(f.id))) continue; nf++;
      for (let i = 0; i < f.n; i++) { const k = .72 + .28 * Math.sin(now / 70 + i * 2.3 + f.p[0]) + .14 * Math.sin(now / 29 + i * 1.3); put(f.p[0] + (i - (f.n - 1) / 2) * 10 * f.s, f.h, f.p[1] + Math.sin(i * 2.1) * 7 * f.s, 30 * f.s * k, 52 * f.s * k); } }
    drawPlumes(now, objs);
    return fi;
  }
  let camP_ = [0, 0];
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
    for (const [a, b] of (streetPlan && streetPlan.roads) || []) { const d = norm(sub(b, a)), n = perp(d), L = dist(a, b), ang = Math.atan2(d[0], d[1]);
      for (let t = 20; t < L; t += 46) { const c = add(a, d, t), r = R(), q = add(c, n, (R() - .5) * 36);
        if (r < .5) { R(); R(); } // сохраняем позиции остального декора
        else if (r < .62) dec.push([q[0], q[1], 16 + R() * 18, 'hole', 0x6a6258, 1, R() * 6.28, 1]);
        else if (r < .74) dec.push([q[0], q[1], 30 + R() * 24, 'patch', 0x2e2d2a, .6, -ang + (R() - .5) * .2, .55 + R() * .4]);
        else if (r < .8) dec.push([q[0], q[1], 28 + R() * 36, 'b1', 0x0a0806, .5, R() * 6.28, .7]);
        if (R() < .4) { const e = add(c, n, (R() < .5 ? -1 : 1) * (19 + R() * 7)); if (okAt(e, 4)) junk(e); }
        if (R() < .05) { const e = add(c, n, (R() < .5 ? -1 : 1) * 18); if (okAt(e, 12)) pile(e, 10, 14); } } }
    // дома: завалы у стен, сгоревшие — копоть вокруг, огонь в окнах и дым над крышей
    for (const b of Bl) { if (b.kind && b.kind.startsWith('ch')) continue; const burnt = b.burnt, n = burnt ? 3 : R() < .45 ? 1 : 0;
      for (let i = 0; i < n; i++) { const sx = R() < .5 ? -1 : 1, sy = R() < .5 ? -1 : 1, c = add(add(b.p, b.u, sx * (b.w / 2 + 16)), b.v, sy * (b.h / 2 * R() + 10)); pile(c, burnt ? 18 : 12, burnt ? 22 : 15); }
      if (burnt) { dec.push([b.p[0], b.p[1], Math.max(b.w, b.h) * 1.5, 'scorch', 0x16100c, .55, R() * 6.28, 1]); plumeSrc.push({ p: b.p, big: 1.3, seed: R() });
        const ws = b.walls.map(i => objs[i]).filter(o => o && o.win); for (let i = 0; i < Math.min(2, ws.length); i++) { const o = ws[Math.floor(R() * ws.length)]; fireSpots.push({ p: o.p, h: 30, n: 2, s: 1, id: o.id, win: 1 }); } } }
    // машины и бочки: сгоревшие остовы дымят, часть ещё горит
    for (const o of objs) { const wk = wreckOf(o);
      if (wk >= 2) { dec.push([o.p[0], o.p[1], 90 + R() * 30, 'scorch', 0x16100c, .7, R() * 6.28, 1]); if (rh(o.id, 12) < .45) { fireSpots.push({ p: o.p, h: wk === 3 ? 34 : 38, n: 3, s: 1.1, id: o.id }); plumeSrc.push({ p: o.p, big: 1, seed: R(), id: o.id }); } }
      else if (o.type === 'barrel' && rh(o.id, 13) < .3) fireSpots.push({ p: o.p, h: 24, n: 2, s: .8, id: o.id }); }
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
  const METAL = 0x2a2c2e, WOOD = 0x5a3d26, POLY = 0x34352f;
  function gunMesh(w, rar) {
    const g = new T.Group();
    const b = (c, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(geo.box, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; g.add(o); return o; };
    const tube = (c, x, y, z, r, l) => { const o = new T.Mesh(geo.cyl10, lam(c)); o.position.set(x, y, z); o.scale.set(r, l, r); o.rotation.x = Math.PI / 2; g.add(o); return o; };
    let band = 2;
    if (w === 1) { b(METAL, 0, 1, 3, 2, 2.4, 8); b(POLY, 0, -2, .5, 1.8, 4.5, 2.4, -.25); band = 1.5; } // пистолет
    else if (w === 2) { b(METAL, 0, 0, 3, 2.4, 3.4, 10); b(POLY, 0, 0, 11, 2.8, 2.8, 7); tube(METAL, 0, .4, 17.5, .7, 7); b(METAL, 0, -4, 4.5, 2, 6, 3, .3); b(POLY, 0, -.3, -5, 2.2, 3.6, 7); b(POLY, 0, -3, 0, 1.8, 4, 2.2, -.3); b(0x111111, 0, 2.6, 3, 1.4, 1.8, 3); } // автомат
    else if (w === 3) { b(METAL, 0, 0, 2, 2.4, 3, 8); tube(METAL, 0, .8, 13, .9, 16); tube(METAL, 0, -.9, 11, .8, 12); b(WOOD, 0, -.9, 11, 2.4, 2.4, 6); b(WOOD, 0, -.6, -6, 2.2, 3.8, 9); } // дробовик
    else if (w === 4) { b(METAL, 0, 0, 2, 2.4, 3, 10); tube(METAL, 0, .4, 17, .7, 20); tube(0x111111, 0, 3.2, 3, 1.4, 10); b(WOOD, 0, -.5, -7, 2.4, 4.2, 10); b(WOOD, 0, -1, 9, 2.6, 2.8, 6); b(METAL, 0, -3.4, 2, 1.8, 3, 2.4); } // снайперка
    else if (w === 5) { b(METAL, 0, 0, 2.5, 2.4, 3.6, 8); tube(METAL, 0, .6, 9, .7, 5); b(METAL, 0, -5, 3, 1.8, 8, 2.2, .1); b(METAL, 0, 0, -4, .8, 2.6, 6); b(POLY, 0, -3, -.5, 1.8, 4, 2.2, -.3); } // ПП
    else if (w === 6) { b(METAL, 0, 0, 2, 2.4, 3, 10); tube(METAL, 0, .4, 14, .7, 14); tube(0x111111, 0, 3, 3, 1.1, 7); b(WOOD, 0, -.5, -6.5, 2.4, 4, 9); b(WOOD, 0, -.6, 9, 2.6, 2.6, 7); b(METAL, 0, -4, 3.5, 1.8, 5, 2.4, .2); } // винтовка
    else if (w === 7) { b(POLY, 0, 0, 3, 3, 4, 12); tube(METAL, 0, .6, 15, .9, 12); b(0x3d4a2a, 2.4, -3, 4, 3.4, 5, 6); b(POLY, 0, -.3, -6, 2.4, 3.8, 8); b(METAL, 0, -4, 13, .6, 7, .6, .5); b(POLY, 0, 2.6, 6, 2, 1.4, 6); } // пулемёт
    else if (w === 8) { b(METAL, 0, 1.4, 5, 1.6, 1.6, 8); tube(0x3a3a3a, 0, .6, 1.5, 1.6, 3.2); b(WOOD, 0, -2.4, -.5, 1.8, 5, 2.4, -.35); } // револьвер
    else if (w === 10) { tube(0x3d4a2a, 0, 0, 8, 2.6, 18); b(0x2a2a2a, 0, -1, -2, 3, 4, 8); b(0x2a2a2a, 0, -4, 3, 2, 6, 2.6, .3); b(0x111111, 0, 3, 4, 1.4, 2, 4); } // гранатомёт
    else if (w === 11) { tube(0x555a60, 0, 1, 12, 1.2, 16); b(0xc0392b, 0, -4, 3, 4.5, 7, 7); b(0x2a2a2a, 0, -1, -3, 2.4, 3.6, 7); b(0xffa040, 0, 1, 20.5, 1.6, 1.6, 1); } // огнемёт
    else if (w === 9) { b(0x1e1e1e, 0, 0, 3, 2.4, 3.2, 9); b(0x1e1e1e, 0, 0, 10, 2.6, 2.6, 6); tube(METAL, 0, .4, 15, .6, 6); b(0x1e1e1e, 0, -3.8, 4, 1.8, 5, 2.6, .25); b(0x1e1e1e, 0, 0, -4.5, 2, 3, 6); b(0x111111, 0, 2.6, 3, 1.4, 2, 2.6); b(0xff3030, 0, 3.8, 3, .5, .5, .5); } // карабин
    if (rar > 0) b(new T.Color(RARITY[rar]).getHex(), 0, 0, band, 2.7, 3.2, 1.2); // полоска редкости
    return g;
  }
  // Один снимок на пушку. Лента показывает обычные картинки, без 3D-рендера при свайпе.
  const weaponImages = new Map(), weaponImageMaterials = new Map();
  let weaponImageScene, weaponImageCamera, weaponImageTarget;
  function weaponImage(id) {
    if (weaponImages.has(id)) return weaponImages.get(id);
    const width = 128, height = 64;
    if (!weaponImageTarget) {
      weaponImageTarget = new T.WebGLRenderTarget(width, height, { depthBuffer: true });
      weaponImageScene = new T.Scene();
      weaponImageScene.add(new T.HemisphereLight(0xfff5e5, 0xc6cde0, 1.0));
      const key = new T.DirectionalLight(0xffffff, 1.25);
      key.position.set(-4, 6, 3);
      weaponImageScene.add(key);
      weaponImageCamera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 250);
    }
    const gun = gunMesh(ZW[id].m, 0);
    // Некоторые пушки используют общую модель в бою. На маленькой карточке выделяем их главную примету.
    if (id === 5) gun.scale.z = .58;
    if (id === 10 || id === 11 || id === 12 || id === 13) {
      const color = { 10: 0x888d93, 11: 0x718488, 12: 0x40d8e8, 13: 0xc080fb }[id];
      const collar = new T.Mesh(geo.cyl10, lam(color));
      collar.position.set(0, .4, id === 13 ? 17 : 13);
      collar.rotation.x = Math.PI / 2;
      collar.scale.set(id === 10 ? 2.3 : 1.65, id === 10 ? 13 : 7, id === 10 ? 2.3 : 1.65);
      gun.add(collar);
    }
    gun.traverse(part => {
      if (!part.isMesh) return;
      const color = part.material.color.getHex();
      if (!weaponImageMaterials.has(color)) {
        const paint = new T.Color(color).lerp(new T.Color(0xc2b9aa), .28);
        weaponImageMaterials.set(color, new T.MeshLambertMaterial({ color: paint }));
      }
      part.material = weaponImageMaterials.get(color);
    });
    const bounds = new T.Box3().setFromObject(gun), center = bounds.getCenter(new T.Vector3());
    const size = bounds.getSize(new T.Vector3());
    const half = Math.max(9, Math.max(size.z, size.y * 2) * .60);
    weaponImageCamera.left = -half;
    weaponImageCamera.right = half;
    weaponImageCamera.top = half / 2;
    weaponImageCamera.bottom = -half / 2;
    weaponImageCamera.position.copy(center).add(new T.Vector3(-85, 25, 14));
    weaponImageCamera.lookAt(center);
    weaponImageCamera.updateProjectionMatrix();

    const currentTarget = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha();
    const pixels = new Uint8Array(width * height * 4);
    weaponImageScene.add(gun);
    try {
      renderer.setRenderTarget(weaponImageTarget);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.render(weaponImageScene, weaponImageCamera);
      renderer.readRenderTargetPixels(weaponImageTarget, 0, 0, width, height, pixels);
    } finally {
      weaponImageScene.remove(gun);
      renderer.setRenderTarget(currentTarget);
      renderer.setClearColor(clear, alpha);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const paint = canvas.getContext('2d'), image = paint.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const row = (height - 1 - y) * width * 4;
      image.data.set(pixels.subarray(row, row + width * 4), y * width * 4);
    }
    paint.putImageData(image, 0, 0);
    const url = canvas.toDataURL();
    weaponImages.set(id, url);
    return url;
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
  function makeChar(ch) {
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
    u.gunHold.clear(); u.handHold.clear(); const w = wb & 15;
    if (u.civ) u.itemG.visible = !w; // житель взял оружие — вещь убираем
    if (w) { const gm = gunMesh(w, wb >> 4); gm.traverse(o => { if (o.isMesh) o.castShadow = true; });
      if (ONEH(w)) { gm.position.set(0, 2.2, -.6); u.handHold.add(gm); u.gunNode = u.handHold; u.muz = 10; } else { u.gunHold.add(gm); u.gunNode = u.gunHold; u.muz = 22; } }
  }
  // руки к точке: плечо + локоть (простая двухзвенная IK), локти смотрят вниз-наружу
  const _ik = { t: new T.Vector3(), h: new T.Vector3(), q: new T.Quaternion(), q2: new T.Quaternion(), p: new T.Vector3() };
  function reach(sh, el, target, side) {
    const A = 9.4, Bn = 9.2, t = _ik.t.copy(target).sub(sh.position); let d = t.length(); d = Math.min(A + Bn - .1, Math.max(1.5, d));
    const th = Math.PI - Math.acos(Math.max(-1, Math.min(1, (A * A + Bn * Bn - d * d) / (2 * A * Bn))));
    el.rotation.set(-th, 0, 0);
    _ik.h.set(0, -A - Bn * Math.cos(th), Bn * Math.sin(th)).normalize(); t.normalize();
    sh.quaternion.setFromUnitVectors(_ik.h, t); _ik.q2.setFromAxisAngle(t, side * .55); sh.quaternion.premultiply(_ik.q2);
  }
  const GRIP = new T.Vector3(0, -2.6, .4), FORE = { 2: 10, 3: 11, 4: 9, 5: 4, 6: 9, 7: 12, 9: 9 };
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
    const B = u.body, armed = (opt.wb & 15) > 0;
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
      const pulse = .25 + .25 * Math.sin(now * 7); u.mats.shirt.emissive.setRGB(pulse * .5, 0, 0); u.mats.skin.emissive.setRGB(pulse * .3, 0, 0); u.gunHold.position.set(2.6, 32.5, 8); u.gunHold.rotation.set(0, 0, 0); return;
    }
    if (opt.dead) { // смерть: подкашиваются колени, падает от выстрела, отскок, руки разлетаются
      const t = opt.deadT || 0, f = opt.fall || [-sy, -cy], lf = f[0] * sy + f[1] * cy, lr = f[0] * cy - f[1] * sy;
      const kb = Math.min(1, t / .16), k = Math.max(0, Math.min(1, (t - .1) / .36)), e = 1 - Math.pow(1 - k, 3);
      const ang = 1.52 * e + (t > .46 ? Math.sin((t - .46) * 16) * Math.exp(-(t - .46) * 7) * .1 : 0);
      B.rotation.x = ang * lf; B.rotation.z = -ang * lr; B.rotation.y = ((id % 3) - 1) * .5 * e; B.position.y = -kb * 3 * (1 - e);
      const sl = Math.min(1, t / .4); c.position.x += f[0] * (1 - Math.pow(1 - sl, 2)) * 12; c.position.z += f[1] * (1 - Math.pow(1 - sl, 2)) * 12;
      u.kneeL.rotation.x = kb * 1.1 * (1 - e * .7); u.kneeR.rotation.x = kb * .8 * (1 - e * .6); u.legL.rotation.x = -kb * .5 * (1 - e) + e * .2; u.legR.rotation.x = -kb * .3 * (1 - e) - e * .15;
      u.armL.rotation.set(-.6 - e * 1.4 * (id % 2 ? 1 : .4), 0, -.3 - e * .7); u.armR.rotation.set(-.4 - e * 1.1 * (id % 2 ? .5 : 1), 0, .3 + e * .8); u.elL.rotation.set(-.3, 0, 0); u.elR.rotation.set(-.4, 0, 0);
      u.head.rotation.x = -e * .4 * lf; u.mats.shirt.emissive.setScalar(0); u.mats.skin.emissive.setScalar(0); u.gunHold.position.set(2.6, 32.5, 8); u.gunHold.rotation.set(.9, -.3, 0); return;
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
    const w = opt.wb & 15, one = ONEH(w), sw = (.5 + run * .4) * a;
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
      G.position.set(2.2 * r + 1 * (1 - r), (35.5 * r + 31.5 * (1 - r)) + Math.sin(ph * 2) * .7 * a, (4.5 * r + 5.5 * (1 - r)) - u.rec * 3.2);
      G.rotation.set(.5 * (1 - r) - u.rec * .08, -.45 * (1 - r), .25 * (1 - r)); G.updateMatrix();
      reach(u.armR, u.elR, _ik.p.copy(GRIP).applyMatrix4(G.matrix), 1);
      reach(u.armL, u.elL, _ik.p.set(0, -2, FORE[w] || 9).applyMatrix4(G.matrix), -1);
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
  function drawBullets(list, trails) {
    let n = 0;
    for (const b of list) { if (n >= BN) break; const head = Math.min(b.s, b.end), tail = Math.max(0, Math.min(b.end, b.s - b.bl)); if (head - tail < .5) continue;
      const A = add(b.from, b.d, tail), Bp = add(b.from, b.d, head); _bc.setHex(b.bc || 0xffe066); const col = _bc.clone();
      putStreak(bShadow, n, A, Bp, 1.4, (b.bw || 2.4) * 1.6, col, 1); putStreak(bGlow, n, A, Bp, 23, (b.bw || 2.4) * 4, col, .7); putStreak(bCore, n, A, Bp, 23.2, (b.bw || 2.4) * 1.3, col.lerp(_bw, .5), 1); n++; }
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
  const meRing = new T.Mesh(new T.RingGeometry(15, 17.5, 32), new T.MeshBasicMaterial({ color: 0xe9f5dc, transparent: true, opacity: .45, depthTest: false, depthWrite: false })); meRing.rotation.x = -Math.PI / 2; meRing.renderOrder = 5; meRing.visible = false; scene.add(meRing);
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
    if (pvCh === ch && now - pvLast < 32) return;
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
    pvChar.rotation.y = .31 + Math.sin(now / 1150) * .56;
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
    meRing.visible = !!me; if (me) meRing.position.set(me[0], 1, me[1]);
    if (worldBuilt !== objs) { buildWorld(objs); worldBuilt = objs; }
    setInside(inB ?? -1);
    setCam(camP);
    U.t.value = now / 1000;
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
  return { weaponImage, ruin: () => ({ decals: ruinDecals, v: ruinV, fires: fireSpots, plumes: plumeSrc }), scene, camera, MAT, smashWall, flash: (p, h, s) => flashAt(at(p, h), s), puff: (p, h) => puffAt(at(p, h)), hitNear: (objs, p) => hitNear(objs, p), chars, frame, resize, project, screenToGround, killObj, preview, renderer, CAM_F, CAM_R, bloodAt, altarBroken, breakGlass, reviveObj, boom, objState, debris: (p, h, n, col, sp, sz) => debrisAt(at(p, h), n, col, sp, sz) };
})();
