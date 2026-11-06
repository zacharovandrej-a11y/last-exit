// ===== LAST EXIT — 3D-мир (Three.js, low-poly), изометрическая камера над плоской картой =====
const G3 = (() => {
  const T = THREE;
  const glc = document.getElementById('g');
  const lowEnd = Math.min(screen.width, screen.height) < 500;
  // стиль «как в 90-х»: рендер в низком разрешении + растягивание по пикселям (#hd — чёткая картинка)
  // стиль: по умолчанию мультяшный (контуры только у людей); #toonall — контуры у всего; #bright — яркий без контуров; #real — старый реализм с пикселями
  const STYLE = /real/.test(location.hash) ? 'real' : /bright/.test(location.hash) ? 'bright' : 'toon', OUTLINE_ALL = /toonall/.test(location.hash);
  const HD = /hd/.test(location.hash) || STYLE !== 'real', PIXH = 360;
  const renderer = new T.WebGLRenderer({ canvas: glc, antialias: HD, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  if (!HD) glc.style.imageRendering = 'pixelated';
  const scene = new T.Scene(); scene.background = new T.Color(0x2a4b58);
  // ортогональная камера под постоянным углом (изометрия): карта не вращается, «вверх» на экране — всегда одно направление
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, -3000, 8000);
  const CAM_OFF = new T.Vector3(1, 1, 1).normalize().multiplyScalar(2500);
  const at = (p, h = 0) => new T.Vector3(p[0], h, p[1]);
  scene.add(new T.AmbientLight(0xdfe6ff, STYLE === 'real' ? .5 : .62));
  // солнце с настоящими тенями; область теней ездит за камерой
  const SUN_DIR = new T.Vector3(-.55, 1, .25).normalize();
  const sun = new T.DirectionalLight(STYLE === 'real' ? 0xffe6c4 : 0xfff3e0, STYLE === 'real' ? .95 : .85); scene.add(sun); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 10, far: 4000 }); sun.shadow.bias = -.0006;
  // общий «цветокор»: приглушённые цвета, чуть тёплый оттенок
  const GRADE = STYLE === 'real' ? 'float lum_=dot(gl_FragColor.rgb,vec3(.299,.587,.114));gl_FragColor.rgb=mix(vec3(lum_),gl_FragColor.rgb,.62)*vec3(1.03,1.,.88);'
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
  const outlineMat = w => { const m = new T.MeshBasicMaterial({ color: 0x1b1612, side: T.BackSide });
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 p_=vec4(transformed,1.);mat3 nm_=mat3(1.);
#ifdef USE_INSTANCING
p_=instanceMatrix*p_;nm_=mat3(instanceMatrix);
#endif
vec4 wp_=modelMatrix*p_;vec3 wn_=normalize(mat3(modelMatrix)*normalize(nm_*normal));wp_.xyz+=wn_*${w.toFixed(2)};vec4 mvPosition=viewMatrix*wp_;gl_Position=projectionMatrix*mvPosition;`); }; return m; };
  const OUT_B = outlineMat(2.2), OUT_C = outlineMat(1.2);
  function addOutline(mesh, mat) { if (STYLE !== 'toon') return; const o = mesh.isInstancedMesh ? new T.InstancedMesh(mesh.geometry, mat, mesh.count) : new T.Mesh(mesh.geometry, mat); if (mesh.isInstancedMesh) { o.instanceMatrix = mesh.instanceMatrix; o.frustumCulled = false; scene.add(o); mesh.userData.outline = o; } else mesh.add(o); }
  const matCache = {};
  const lam = (col, opt = {}) => { const k = col + JSON.stringify(opt); return matCache[k] || (matCache[k] = charrable(MAT(Object.assign({ color: col, map: grunge }, opt)))); };

  // ===== земля =====
  const loader = new T.TextureLoader();
  const grassTex = typeof ART === 'object' && ART.grass ? loader.load(ART.grass) : null;
  if (grassTex) { grassTex.wrapS = grassTex.wrapT = T.MirroredRepeatWrapping; }
  const crateTex = typeof ART === 'object' && ART.crate ? loader.load(ART.crate) : null;
  const gsize = HALF * 2 + 4000, gg = new T.PlaneGeometry(gsize, gsize, 1, 1); gg.rotateX(-Math.PI / 2);
  const ground = new T.Mesh(gg, new T.ShaderMaterial({
    uniforms: Object.assign(T.UniformsUtils.clone(T.UniformsLib.lights), { grass: { value: grassTex }, hasGrass: { value: grassTex ? 1 : 0 }, bc: { value: BIOMES.map(b => new T.Vector2(b.c[0], b.c[1])) }, bcol: { value: BIOMES.map(b => new T.Color(b.col)) }, brad: { value: BIOMES.map(b => b.r) } }, U),
    lights: true,
    vertexShader: '#include <common>\n#include <shadowmap_pars_vertex>\nvarying vec2 vP;void main(){vec3 transformedNormal=normalMatrix*vec3(0.,1.,0.);vec4 worldPosition=modelMatrix*vec4(position,1.);vP=worldPosition.xz;gl_Position=projectionMatrix*viewMatrix*worldPosition;\n#include <shadowmap_vertex>\n}',
    fragmentShader: `
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform vec2 zc;uniform float zrho;uniform vec2 nc;uniform float nrho;uniform float t;
uniform vec2 bc[6];uniform vec3 bcol[6];uniform float brad[6];uniform sampler2D grass;uniform float hasGrass;
varying vec2 vP;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float noise(vec2 x){vec2 i=floor(x);vec2 f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec3 col=hasGrass>.5?texture2D(grass,vP/170.).rgb:vec3(.42,.74,.29);
 col*=.88+.24*noise(vP*.012);
 ${STYLE === 'real' ? 'col=mix(vec3(dot(col,vec3(.3,.59,.11))),col,.72)*vec3(.93,.9,.7);' : 'col*=vec3(1.02,1.05,.95);'} // трава: оливковая (реализм) или сочная
 float nb=noise(vP*.04);
 // вытоптанная земля и грязь пятнами
 float dn=noise(vP*.005)*.7+noise(vP*.021)*.45;
 col=mix(col,vec3(.47,.38,.27)*(.8+.35*nb),smoothstep(.72,.86,dn)*.85);
 col=mix(col,col*vec3(.78,.74,.6),smoothstep(.45,.7,noise(vP*.009)));
 for(int i=0;i<6;i++){float e=smoothstep(brad[i]+12.,brad[i]-12.,length(vP-bc[i])+(nb-.5)*30.);col=mix(col,bcol[i]*(.9+.18*nb),e);}
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
  const M = (x, y, z, sx, sy, sz, ry = 0, rz = 0) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, rz)), new T.Vector3(sx, sy, sz));
  const MX = (x, y, z, sx, sy, sz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)), new T.Vector3(sx, sy, sz)); // цилиндр вдоль Z
  // приглушённые реальные цвета; у каждого экземпляра свой оттенок
  const VAR = {
    house: [0xd8cfbe, 0xc9b79c, 0xb9b3a6, 0xe0d5c0, 0xc4a98a], roof: [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34],
    car: [0x2f4a63, 0x6e2626, 0x8a7d5e, 0xaeb0ab, 0x3a4a3a, 0x232323, 0x5e6266], house2: [0xbdb5a6, 0xa9a39a, 0xc8bfae, 0x9c958a],
    leaf: [0x3b5323, 0x4a6b2a, 0x55702f, 0x3f5a26, 0x5c6b2e], leaf2: [0x2f4a1f, 0x3d5a24, 0x47622a], pine: [0x2c4a2a, 0x2f5233, 0x34502c], rock: [0x7d7b74, 0x8a857a, 0x6e6c66],
  };
  // части каждого типа: [геометрия, цвет (или ключ VAR), матрица в единицах w/h объекта]
  const PARTS = {
    tree: (w) => { const k = w / 44; return [[geo.cyl6, 0x4a3626, M(0, 15 * k, 0, 3.2 * k, 30 * k, 3.2 * k)], [geo.cyl6, 0x4a3626, M(5 * k, 28 * k, 0, 1.6 * k, 14 * k, 1.6 * k, 0, -.7)],
      [geo.dod, 'leaf2', M(0, 38 * k, 0, 21 * k, 15 * k, 21 * k)], [geo.dod, 'leaf', M(-8 * k, 48 * k, 5 * k, 15 * k, 13 * k, 15 * k, 1)], [geo.dod, 'leaf', M(9 * k, 50 * k, -4 * k, 14 * k, 12 * k, 14 * k, 2)], [geo.dod, 'leaf', M(1 * k, 60 * k, 1 * k, 12 * k, 11 * k, 12 * k, 3)]]; },
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
    car: (w, h) => [[geo.box, 'car', M(0, 15, 0, w, 16, h)], [geo.box, 'car', M(-w * .08, 30, 0, w * .5, 14, h * .86)], [geo.box, 0x26323a, M(-w * .08, 30, 0, w * .52, 9, h * .88)], [geo.box, 'car', M(-w * .08, 37.5, 0, w * .48, 1.5, h * .84)],
      [geo.box, 0x1e1e1e, M(w / 2, 10, 0, 3, 7, h * .96)], [geo.box, 0x1e1e1e, M(-w / 2, 10, 0, 3, 7, h * .96)], [geo.box, 0xf2edd0, M(w / 2 + .6, 18, h * .3, 1, 4, 9)], [geo.box, 0xf2edd0, M(w / 2 + .6, 18, -h * .3, 1, 4, 9)], [geo.box, 0x9a1c1c, M(-w / 2 - .6, 18, h * .32, 1, 4, 8)], [geo.box, 0x9a1c1c, M(-w / 2 - .6, 18, -h * .32, 1, 4, 8)],
      [geo.cyl10, 0x1c1c1c, MX(w * .32, 9, 0, 9, h * 1.04, 9)], [geo.cyl10, 0x1c1c1c, MX(-w * .3, 9, 0, 9, h * 1.04, 9)]],
    truck: (w, h) => [[geo.box, 0x3d4a2a, M(w * .32, 24, 0, w * .3, 34, h)], [geo.box, 0x26323a, M(w * .45, 32, 0, w * .06, 12, h * .9)], [geo.box, 0x4a5233, M(-w * .15, 30, 0, w * .66, 40, h * 1.02)], [geo.box, 0x3a4228, M(-w * .15, 51, 0, w * .66, 3, h * 1.02)],
      [geo.box, 0x1e1e1e, M(0, 9, 0, w, 6, h * .7)], [geo.cyl10, 0x1c1c1c, MX(w * .32, 10, 0, 10, h * 1.04, 10)], [geo.cyl10, 0x1c1c1c, MX(-w * .05, 10, 0, 10, h * 1.04, 10)], [geo.cyl10, 0x1c1c1c, MX(-w * .35, 10, 0, 10, h * 1.04, 10)]],
    crate: () => [[geo.box, 'crate', M(0, 13, 0, 26, 26, 26)]],
    furn: (w, h, o) => { const k = o.fk;
      if (k === 'bed') return [[geo.box, 0x5a4632, M(0, 5, 0, w, 10, h)], [geo.box, 0xcfc8b8, M(0, 11, h * .05, w * .9, 3, h * .8)], [geo.box, 0x6b7a5a, M(0, 11.5, h * .12, w * .92, 3, h * .5)], [geo.box, 0xe8e4da, M(0, 12.5, -h * .38, w * .7, 3, h * .14)]];
      if (k === 'bunk') return [[geo.box, 0x4a4f4a, M(0, 6, 0, w, 3, h)], [geo.box, 0x55603a, M(0, 8, 0, w * .9, 2, h * .9)], [geo.box, 0x4a4f4a, M(0, 24, 0, w, 3, h)], [geo.box, 0x55603a, M(0, 26, 0, w * .9, 2, h * .9)], [geo.box, 0x3a3d3a, M(w * .45, 14, h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(-w * .45, 14, -h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(w * .45, 14, -h * .45, 1.6, 28, 1.6)], [geo.box, 0x3a3d3a, M(-w * .45, 14, h * .45, 1.6, 28, 1.6)]];
      if (k === 'table') return [[geo.box, 0x6b4a2e, M(0, 13, 0, w, 2.5, h)], [geo.box, 0x4a3624, M(w * .4, 6, h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(-w * .4, 6, h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(w * .4, 6, -h * .35, 2, 12, 2)], [geo.box, 0x4a3624, M(-w * .4, 6, -h * .35, 2, 12, 2)], [geo.box, 0xe8e4da, M(w * .15, 15, 0, 6, 1.5, 5)]];
      if (k === 'desk') return [[geo.box, 0x5a4a3a, M(0, 13, 0, w, 2.5, h)], [geo.box, 0x4a3c2e, M(w * .3, 6, 0, w * .35, 12, h * .9)], [geo.box, 0x2a2a2a, M(-w * .1, 18, 0, 8, 7, 2)], [geo.box, 0x34342f, M(-w * .1, 7, h * .7, 8, 14, 8)]];
      if (k === 'sofa') return [[geo.box, 0x5a3a3a, M(0, 5, 0, w, 10, h)], [geo.box, 0x4a2e2e, M(0, 12, -h * .35, w, 14, h * .3)], [geo.box, 0x4a2e2e, M(w * .45, 9, 0, w * .1, 10, h)], [geo.box, 0x4a2e2e, M(-w * .45, 9, 0, w * .1, 10, h)]];
      if (k === 'bench') return [[geo.box, 0x6b4a2e, M(0, 8, 0, w, 2.5, h)], [geo.box, 0x5a3c24, M(-w * .42, 14, 0, 2, 12, h)], [geo.box, 0x4a3220, M(0, 4, h * .42, w * .8, 8, 2)], [geo.box, 0x4a3220, M(0, 4, -h * .42, w * .8, 8, 2)]];
      if (k === 'altar0') return [[geo.box, 0xf2efe6, M(0, 11, 0, w, 22, h)], [geo.box, 0xff7eb0, M(0, 22.5, 0, w * .9, 1.5, h * .5)], [geo.box, 0xff7eb0, M(-1, 26, -6, 12, 4, 20)], [geo.dome, 0xff9ec4, M(-1, 26, -16, 6, 5, 6)], [geo.box, 0xffffff, M(-1, 29, -4, 12, 2, 4)], [geo.box, 0x6b4a2e, M(-2, 24, 12, 8, 3, 10)]];
      if (k === 'altar1') return [[geo.box, 0x2a2630, M(0, 10, 0, w, 20, h)], [geo.box, 0x7a1020, M(0, 20.5, 0, w * 1.02, 1.5, h * .8)], ...[-16, -6, 6, 16].map(z => [geo.cyl6, 0xe8dcc0, M(-4, 25, z, 1.4, 8, 1.4)]), ...[-16, -6, 6, 16].map(z => [geo.cone7, 0xffb347, M(-4, 30.5, z, 1.2, 3, 1.2)]), [geo.sph, 0x8a8a90, M(2, 25, 0, 5, 4, 4)], [geo.cone7, 0xd8a040, M(-3, 25, 0, 1.4, 4, 1.4, 0, 1.57)], [geo.box, 0xa259ff, M(9, 30, 0, 1.5, 20, 30)]];
      if (k === 'altar2') return [[geo.box, 0x5a4a3a, M(0, 12, 0, w, 2.5, h)], [geo.box, 0x4a3c2e, M(0, 6, 0, w * .8, 12, h * .9)], [geo.box, 0xa8784a, M(8, 32, 0, 2, 30, h * 1.1)], ...[[-12, 38], [8, 40], [14, 28], [-6, 26], [0, 34]].map(([z, y]) => [geo.box, 0xf2efe6, M(6.6, y, z, .5, 6, 7)]), [geo.box, 0xd02020, M(6.2, 34, 0, .4, .8, 28, 0, 0)], [geo.box, 0xd02020, M(6.2, 33, 2, .4, 14, .8, .0, 0)], [geo.dome, 0xd8dde2, M(-3, 14, 10, 5, 6, 5)]];
      if (k === 'altar3') return [[geo.box, 0x2a4a8a, M(0, 9, 0, w * .7, 18, h * .4)], [geo.box, 0x3d8bff, M(0, 19, 0, w * .8, 2, h * .5)], [geo.box, 0x55595e, M(8, 30, -14, 2, 40, 2)], [geo.box, 0x55595e, M(8, 30, 14, 2, 40, 2)], [geo.box, 0xffd43b, M(8, 42, 0, 1.5, 24, h)], [geo.box, 0x3d8bff, M(7, 42, 0, .5, 18, h * .85)], [geo.box, 0xffffff, M(6.6, 44, 0, .4, 3, h * .6)]];
      return [[geo.box, 0x6e6a62, M(0, 15, 0, w, 30, h)], [geo.box, 0xa8543a, M(-w * .2, 21, 0, w * .35, 6, h * .8)], [geo.box, 0x5a7a8a, M(w * .22, 21, 0, w * .3, 6, h * .8)], [geo.box, 0xc9a85a, M(0, 9, 0, w * .8, 6, h * .8)]]; },
    barrel: (w) => [[geo.cyl10, 0x4a5a3a, M(0, 12, 0, w / 2, 24, w / 2)], [geo.cyl10, 0x2e3a26, M(0, 8, 0, w / 2 + .3, 1.5, w / 2 + .3)], [geo.cyl10, 0x2e3a26, M(0, 17, 0, w / 2 + .3, 1.5, w / 2 + .3)]],
    fence: (w) => [[geo.box, 0x6b5238, M(0, 10, 0, w, 2, 2)], [geo.box, 0x6b5238, M(0, 18, 0, w, 2, 2)], ...[-.5, -.25, 0, .25, .5].map(k => [geo.box, 0x5a4430, M(w * k * .96, 11, 0, 3, 22, 3)])],
    bush: (w) => { const k = w / 34; return [[geo.dod, 'leaf2', M(0, 8 * k, 0, 15 * k, 11 * k, 15 * k)], [geo.dod, 'leaf', M(7 * k, 11 * k, 4 * k, 9 * k, 9 * k, 9 * k, 1)], [geo.dod, 'leaf', M(-6 * k, 10 * k, -3 * k, 9 * k, 8 * k, 9 * k, 2)]]; },
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
    billboard: (w) => [[geo.box, 0x55595e, M(-w * .3, 22, 0, 3, 44, 3)], [geo.box, 0x55595e, M(w * .3, 22, 0, 3, 44, 3)], [geo.box, 0xf2f0ea, M(0, 56, 0, w, 32, 3)], [geo.box, 0x3d8bff, M(0, 56, 1.8, w * .9, 26, .6)], [geo.box, 0xffd43b, M(-w * .1, 62, 2.3, w * .55, 4, .4)], [geo.box, 0xffffff, M(0, 54, 2.3, w * .7, 3, .4)], [geo.box, 0xffffff, M(-w * .08, 48, 2.3, w * .5, 3, .4)], [geo.box, 0xff5a5a, M(0, 56, -1.8, w * .9, 26, .6)], [geo.box, 0xffffff, M(w * .05, 60, -2.3, w * .6, 4, .4)], [geo.box, 0xffd43b, M(0, 50, -2.3, w * .4, 3, .4)]],
  };
  // лёгкая разница в размерах деревьев и камней
  const sizeVar = o => (o.type === 'tree' || o.type === 'pine' || o.type === 'rock' || o.type === 'cactus') ? .82 + ((o.id * 37) % 36) / 100 : 1;
  const inst = {}; // key -> {mesh}
  const objIdx = []; // id -> [[mesh, index]]
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  const basisAt = o => { const k = sizeVar(o); return new T.Matrix4().compose(new T.Vector3(o.p[0], 0, o.p[1]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -o.a), new T.Vector3(k, k, k)); };
  function buildWorld(objs) {
    for (const k in inst) { scene.remove(inst[k].mesh); if (inst[k].mesh.userData.outline) scene.remove(inst[k].mesh.userData.outline); delete inst[k]; }
    objIdx.length = 0;
    const plan = {};
    for (const o of objs) {
      const f = PARTS[o.type]; if (!f) continue; const parts = f(o.w, o.h, o);
      parts.forEach(([g, col, lm], pi) => {
        const key = o.type + '|' + (o.fk || '') + '|' + pi + '|' + g.uuid + '|' + col;
        (plan[key] = plan[key] || { g, col, items: [] }).items.push([o, lm]);
      });
    }
    for (const key in plan) {
      const { g, col, items } = plan[key];
      const mat = col === 'crate' ? lam(0xfffffe, crateTex ? { map: crateTex } : {}) : lam(0xffffff); // цвет — у каждого экземпляра
      const mesh = new T.InstancedMesh(g, mat, items.length); mesh.frustumCulled = false; mesh.castShadow = true;
      items.forEach(([o, lm], i) => {
        const m = basisAt(o).multiply(lm); mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new T.Color(typeof col === 'string' ? (VAR[col] ? VAR[col][o.id % VAR[col].length] : 0xffffff) : col));
        (objIdx[o.id] = objIdx[o.id] || []).push([mesh, i]);
        if (o.dead) mesh.setMatrixAt(i, zero);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); inst[key] = { mesh }; if (OUTLINE_ALL) addOutline(mesh, OUT_B);
    }
    buildBuildings(objs);
  }
  // ===== здания =====
  // процедурные текстуры (серые — цвет задаёт оттенок экземпляра)
  function tex(f, n = 128) { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); f(g, n, mkRng(n * 7 + f.length)); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; return t; }
  const noiseFill = (g, n, rnd, base, amp, k = 1800) => { g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, n, n); for (let i = 0; i < k; i++) { const v = base + (rnd() - .5) * amp | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * n | 0, rnd() * n | 0, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); } };
  const TX = {
    brick: tex((g, n, rnd) => { g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 8) for (let x = -16; x < n; x += 16) { const o = (y / 8) % 2 ? 8 : 0, v = 150 + rnd() * 50 | 0; g.fillStyle = `rgb(${v + 20},${v},${v - 10})`; g.fillRect(x + o + 1, y + 1, 14, 6); } }),
    plaster: tex((g, n, rnd) => { noiseFill(g, n, rnd, 225, 30); g.strokeStyle = 'rgba(90,80,70,.35)'; for (let i = 0; i < 4; i++) { g.beginPath(); let x = rnd() * n, y = rnd() * n; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - .5) * 16; y += rnd() * 10; g.lineTo(x, y); } g.stroke(); } }),
    concrete: tex((g, n, rnd) => { noiseFill(g, n, rnd, 200, 40); g.fillStyle = 'rgba(70,70,70,.35)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 63, n, 1); g.fillRect(0, 0, 1, n); g.fillRect(63, 0, 1, n); }),
    wood: tex((g, n, rnd) => { for (let x = 0; x < n; x += 12) { const v = 165 + rnd() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 12, n); g.fillStyle = 'rgba(40,30,20,.45)'; g.fillRect(x, 0, 1, n); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(60,45,30,.2)'; g.fillRect(x + 2 + rnd() * 8, rnd() * n, 1, 10 + rnd() * 20); } } }),
    metal: tex((g, n) => { for (let x = 0; x < n; x++) { const v = 185 + Math.sin(x / 4 * Math.PI) * 35 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, n); } }),
    adobe: tex((g, n, rnd) => { noiseFill(g, n, rnd, 215, 45, 2600); }),
    fwood: tex((g, n, rnd) => { for (let y = 0; y < n; y += 10) { let x = -rnd() * 40; while (x < n) { const l = 30 + rnd() * 40, v = 150 + rnd() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, l, 10); g.fillStyle = 'rgba(30,20,10,.5)'; g.fillRect(x, y, 1, 10); x += l; } g.fillStyle = 'rgba(30,20,10,.5)'; g.fillRect(0, y, n, 1); } }),
    tile: tex((g, n, rnd) => { for (let y = 0; y < n; y += 32) for (let x = 0; x < n; x += 32) { const v = ((x + y) / 32) % 2 ? 235 : 200; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 32, 32); } g.fillStyle = 'rgba(60,60,60,.5)'; for (let i = 0; i < n; i += 32) { g.fillRect(i, 0, 1, n); g.fillRect(0, i, n, 1); } }),
    floorc: tex((g, n, rnd) => { noiseFill(g, n, rnd, 190, 30); g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rnd() * n, rnd() * n, 6 + rnd() * 16, 0, 6.28); g.fill(); } }),
    dirt: tex((g, n, rnd) => { noiseFill(g, n, rnd, 180, 60, 3000); }),
    rooftile: tex((g, n, rnd) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 8) for (let x = (y / 8) % 2 ? -6 : 0; x < n; x += 12) { const v = 175 + rnd() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(x + 6, y + 4, 6, 5, 0, 0, Math.PI); g.fill(); } }),
    gravel: tex((g, n, rnd) => { noiseFill(g, n, rnd, 170, 70, 4000); }),
  };
  // материал с текстурой «по миру»: стены, пол, крыша любой длины без растяжения
  const texMats = {};
  function texMat(name, scale) {
    const k = name + scale; if (texMats[k]) return texMats[k];
    const m = MAT({ color: 0xffffff, map: TX[name] });
    m.onBeforeCompile = sh => {
      sh.uniforms.zc = U.zc; sh.uniforms.zrho = U.zrho;
      sh.vertexShader = 'varying vec3 vWP;varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nmat4 mw_=modelMatrix*instanceMatrix;\n#else\nmat4 mw_=modelMatrix;\n#endif\nvWP=(mw_*vec4(transformed,1.)).xyz;vWN=normalize(mat3(mw_)*objectNormal);');
      sh.fragmentShader = 'varying vec3 vWP;varying vec3 vWN;uniform vec2 zc;uniform float zrho;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `vec3 an_=abs(vWN);vec2 wuv_=an_.y>.6?vWP.xz:(an_.x>an_.z?vWP.zy:vWP.xy);vec4 texelColor=texture2D(map,wuv_/${scale.toFixed(1)});texelColor=mapTexelToLinear(texelColor);diffuseColor*=texelColor;`)
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + GRADE + 'if(length(vWP.xz-zc)>zrho)gl_FragColor.rgb=gl_FragColor.rgb*.16+vec3(.05,.02,.01);');
    };
    return texMats[k] = m;
  }
  const BSTY = {
    plaster: { tex: 'plaster', cols: [0xe0d6c2, 0xd8cfbe, 0xcdbfa6, 0xd9c9b0] }, plaster2: { tex: 'plaster', cols: [0xc9c2b4, 0xbcb4a6, 0xd6cfc0, 0xb8a990] },
    brick: { tex: 'brick', cols: [0xb8705a, 0xa86450, 0xc08068] }, concrete: { tex: 'concrete', cols: [0xbdb8ae, 0xaaa69e, 0x9c988f] },
    wood: { tex: 'wood', cols: [0x8a5a3a, 0x7a3a2c, 0x6e5238] }, metal: { tex: 'metal', cols: [0x8a8f86, 0x7a8478, 0x9a9488] }, adobe: { tex: 'adobe', cols: [0xd9b88a, 0xcfa878, 0xe0c49a] },
    hallbrick: { tex: 'brick', cols: [0xe0c49a] }, stone: { tex: 'concrete', cols: [0x5a5660] }, white: { tex: 'plaster', cols: [0xf4f2ec] },
  };
  const FLOOR = { wood: ['fwood', 0x9a7350], tile: ['tile', 0xb8b4aa], concrete: ['floorc', 0x99968e], dirt: ['dirt', 0x8a7556] };
  const ROOFC = [0x7e3a2c, 0x4a4f57, 0x6b4a3a, 0x5b4636, 0x8a4a34];
  const bInst = {}, bParts = []; let insideB = -1; const deco = {};
  // вывеска с текстом: всегда повёрнута к камере, чтобы читалась
  function sign(bid, wp, y, w, h, lines, bg, fg, frame) {
    const c = document.createElement('canvas'), k = 6; c.width = w * k; c.height = h * k; const g = c.getContext('2d');
    g.fillStyle = frame || bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = bg; g.fillRect(k * 1.2, k * 1.2, c.width - k * 2.4, c.height - k * 2.4);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([t, sz], i) => { g.font = '900 ' + (sz * k) + 'px system-ui,sans-serif'; const mw = g.measureText(t).width, lim = c.width - k * 5; if (mw > lim) g.font = '900 ' + Math.floor(sz * k * lim / mw) + 'px system-ui,sans-serif'; g.fillText(t, c.width / 2, c.height * (i + .5) / lines.length + (lines.length > 1 ? (i ? -k : k) : 0)); });
    const tx = new T.CanvasTexture(c); tx.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tx, side: T.DoubleSide }));
    m.position.set(wp[0], y, wp[1]); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(CAM_OFF.x, CAM_OFF.z); m.rotation.x = -.25; scene.add(m); (deco[bid] = deco[bid] || []).push(m); return m;
  }
  // уникальный вид церквей сект
  function churchDeco(b, K, pcs) {
    const d = b.doors[0], dc = lerp(d.i, d.o, .5), rr_ = sub(dc, b.p), lx = dot(rr_, b.u), ly = dot(rr_, b.v), n = sub(d.o, d.i), nl = [dot(n, b.u), dot(n, b.v)], ax = Math.abs(nl[0]) > Math.abs(nl[1]);
    const fx = ax ? Math.sign(nl[0]) : 0, fz = ax ? 0 : Math.sign(nl[1]); // наружу от двери
    const out = (k, side = 0) => [lx + fx * k + (ax ? 0 : side), ly + fz * k + (ax ? side : 0)]; // точка перед дверью
    const wpt = q => add(add(b.p, b.u, q[0]), b.v, q[1]);
    const P = (g, col, m, role = 'roof', tx = 'plaster') => pcs.push([g, tx, 48, col, m, role]);
    // табличка на столбиках со стороны камеры (чтобы читалась)
    const lawn = (y, w, h, lines, bg, fg, fr, side = 0) => { const cd = norm([CAM_OFF.x, CAM_OFF.z]), wp = add(add(b.p, cd, b.rad * .8 + 30), [-cd[1], cd[0]], side), q = sub(add(wp, cd, -3.5), b.p), lq = [dot(q, b.u), dot(q, b.v)];
      for (const sd of [-1, 1]) { const o = [Math.cos(Math.atan2(CAM_OFF.x, CAM_OFF.z)) * sd * w * .38, -Math.sin(Math.atan2(CAM_OFF.x, CAM_OFF.z)) * sd * w * .38], oq = [dot(o, b.u), dot(o, b.v)]; P(geo.box, 0x55595e, M(lq[0] + oq[0], y / 2, lq[1] + oq[1], 2.4, y, 2.4), 'prop'); }
      sign(b.id, wp, y + h / 2 - 2, w, h, lines, bg, fg, fr); };
    const W = b.w, H = b.h, top = WALLH;
    if (K.church === 0) { // «Зал Вечного Тапка»: аккуратный низкий зал, газон, кусты, стойка с литературой, гигантский тапок на крыше
      const rh = Math.min(W, H) * .2;
      const sa = .3, sx_ = Math.cos(sa), sz_ = -Math.sin(sa), at = (k, y) => [k * sx_, top + rh + y, k * sz_];
      { const [x, y, z] = at(4, 3); P(geo.box, 0xff7eb0, M(x, y, z, 70, 4, 30, sa)); } { const [x, y, z] = at(-35, 3); P(geo.cyl10, 0xff7eb0, M(x, y, z, 15, 4, 15)); } { const [x, y, z] = at(39, 3); P(geo.cyl10, 0xff7eb0, M(x, y, z, 15, 4, 15)); }
      { const [x, y, z] = at(-20, 9); P(geo.box, 0xd94a8a, M(x, y, z, 14, 9, 33, sa)); } { const [x, y, z] = at(-20, 15); P(geo.box, 0xffffff, M(x, y, z, 6, 3, 18, sa)); }
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const q = out(18, sd * (36 + k * 20)); P(geo.dod, 0x3f6a2a, M(q[0], 7, q[1], 9, 8, 9), 'prop', 'plaster'); }
      const q = out(26, 34); P(geo.box, 0x4a4f57, M(q[0], 10, q[1], 10, 20, 10), 'prop'); P(geo.box, 0xff7eb0, M(q[0] + fx * 5.2, 13, q[1] + fz * 5.2, ax ? .6 : 8, 12, ax ? 8 : .6), 'prop'); P(geo.box, 0xffd43b, M(q[0] + fx * 5.3, 8, q[1] + fz * 5.3, ax ? .6 : 6, 3, ax ? 6 : .6), 'prop');
      lawn(16, 80, 24, [['ЗАЛ ВЕЧНОГО ТАПКА', 8], ['собрания по средам и воскресеньям', 4.5]], '#fff8ee', '#c2185b', '#7a8a9a');
    } else if (K.church === 1) { // «Обитель» Тёмного Ордена: крутая чёрная крыша, шпиль со сферой, каменные голуби на углах, свечи у входа
      const rh = Math.min(W, H) * .75;
      P(geo.cone7, 0x1e1c24, M(0, top + rh + 26, 0, 9, 56, 9), 'roof'); P(geo.sph, 0xa259ff, M(0, top + rh + 58, 0, 6, 6, 6), 'roof');
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const x = sx * (W / 2 - 4), z = sz * (H / 2 - 4); P(geo.box, 0x4a4650, M(x, top + 4, z, 12, 8, 12)); P(geo.sph, 0x6e6a74, M(x, top + 13, z, 6, 6, 5)); P(geo.sph, 0x6e6a74, M(x + 4, top + 19, z, 3.4, 3.4, 3.4)); P(geo.cone7, 0x9a8a50, M(x + 8, top + 19, z, 1.3, 3.5, 1.3, 0, -1.57)); }
      for (let k = -2; k <= 2; k++) { if (!k) continue; const q = out(14, k * 12); P(geo.cyl6, 0xe8dcc0, M(q[0], 5, q[1], 1.6, 10, 1.6), 'prop'); P(geo.cone7, 0xffa040, M(q[0], 11.5, q[1], 1.3, 3, 1.3), 'prop'); }
      for (const sd of [-1, 1]) { const q = out(WALLT / 2 + .8, sd * 34); P(geo.box, 0x5a1f8a, M(q[0], 38, q[1], ax ? 1 : 14, 34, ax ? 14 : 1), 'wall'); }
      lawn(14, 64, 20, [['ОБИТЕЛЬ ТЬМЫ', 9], ['голуби принимаются', 4.5]], '#14101a', '#b07cff', '#3a2a50');
    } else if (K.church === 2) { // бункер «Великого Заговора»: крыша в фольге, сломанные антенны, тарелки
      for (let i = 0; i < 16; i++) { const x = ((i * 37) % 100 / 100 - .5) * W * .85, z = ((i * 61) % 100 / 100 - .5) * H * .85; P(geo.box, i % 2 ? 0xeef2f6 : 0xc8ced6, M(x, top + 4 + (i % 3), z, 26 + i % 4 * 6, 2.5, 20 + i % 3 * 7, i * .7, (i % 5 - 2) * .06), 'roof', 'metal'); }
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = -1; k <= 1; k++) { const x = sx ? sx * (W / 2 + 2) : k * W * .3, z = sz ? sz * (H / 2 + 2) : k * H * .3; P(geo.box, 0xd8dde2, M(x, top - 6, z, sx ? 2 : 24, 16, sx ? 22 : 2, 0, sx * .12), 'roof', 'metal'); }
      P(geo.cyl6, 0x9aa0a6, M(W * .25, top + 34, -H * .2, 1.8, 60, 1.8, 0, .25), 'roof'); P(geo.box, 0x9aa0a6, M(W * .25 - 8, top + 52, -H * .2, 26, 1.4, 1.4, 0, .9), 'roof'); P(geo.box, 0x9aa0a6, M(W * .25 - 4, top + 42, -H * .2, 18, 1.4, 1.4, .5, -.4), 'roof');
      P(geo.cyl6, 0x9aa0a6, M(-W * .3, top + 18, H * .2, 1.5, 30, 1.5, 0, -.6), 'roof'); P(geo.cyl6, 0x9aa0a6, M(-W * .3 + 14, top + 5, H * .2 + 6, 1.4, 26, 1.4, .6, 1.45), 'roof');
      P(geo.dome, 0xe0e4e8, M(-W * .1, top + 14, -H * .28, 15, 5, 15, .8, 1.7), 'roof'); P(geo.cyl6, 0x777b80, M(-W * .1, top + 8, -H * .28, 2, 10, 2), 'roof');
      lawn(12, 66, 22, [['ОНИ СЛЕДЯТ!', 9], ['шапку не снимать', 4.5]], '#c8a06a', '#b01010', '#7a5a34');
    } else { // «собор» Святого Плаката: белое здание, шпиль из билбордов
      const cols = [0x3d8bff, 0xffd43b, 0xff5a5a, 0x3d8bff];
      for (let t = 0; t < 4; t++) { const s = 1 - t * .2; for (let r = 0; r < 2; r++) P(geo.box, cols[(t + r) % 4], M(0, top + 22 + t * 30, 0, 90 * s, 28, 3, r * 1.5708 + t * .4), 'roof'); P(geo.box, 0x55595e, M(0, top + 8 + t * 30, 0, 4, 30, 4), 'roof'); }
      P(geo.cone7, 0xffd43b, M(0, top + 150, 0, 8, 22, 8), 'roof');
      for (let i = 0; i < 10; i++) { const x = (i / 9 - .5) * (W - 20); for (const sd of [-1, 1]) P(geo.box, cols[(i + (sd > 0 ? 1 : 0)) % 4], M(x, 34, sd * (H / 2 + 3.6), 16, 20, .8), 'wall'); }
      for (const sd of [-1, 1]) { const q = out(20, sd * 30); P(geo.cyl10, 0xd8d4ca, M(q[0], 6, q[1], 5, 12, 5), 'prop'); P(geo.box, 0xf2efe6, M(q[0], 12.4, q[1], 7, .8, 7), 'prop'); }
      sign(b.id, add(b.p, [0, 0]), top + 100 + 22, 80, 24, [['СЛАВА ПЛАКАТУ!', 10]], '#3d8bff', '#ffffff', '#ffd43b');
    }
  }
  function buildBuildings(objs) {
    for (const k in bInst) { scene.remove(bInst[k].mesh); if (bInst[k].mesh.userData.outline) scene.remove(bInst[k].mesh.userData.outline); delete bInst[k]; }
    bParts.length = 0; insideB = -1; for (const k in deco) { deco[k].forEach(m => scene.remove(m)); delete deco[k]; }
    const plan = {}, Y = new T.Vector3(0, 1, 0), ONE = new T.Vector3(1, 1, 1);
    for (const b of objs.blds || []) {
      const K = BKIND[b.kind], S = BSTY[K.style], base = new T.Matrix4().compose(new T.Vector3(b.p[0], 0, b.p[1]), new T.Quaternion().setFromAxisAngle(Y, -b.a), ONE);
      const wc = S.cols[b.id % S.cols.length], wm = S.tex, pcs = [];
      const [ft, fc] = FLOOR[K.floor]; pcs.push([geo.box, ft, 48, fc, M(0, .8, 0, b.w - 2, 1.6, b.h - 2), 'floor']);
      for (const id of b.walls) {
        const o = objs[id], L = o.len, sx = o.hor ? L : WALLT, sz = o.hor ? WALLT : L, X = o.lx, Z = o.ly;
        if (o.win) { // окно: подоконник, перемычка, рама; посередине пусто — видно и стреляют
          const sill = K.slit ? 36 : 24, top = K.slit ? 44 : 50;
          pcs.push([geo.box, wm, 48, wc, M(X, sill / 2, Z, sx, sill, sz), 'wall', M(X, 7, Z, sx, 14, sz)]);
          pcs.push([geo.box, wm, 48, wc, M(X, (top + WALLH) / 2, Z, sx, WALLH - top, sz), 'top']);
          if (!K.slit) { const fx = o.hor ? sx : WALLT + 1, fz = o.hor ? WALLT + 1 : sz; pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(X, sill + 1, Z, fx + 2, 2, fz + 2), 'win']); pcs.push([geo.box, 'plaster', 48, 0xe8e4da, M(X, top - 1, Z, fx + 2, 2, fz + 2), 'win']);
            pcs.push([geo.box, 'plaster', 48, 0xd8d4ca, M(X, (sill + top) / 2, Z, o.hor ? 1.6 : WALLT * .4, top - sill, o.hor ? WALLT * .4 : 1.6), 'win']); }
        } else pcs.push([geo.box, wm, 48, wc, M(X, WALLH / 2, Z, sx, WALLH, sz), 'wall', M(X, 7, Z, sx, 14, sz)]);
      }
      // перемычки над дверями (наружными и внутренними)
      const dw = (K.door || DOOR) + 2;
      for (const d of b.doors) { const c = lerp(d.i, d.o, .5), r = sub(c, b.p), lx = dot(r, b.u), ly = dot(r, b.v), n = sub(d.o, d.i), hor = Math.abs(dot(n, b.v)) > Math.abs(dot(n, b.u));
        pcs.push([geo.box, wm, 48, wc, M(hor ? lx : Math.sign(lx) * (b.w / 2 - WALLT / 2), WALLH - 8, hor ? Math.sign(ly) * (b.h / 2 - WALLT / 2) : ly, hor ? dw : WALLT, 16, hor ? WALLT : dw), 'top']); }
      for (const [x, y] of b.idoors) { const onV = b.walls.some(i => { const o = objs[i]; return !o.hor && Math.abs(o.lx - x) < 1; }); pcs.push([geo.box, wm, 48, wc, M(x, WALLH - 8, y, onV ? WALLT : DOOR + 2, 16, onV ? DOOR + 2 : WALLT), 'top']); }
      // крыша
      const rc = ROOFC[b.id % ROOFC.length];
      const GR = { gable: [.38, K.style === 'metal' ? 0x7a807a : rc], lowgable: [.2, 0x5a6068], steep: [.75, 0x2a2730] }[K.roof];
      if (GR) { const along = b.w >= b.h; pcs.push([geo.roof, 'rooftile', 24, GR[1], along ? M(0, WALLH, 0, b.w * 1.04, Math.min(b.h, b.w) * GR[0], b.h * 1.08) : M(0, WALLH, 0, b.h * 1.04, Math.min(b.h, b.w) * GR[0], b.w * 1.08, 1.5708), 'roof']); }
      else { pcs.push([geo.box, K.roof === 'foil' ? 'metal' : 'gravel', K.roof === 'foil' ? 9 : 32, K.roof === 'foil' ? 0xdfe4ea : 0x8a867e, M(0, WALLH + 1.5, 0, b.w + 2, 3, b.h + 2), 'roof']); pcs.push([geo.box, wm, 48, wc, M(0, WALLH + 4.5, b.h / 2 - 1, b.w + 3, 6, 3), 'roof']); pcs.push([geo.box, wm, 48, wc, M(0, WALLH + 4.5, -b.h / 2 + 1, b.w + 3, 6, 3), 'roof']);
        pcs.push([geo.box, wm, 48, wc, M(b.w / 2 - 1, WALLH + 4.5, 0, 3, 6, b.h), 'roof']); pcs.push([geo.box, wm, 48, wc, M(-b.w / 2 + 1, WALLH + 4.5, 0, 3, 6, b.h), 'roof']);
        if (!K.church) pcs.push([geo.box, 'metal', 24, 0x9a9a92, M(b.w * .22, WALLH + 7, -b.h * .15, 22, 10, 16), 'roof']); }
      if (K.church !== undefined) churchDeco(b, K, pcs);
      bParts[b.id] = [];
      for (const [g, tx, sc, col, lm, role, low] of pcs) { const key = g.uuid + '|' + tx + '|' + sc + '|' + (role === 'floor' ? 'f' : 'w'); (plan[key] = plan[key] || { g, tx, sc, items: [] }).items.push([b.id, col, base.clone().multiply(lm), role, low ? base.clone().multiply(low) : null]); }
    }
    for (const key in plan) {
      const { g, tx, sc, items } = plan[key];
      const mesh = new T.InstancedMesh(g, texMat(tx, sc), items.length); mesh.frustumCulled = false; mesh.castShadow = !key.endsWith('f'); mesh.receiveShadow = true;
      items.forEach(([bid, col, m, role, low], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new T.Color(col)); bParts[bid].push([mesh, i, m, role, low]); });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); bInst[key] = { mesh }; if (OUTLINE_ALL && !key.endsWith('f')) addOutline(mesh, OUT_B);
    }
  }
  // игрок внутри здания: крыша исчезает, стены опускаются — видно, что внутри
  function setInside(bid) {
    if (bid === insideB) return;
    const set = (id, open) => { for (const [mesh, i, m, role, low] of bParts[id] || []) { mesh.setMatrixAt(i, !open || role === 'floor' || role === 'prop' ? m : low || zero); mesh.instanceMatrix.needsUpdate = true; } };
    if (insideB >= 0) set(insideB, false); insideB = bid; if (bid >= 0) set(bid, true);
    for (const k in deco) for (const m of deco[k]) m.visible = +k !== bid;
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
    else if (w === 9) { b(0x1e1e1e, 0, 0, 3, 2.4, 3.2, 9); b(0x1e1e1e, 0, 0, 10, 2.6, 2.6, 6); tube(METAL, 0, .4, 15, .6, 6); b(0x1e1e1e, 0, -3.8, 4, 1.8, 5, 2.6, .25); b(0x1e1e1e, 0, 0, -4.5, 2, 3, 6); b(0x111111, 0, 2.6, 3, 1.4, 2, 2.6); b(0xff3030, 0, 3.8, 3, .5, .5, .5); } // карабин
    if (rar > 0) b(new T.Color(RARITY[rar]).getHex(), 0, 0, band, 2.7, 3.2, 1.2); // полоска редкости
    return g;
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
  function makeChar(ch) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const cv = ch >= CH_SECT ? CIV_S[(ch - CH_SECT) % 4] : ch >= 100 ? CIV[(ch - 100) % CIV.length] : null;
    if (STYLE !== 'real') g.scale.setScalar(1.15); // в ярких стилях люди крупнее
    const cm = camo(ch), mats = cv ? { shirt: charrable(MAT({ color: cv.shirt })), skin: charrable(MAT({ color: cv.skin })), pants: charrable(MAT({ color: cv.pants })) } : { shirt: charrable(MAT({ color: 0xffffff, map: cm })), skin: charrable(MAT({ color: SKIN[ch % 10] })), pants: charrable(MAT({ color: 0xe8e8e8, map: cm })) };
    const part = (gg, mat, x, y, z, sx, sy, sz, par = body) => { const o = new T.Mesh(gg, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); par.add(o); return o; };
    const boot = lam(cv && cv.boots || 0x2e241b), gear = lam(0x3b3d30), belt = lam(cv ? 0x2a2420 : 0x26261f);
    // ноги: бедро + голень (колено гнётся)
    const leg = s => { const hip = new T.Group(); hip.position.set(s * 3.1, 24, 0); body.add(hip); part(geo.box, mats.pants, 0, -6, 0, 5, 12, 5.6, hip);
      const knee = new T.Group(); knee.position.y = -12; hip.add(knee); part(geo.box, mats.pants, 0, -5.5, 0, 4.6, 11, 5.2, knee); part(geo.box, boot, 0, -11, 1.2, 5, 3.4, 8, knee); return [hip, knee]; };
    const [legL, kneeL] = leg(-1), [legR, kneeR] = leg(1);
    part(geo.box, belt, 0, 25, 0, 13.6, 2.4, 7.6);
    const torso = part(geo.box, mats.shirt, 0, 33, 0, cv && cv.wide ? 16 : 13, 15, cv && cv.wide ? 8.5 : 7);
    if (!cv) { part(geo.box, gear, 0, 33.5, 3.8, 9, 7, 1); for (const s of [-1, 1]) part(geo.box, gear, s * 3.8, 33.5, 0, 1.4, 15.2, 7.4); } // разгрузка — только у бойцов
    else {
      if (cv.skirt) part(geo.box, lam(cv.skirt), 0, cv.long ? 14 : 20, 0, 14, cv.long ? 24 : 12, 9); // юбка / плащ / ряса
      if (cv.tie) { part(geo.box, lam(0xf4f4f0), 0, 36, 3.6, 4, 9, .6); part(geo.box, lam(cv.n === 'Тапок' ? 0x2a50a0 : 0xc02020), 0, 34.5, 3.9, 1.4, 8, .6); }
      if (cv.trim) part(geo.box, lam(cv.trim), 0, 33, 3.6, 2, 15, .6);
      if (cv.back) part(geo.box, lam(cv.back), 0, 33, -5.6, 10, 12, 4);
    }
    const vest = new T.Group(); body.add(vest); vest.visible = false; // бронежилет (если подобрал броню)
    part(geo.box, lam(0x6b6248), 0, 33, 0, 14.4, 13, 9, vest); for (let i = -1; i <= 1; i++) part(geo.box, lam(0x585040), i * 4.2, 31, 4.9, 3.6, 5, 1.6, vest);
    if (!cv) part(geo.box, gear, 0, 30, -4.6, 8, 8, 2.4); // рюкзак-подсумок сзади
    part(geo.box, mats.skin, 0, 41.5, 0, 3.4, 2.4, 3.4); // шея
    const head = new T.Group(); head.position.set(0, 46.5, 0); body.add(head);
    part(geo.sph, mats.skin, 0, 0, .3, 4.1, 4.9, 4.5, head);
    part(geo.box, lam(0x1a1a1a), 0, .7, 4.1, 4.8, .9, .6, head); // брови/глаза — тёмная полоска
    if (STYLE !== 'real') head.scale.setScalar(1.25);
    if (!cv) head.add(hat(ch));
    else { const hm = (gg, c, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; head.add(o); };
      ({ scarf: () => { hm(geo.dome, 0xd8a23a, 0, .6, -.2, 4.8, 4.6, 5); hm(geo.box, 0xd8a23a, 0, -4.4, 2.6, 2.4, 2, 1.6); },
        capback: () => { hm(geo.dome, 0xd23a3a, 0, 1.6, 0, 4.9, 3.8, 4.9); hm(geo.box, 0xd23a3a, 0, 1.8, -5, 5, .6, 4); },
        foil: () => hm(geo.cone7, 0xdfe3e8, 0, 6, 0, 4.4, 9, 4.4),
        slick: () => hm(geo.dome, 0x1e1a16, 0, 1.4, -.4, 4.6, 3.2, 4.8),
        neat: () => hm(geo.dome, 0x6a4a2a, 0, 1.4, -.3, 4.6, 3.2, 4.7),
        hood: () => { hm(geo.dome, 0x1c1820, 0, .4, -.6, 5.4, 5.8, 5.6); hm(geo.box, 0x1c1820, 0, -2, -3.5, 9, 6, 4); },
        fedora: () => { hm(geo.cyl10, 0x3a3228, 0, 3, 0, 7, .6, 7); hm(geo.cyl10, 0x3a3228, 0, 5, 0, 4.4, 4, 4.4); hm(geo.box, 0x1a1a1a, 0, 3.6, 0, 9, 1, 9); },
        capyel: () => { hm(geo.dome, 0xffd43b, 0, 1.6, 0, 4.9, 3.8, 4.9); hm(geo.box, 0xffd43b, 0, 1.8, 5, 5, .6, 4); },
        flatcap: () => { hm(geo.dome, 0x5a5048, 0, 1.8, 0, 4.9, 3, 5.2); hm(geo.box, 0x5a5048, 0, 2.2, 4.4, 5.4, .6, 3); hm(geo.box, 0xd8d8d8, 0, -2.6, 3.8, 3, 1.6, 1); },
        longhair: () => { hm(geo.dome, 0x7a4a24, 0, 1.2, -.3, 4.7, 4, 4.9); hm(geo.box, 0x7a4a24, 0, -3.5, -2.8, 8, 8, 3); },
        hardhat: () => { hm(geo.dome, 0xffc61a, 0, 1.6, 0, 5.2, 4.4, 5.4); hm(geo.cyl10, 0xffc61a, 0, 1.4, .4, 6.4, .6, 6.6); },
        buzz: () => hm(geo.dome, 0x2a2018, 0, 1.6, -.2, 4.4, 2.4, 4.6) })[cv.hat](); }
    // руки: плечо + предплечье, держат оружие двумя руками
    const arm = s => { const sh = new T.Group(); sh.position.set(s * 8.2, 39, 0); body.add(sh); part(geo.box, mats.shirt, 0, -4.8, 0, 3.8, 9.6, 3.8, sh);
      const el = new T.Group(); el.position.y = -9.4; sh.add(el); part(geo.box, mats.shirt, 0, -4.2, 0, 3.4, 8.4, 3.4, el); part(geo.box, lam(0x2a2a24), 0, -9.2, 0, 3, 2.6, 3, el); return [sh, el]; };
    const [armL, elL] = arm(-1), [armR, elR] = arm(1);
    armR.rotation.set(-.35, 0, .12); elR.rotation.x = -1.25;
    armL.rotation.set(-1.0, 0, -.45); elL.rotation.set(-.5, 0, .35);
    const gunHold = new T.Group(); gunHold.position.set(2.6, 32.5, 8); body.add(gunHold);
    const itemG = new T.Group(); elR.add(itemG);
    if (cv) { // жители без оружия: руки вниз, в руке — своя вещь
      armL.rotation.set(0, 0, -.12); elL.rotation.set(-.25, 0, 0); armR.rotation.set(-.2, 0, .12); elR.rotation.x = -.5;
      const it = (gg, c, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; itemG.add(o); };
      const items = { bag: () => it(geo.box, 0x4a2e1e, 0, -12, 0, 3, 7, 7), case: () => it(geo.box, 0x2a1e14, 0, -13, 0, 2.6, 8, 10), leaflets: () => it(geo.box, 0xfafafa, 0, -10, 2.5, 5, 1.6, 6.5), candle: () => { it(geo.cyl6, 0xf2e6c0, 0, -8, 3, 1, 6, 1); it(geo.sph, 0xffb020, 0, -4.4, 3, 1, 1.6, 1); }, folder: () => it(geo.box, 0xc9a85a, 0, -10, 2.5, 1.4, 8, 6), roll: () => it(geo.cyl10, 0xf6f6f2, 0, -9, 3, 1.6, 14, 1.6, 1.4), cane: () => it(geo.cyl6, 0x4a3020, 0, -14, 1.5, .8, 22, .8), phone: () => it(geo.box, 0x1a1a1a, 0, -10, 2, 2.6, 1, 4.6), wrench: () => it(geo.box, 0x8a9096, 0, -12, 1, 1.4, 10, 1.6) };
      if (cv.item) items[cv.item](); }
    const shadow = new T.Mesh(new T.CircleGeometry(11, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .6; g.add(shadow);
    body.traverse(o => { if (o.isMesh) o.castShadow = true; }); if (STYLE === 'toon') { const ms = []; body.traverse(o => { if (o.isMesh) ms.push(o); }); ms.forEach(o => addOutline(o, OUT_C)); }
    g.userData = { body, legL, legR, kneeL, kneeR, armL, armR, elL, elR, itemG, civ: !!cv, sectLook: ch >= CH_SECT, head, torso, vest, gunHold, gunKey: '', mats, shadow };
    return g;
  }
  function setGun(c, wb) {
    const u = c.userData; if (u.gunKey === wb) return; u.gunKey = wb;
    u.gunHold.clear(); const w = wb & 15;
    if (u.civ) { // житель взял оружие — руки в стойку, вещь убираем
      if (w) { u.armR.rotation.set(-.35, 0, .12); u.elR.rotation.set(-1.25, 0, 0); u.armL.rotation.set(-1, 0, -.45); u.elL.rotation.set(-.5, 0, .35); } else { u.armL.rotation.set(0, 0, -.12); u.elL.rotation.set(-.25, 0, 0); u.armR.rotation.set(-.2, 0, .12); u.elR.rotation.set(-.5, 0, 0); }
      u.itemG.visible = !w; }
    if (w) { const gm = gunMesh(w, wb >> 4); gm.traverse(o => { if (o.isMesh) o.castShadow = true; }); u.gunHold.add(gm); }
  }
  function sectAcc(c, s) {
    const u = c.userData; if (u.accS === s) return; u.accS = s;
    for (const g of u.acc || []) g.parent && g.parent.remove(g); u.acc = [];
    const add_ = (par, gg, col, x, y, z, sx, sy, sz, rx = 0) => { const o = new T.Mesh(gg, lam(col)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; par.add(o); u.acc.push(o); if (STYLE === 'toon') addOutline(o, OUT_C); return o; };
    if (s === 0) { add_(u.elL, geo.box, 0x24346e, 0, -9.5, 2.4, 1.6, 6.4, 5); add_(u.elL, geo.box, 0xf4f0e0, .2, -9.5, 2.4, 1.2, 6, 4.6); for (const k of [u.kneeL, u.kneeR]) add_(k, geo.box, 0xf08ab0, 0, -11.6, 1.6, 5.6, 2.8, 8.8); } // книжка и розовые тапки
    else if (s === 1) { add_(u.head, geo.dome, 0x4a2478, 0, .2, -.6, 5.7, 6.2, 5.9); add_(u.body, geo.box, 0x3a1c60, 0, 28, -4.4, 13.4, 24, 2); add_(u.body, geo.box, 0x7a1a2a, 0, 40, 0, 14.4, 1.6, 8.2); } // капюшон и плащ
    else if (s === 2) add_(u.head, geo.cone7, 0xdfe3e8, 0, 6.4, 0, 4.4, 9, 4.4); // шапочка из фольги
    else if (s === 3) { add_(u.body, geo.box, 0x2f6ad8, 0, 32, 4.6, 13, 15, 1); add_(u.body, geo.box, 0xfafaf4, 0, 32, 5.2, 11, 13, .6); add_(u.body, geo.box, 0x2f6ad8, 0, 32, -4.6, 13, 15, 1); add_(u.body, geo.box, 0xd23a3a, 0, 33, 5.6, 7, 2, .4); } // плакат-бутерброд
  }
  function poseChar(c, p, aim, walk, opt = {}) {
    c.position.set(p[0], opt.alt || 0, p[1]); c.rotation.set(0, Math.atan2(aim[0], aim[1]), 0);
    const u = c.userData, s = Math.sin(walk), moving = opt.moving;
    u.legL.rotation.x = moving ? s * .6 : 0; u.legR.rotation.x = moving ? -s * .6 : 0;
    u.kneeL.rotation.x = moving ? Math.max(0, -s) * .9 : 0; u.kneeR.rotation.x = moving ? Math.max(0, s) * .9 : 0;
    u.body.position.y = moving ? Math.abs(Math.cos(walk)) * 1.2 : 0;
    u.vest.visible = !!opt.armor;
    const hit = opt.hit ? 1 : 0; u.mats.shirt.emissive.setScalar(hit * .6); u.mats.skin.emissive.setScalar(hit * .6);
    u.body.rotation.x = opt.dead ? 0 : -hit * .3; // попадание — откидывает назад
    u.gunHold.position.z = opt.fire ? 5 : 8; // отдача
    u.shadow.visible = !opt.alt;
    if (u.civ && !u.sectLook) sectAcc(c, opt.sect ?? -1);
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
  function syncLoot(loot, now) {
    for (const [id, g] of lootG) if (!loot.has(id)) { scene.remove(g); lootG.delete(id); }
    for (const it of loot.values()) { let g = lootG.get(it.id); if (!g) { g = lootMesh(it); lootG.set(it.id, g); scene.add(g); } const i = g.userData.item; if (g.userData.bird) { const ph = (now / 1000 + it.id * .37) % 2.4; i.rotation.x = ph < .3 ? Math.sin(ph / .3 * Math.PI) * .7 : 0; i.position.y = 0; continue; } i.rotation.y = now / 700 + it.id; i.position.y = 9 + Math.sin(now / 300 + it.id) * 2; }
  }
  // ===== трассеры, огонь =====
  const tracerPool = []; for (let i = 0; i < 40; i++) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(2 * 3), 3)); const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffe066, transparent: true, blending: T.AdditiveBlending })); l.visible = false; l.frustumCulled = false; scene.add(l); tracerPool.push(l); }
  function cvTex(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return new T.CanvasTexture(c); }
  const flameTex = cvTex(64, 96, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * .7, 2, w / 2, h * .6, w * .55); gr.addColorStop(0, '#fff3bf'); gr.addColorStop(.35, '#ffd43b'); gr.addColorStop(.7, '#ff6b1a'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, 4); g.quadraticCurveTo(w, h * .6, w / 2, h - 2); g.quadraticCurveTo(0, h * .6, w / 2, 4); g.fill(); });
  const glowTex = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,220,120,.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const smokeTex = cvTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(70,65,65,.55)'); gr.addColorStop(1, 'rgba(70,65,65,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const flames = []; for (let i = 0; i < 90; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: flameTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); s.center.set(.5, .05); s.visible = false; scene.add(s); flames.push(s); }
  const smokes = []; for (let i = 0; i < 40; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true })); s.visible = false; s.userData = { t: 9 }; scene.add(s); smokes.push(s); }
  const flashes = []; for (let i = 0; i < 20; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; s.userData = { t: 9 }; scene.add(s); flashes.push(s); }
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
  const shells = []; const shellGeo = new T.BoxGeometry(1.2, 1.2, 2.6); for (let i = 0; i < 40; i++) { const m = new T.Mesh(shellGeo, lam(0xd4a020)); m.visible = false; m.userData = { t: 9, v: new T.Vector3() }; scene.add(m); shells.push(m); }
  let shellI = 0; function shellAt(v, right) { const m = shells[shellI++ % shells.length]; m.position.copy(v); m.userData.v.set(right.x * 60 + (Math.random() - .5) * 20, 50 + Math.random() * 30, right.z * 60 + (Math.random() - .5) * 20); m.userData.t = 0; m.visible = true; }
  let zoomCur = 1;
  const transport = plane(); transport.scale.setScalar(1.3); transport.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(transport);
  // ===== превью персонажа на старте =====
  let pvR = null, pvScene = null, pvCam = null, pvChar = null, pvCh = -1;
  function preview(canvas, ch) {
    if (!pvR) { pvR = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); pvR.setPixelRatio(2); pvR.setSize(90, 90, false); pvScene = new T.Scene(); pvScene.add(new T.AmbientLight(0xffffff, .65)); const d = new T.DirectionalLight(0xffffff, .7); d.position.set(30, 60, 50); pvScene.add(d); pvCam = new T.PerspectiveCamera(35, 1, 1, 500); pvCam.position.set(0, 45, 120); pvCam.lookAt(0, 26, 0); }
    if (pvCh !== ch) { if (pvChar) pvScene.remove(pvChar); pvChar = makeChar(ch); setGun(pvChar, 2 | (2 << 4)); pvScene.add(pvChar); pvCh = ch; }
    pvChar.rotation.y = performance.now() / 1200; pvR.render(pvScene, pvCam);
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
      if (e.fire && !c.userData.fired) { const tip = c.userData.gunHold.localToWorld(new T.Vector3(0, 0, 18)); flashAt(tip, 34); const rt = new T.Vector3(1, 0, 0).applyQuaternion(c.quaternion); shellAt(c.userData.gunHold.localToWorld(new T.Vector3(0, 2, 2)), rt); } c.userData.fired = e.fire;
      if (e.dead) { c.userData.body.rotation.z = Math.min(1.57, e.deadT * 5) * (e.id % 2 ? 1 : -1); c.userData.body.position.y = 0; }
      else c.userData.body.rotation.z = 0;
      // парашют
      if (e.alt) { if (!c.userData.chute) { const ch = new T.Group(); for (let i = 0; i < 6; i++) { const seg = new T.Mesh(new T.SphereGeometry(24, 6, 4, i * Math.PI / 3, Math.PI / 3, 0, Math.PI / 2), lam(i % 2 ? 0xd8d4c8 : CAMO[e.ch % 10][0])); ch.add(seg); } ch.position.y = 64; c.add(ch); c.userData.chute = ch; } c.userData.chute.visible = true; }
      else if (c.userData.chute) c.userData.chute.visible = false;
    }
    for (const id in chars) if (!seen.has(+id)) chars[id].visible = false;
    syncLoot(loot, now);
    // трассеры
    let ti = 0;
    for (const t of tracers) {
      if (ti >= tracerPool.length) break; const l = tracerPool[ti++]; const a = l.geometry.attributes.position;
      a.setXYZ(0, t.from[0], 24, t.from[1]); a.setXYZ(1, t.end[0], 24, t.end[1]);
      a.needsUpdate = true; l.material.opacity = Math.max(0, 1 - t.t / .12); l.material.color.set((t.wb & 15) === 4 ? 0xffffff : 0xffe066); l.visible = true;
      if (t.t < dt * 1.5) { if (t.wb & 128) bloodAt(t.end); else { flashAt(at(t.end, 24), 10); puffAt(at(t.end, 22)); } }
    }
    for (; ti < tracerPool.length; ti++) tracerPool[ti].visible = false;
    for (const s of sprays) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > .5 || s.position.y < 1) { s.visible = false; continue; } u.v.y -= 260 * dt; s.position.addScaledVector(u.v, dt); }
    for (const m of pools) { if (!m.visible) continue; m.userData.t += dt; if (m.userData.t > 25) m.material.opacity = Math.max(0, .85 - (m.userData.t - 25) / 5); if (m.userData.t > 30) m.visible = false; }
    for (const m of shells) { if (!m.visible) continue; const u = m.userData; u.t += dt; if (u.t > 3) { m.visible = false; continue; } if (m.position.y > 1) { u.v.y -= 300 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += dt * 15; m.rotation.y += dt * 9; } else { m.position.y = 1; u.v.set(0, 0, 0); } }
    for (const s of puffs) { if (!s.visible) continue; s.userData.t += dt; const k = s.userData.t / .45; if (k >= 1) { s.visible = false; continue; } s.scale.setScalar(6 + k * 18); s.material.opacity = .8 * (1 - k); s.position.y += dt * 12; }
    for (const s of flashes) { if (!s.visible) continue; s.userData.t += dt; const k = 1 - s.userData.t / .09; if (k <= 0) s.visible = false; else s.scale.setScalar(s.userData.size * (.6 + .4 * k)); }
    // языки пламени вдоль фронта — только рядом с камерой
    let fi = 0;
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
    renderer.render(scene, camera);
  }
  return { frame, resize, project, screenToGround, killObj, preview, renderer, CAM_F, CAM_R, bloodAt };
})();
