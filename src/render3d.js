// ===== LAST EXIT — 3D-мир (Three.js, low-poly), изометрическая камера над плоской картой =====
const G3 = (() => {
  const T = THREE;
  const glc = document.getElementById('g');
  const lowEnd = Math.min(screen.width, screen.height) < 500;
  const renderer = new T.WebGLRenderer({ canvas: glc, antialias: !lowEnd, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1.25 : 1.75));
  const scene = new T.Scene(); scene.background = new T.Color(0x1b5d86);
  // ортогональная камера под постоянным углом (изометрия): карта не вращается, «вверх» на экране — всегда одно направление
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, -3000, 8000);
  const CAM_OFF = new T.Vector3(1, 1.25, 1).normalize().multiplyScalar(2500);
  const at = (p, h = 0) => new T.Vector3(p[0], h, p[1]);
  scene.add(new T.AmbientLight(0xffffff, .58));
  const sun = new T.DirectionalLight(0xfff4e0, .8); sun.position.set(-.45, 1, .3); scene.add(sun);
  // общие параметры огня — их используют земля и все объекты (обугливание)
  const U = { zc: { value: new T.Vector2(0, 0) }, zrho: { value: 1e5 }, nc: { value: new T.Vector2(0, 0) }, nrho: { value: -1 }, t: { value: 0 } };
  function charrable(mat) { // объекты темнеют в огне
    mat.onBeforeCompile = sh => {
      sh.uniforms.zc = U.zc; sh.uniforms.zrho = U.zrho;
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvWP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;\n#else\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;\n#endif');
      sh.fragmentShader = 'varying vec3 vWP;uniform vec2 zc;uniform float zrho;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif(length(vWP.xz-zc)>zrho)gl_FragColor.rgb=gl_FragColor.rgb*.16+vec3(.05,.02,.01);');
    };
    return mat;
  }
  const matCache = {};
  const lam = (col, opt = {}) => { const k = col + JSON.stringify(opt); return matCache[k] || (matCache[k] = charrable(new T.MeshLambertMaterial(Object.assign({ color: col }, opt)))); };

  // ===== земля =====
  const loader = new T.TextureLoader();
  const grassTex = typeof ART === 'object' && ART.grass ? loader.load(ART.grass) : null;
  if (grassTex) { grassTex.wrapS = grassTex.wrapT = T.MirroredRepeatWrapping; }
  const crateTex = typeof ART === 'object' && ART.crate ? loader.load(ART.crate) : null;
  const gsize = HALF * 2 + 4000, gg = new T.PlaneGeometry(gsize, gsize, 1, 1); gg.rotateX(-Math.PI / 2);
  const ground = new T.Mesh(gg, new T.ShaderMaterial({
    uniforms: Object.assign({ grass: { value: grassTex }, hasGrass: { value: grassTex ? 1 : 0 }, bc: { value: BIOMES.map(b => new T.Vector2(b.c[0], b.c[1])) }, bcol: { value: BIOMES.map(b => new T.Color(b.col)) }, brad: { value: BIOMES.map(b => b.r) } }, U),
    vertexShader: 'varying vec2 vP;void main(){vec4 w=modelMatrix*vec4(position,1.);vP=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `
uniform vec2 zc;uniform float zrho;uniform vec2 nc;uniform float nrho;uniform float t;
uniform vec2 bc[6];uniform vec3 bcol[6];uniform float brad[6];uniform sampler2D grass;uniform float hasGrass;
varying vec2 vP;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float noise(vec2 x){vec2 i=floor(x);vec2 f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec3 col=hasGrass>.5?texture2D(grass,vP/170.).rgb:vec3(.42,.74,.29);
 col*=.88+.24*noise(vP*.012);
 float nb=noise(vP*.04);
 for(int i=0;i<6;i++){float e=smoothstep(brad[i]+12.,brad[i]-12.,length(vP-bc[i])+(nb-.5)*30.);col=mix(col,bcol[i]*(.9+.18*nb),e);}
 // берег и вода по краю карты
 float e=max(abs(vP.x),abs(vP.y))-${HALF.toFixed(1)}+(noise(vP*.02)-.5)*40.;
 col=mix(col,vec3(.93,.84,.62)*(.92+.12*nb),smoothstep(-55.,-45.,e));
 vec3 water=vec3(.13,.45,.66)+.05*sin(t*1.5+vP.x*.03+vP.y*.02)+.06*smoothstep(10.,0.,e);
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
 gl_FragColor=vec4(col*1.05,1.);
}`
  }));
  scene.add(ground);

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
  const VAR = { house: [0xf1e7d0, 0xf8d7a8, 0xd3f9d8, 0xe7f5ff], roof: [0xd9534f, 0x3d7ec7, 0x8f5a3c, 0x2f9e44], car: [0x3d8bd9, 0xe03131, 0xf59f00, 0xf1f3f5, 0x37b24d], house2: [0xf2d7a0, 0xffe3e3, 0xd0ebff] };
  // части каждого типа: [геометрия, цвет (или ключ VAR), матрица в единицах w/h объекта]
  const PARTS = {
    tree: (w) => { const k = w / 44; return [[geo.cyl6, 0x8b5a2b, M(0, 12 * k, 0, 4.5 * k, 24 * k, 4.5 * k)], [geo.ico1, 0x3fae49, M(0, 46 * k, 0, 27 * k, 25 * k, 27 * k)], [geo.ico1, 0x5ccf5e, M(7 * k, 60 * k, -5 * k, 17 * k, 16 * k, 17 * k)]]; },
    pine: (w) => { const k = w / 40; return [[geo.cyl6, 0x6b4423, M(0, 7 * k, 0, 3 * k, 14 * k, 3 * k)], [geo.cone7, 0x2b8a3e, M(0, 30 * k, 0, 22 * k, 36 * k, 22 * k)], [geo.cone7, 0x37b24d, M(0, 50 * k, 0, 15 * k, 28 * k, 15 * k)], [geo.cone7, 0xf1f3f5, M(0, 66 * k, 0, 8 * k, 14 * k, 8 * k)]]; },
    rock: (w) => { const k = w / 36; return [[geo.dod, 0x8d8f96, M(0, 6 * k, 0, 19 * k, 13 * k, 17 * k, w)]]; },
    hay: (w) => { const k = w / 30; return [[geo.lay, 0xe7c14a, M(0, 15 * k, 0, 22 * k, 15 * k, 15 * k)]]; },
    cactus: (w) => { const k = w / 26; return [[geo.cyl6, 0x5c940d, M(0, 20 * k, 0, 7 * k, 40 * k, 7 * k)], [geo.cyl6, 0x4f8a0b, M(10 * k, 27 * k, 0, 4 * k, 16 * k, 4 * k)], [geo.cyl6, 0x4f8a0b, M(-9 * k, 21 * k, 0, 4 * k, 12 * k, 4 * k)], [geo.sph, 0xf783ac, M(0, 41 * k, 0, 3 * k, 3 * k, 3 * k)]]; },
    snowman: (w) => { const k = w / 24; return [[geo.sph, 0xffffff, M(0, 12 * k, 0, 13 * k, 12 * k, 13 * k)], [geo.sph, 0xffffff, M(0, 31 * k, 0, 9 * k, 9 * k, 9 * k)], [geo.cone7, 0xfd7e14, M(0, 31 * k, 9 * k, 2 * k, 8 * k, 2 * k)], [geo.cyl10, 0x222222, M(0, 42 * k, 0, 7 * k, 6 * k, 7 * k)]]; },
    igloo: (w) => [[geo.dome, 0xe7f5ff, M(0, 0, 0, w / 2, w * .42, w / 2)], [geo.box, 0xa5d8ff, M(w * .45, 8, 0, 14, 16, 16)]],
    house: (w, h) => [[geo.box, 'house', M(0, 20, 0, w * .75, 40, h * .75)], [geo.roof, 'roof', M(0, 40, 0, w * .84, 28, h * .86)], [geo.box, 0x7a4a2a, M(0, 12, h * .375 + .6, 13, 24, 1.5)], [geo.box, 0x74c0fc, M(w * .22, 24, h * .375 + .6, 12, 10, 1.5)], [geo.box, 0x74c0fc, M(-w * .22, 24, h * .375 + .6, 12, 10, 1.5)], [geo.box, 0x868e96, M(w * .2, 60, -h * .15, 8, 18, 8)]],
    house2: (w, h) => [[geo.box, 'house2', M(0, 23, 0, w, 46, h)], [geo.box, 0x3d7ec7, M(0, 47.5, 0, w * 1.04, 4, h * 1.04)], [geo.box, 0xadb5bd, M(-w * .2, 53, 0, 14, 8, 10)], [geo.box, 0x74c0fc, M(0, 26, h / 2 + .6, w * .6, 12, 1.5)]],
    bunker: (w, h) => [[geo.box, 0x6b7048, M(0, 13, 0, w, 26, h)], [geo.box, 0x4e5334, M(0, 29, 0, w * .82, 6, h * .82)], [geo.box, 0x111111, M(0, 17, h / 2 + .6, w * .5, 4, 1)], [geo.box, 0xc9b77c, M(0, 4, h / 2 + 4, w * 1.05, 8, 7)]],
    barn: (w, h) => [[geo.box, 0xb5442e, M(0, 23, 0, w, 46, h)], [geo.roof, 0x7a2b1c, M(0, 46, 0, w * 1.04, 30, h * 1.08)], [geo.box, 0xf8f9fa, M(0, 16, h / 2 + .6, 30, 32, 1.5)]],
    market: (w, h) => [[geo.box, 0xe9ecef, M(0, 26, 0, w, 52, h)], [geo.box, 0xe94e77, M(0, 47, 0, w * 1.02, 10, h * 1.02)], [geo.box, 0xadb5bd, M(0, 53, 0, w * .96, 3, h * .96)], [geo.box, 0x74c0fc, M(0, 20, h / 2 + .6, w * .7, 18, 1.5)]],
    car: (w, h) => [[geo.box, 'car', M(0, 9, 0, w, 12, h)], [geo.box, 0xa5d8ff, M(-w * .05, 19, 0, w * .55, 9, h * .86)], [geo.box, 0x222222, M(w * .3, 4, 0, 8, 8, h * 1.05)], [geo.box, 0x222222, M(-w * .3, 4, 0, 8, 8, h * 1.05)]],
    crate: (w) => [[geo.box, 'crate', M(0, 13, 0, 26, 26, 26)]],
    wall: (w, h) => [[geo.box, 0x868e96, M(0, 11, 0, w, 22, h)]],
    tent: (w, h) => [[geo.roof, 0x8f7a4a, M(0, 0, 0, w, 32, h)]],
  };
  const inst = {}; // key -> {mesh}
  const objIdx = []; // id -> [[mesh, index]]
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  const basisAt = o => new T.Matrix4().compose(new T.Vector3(o.p[0], 0, o.p[1]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -o.a), new T.Vector3(1, 1, 1));
  function buildWorld(objs) {
    for (const k in inst) { scene.remove(inst[k].mesh); delete inst[k]; }
    objIdx.length = 0;
    const plan = {};
    for (const o of objs) {
      const f = PARTS[o.type]; if (!f) continue; const parts = f(o.w, o.h);
      parts.forEach(([g, col, lm], pi) => {
        const key = o.type + '|' + pi + '|' + g.uuid + '|' + col;
        (plan[key] = plan[key] || { g, col, items: [] }).items.push([o, lm]);
      });
    }
    for (const key in plan) {
      const { g, col, items } = plan[key];
      const mat = col === 'crate' ? lam(0xfffffe, crateTex ? { map: crateTex } : {}) : lam(0xffffff); // цвет — у каждого экземпляра
      const mesh = new T.InstancedMesh(g, mat, items.length); mesh.frustumCulled = false;
      items.forEach(([o, lm], i) => {
        const m = basisAt(o).multiply(lm); mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new T.Color(typeof col === 'string' ? (VAR[col] ? VAR[col][o.id % VAR[col].length] : 0xffffff) : col));
        (objIdx[o.id] = objIdx[o.id] || []).push([mesh, i]);
        if (o.dead) mesh.setMatrixAt(i, zero);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); inst[key] = { mesh };
    }
    // тени-пятна (солнце слева-сзади → тень вправо-вперёд)
    const sh = objs.filter(o => PARTS[o.type] && o.type !== 'tent');
    const shm = new T.InstancedMesh(new T.CircleGeometry(1, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false }), sh.length); shm.frustumCulled = false;
    sh.forEach((o, i) => { const m = new T.Matrix4().compose(new T.Vector3(o.p[0] + 6, .8, o.p[1] - 4), new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, o.sh ? o.a : 0)), new T.Vector3(o.w * .58, (o.sh ? o.h : o.w) * .58, 1)); shm.setMatrixAt(i, m); (objIdx[o.id] = objIdx[o.id] || []).push([shm, i]); if (o.dead) shm.setMatrixAt(i, zero); });
    scene.add(shm); inst.shadow = { mesh: shm };
  }
  function killObj(id) { for (const [mesh, i] of objIdx[id] || []) { mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; } }

  // ===== персонажи =====
  const SKIN = [0xffd8b0, 0xf1c27d, 0xe0ac69, 0xffdbac, 0xc68642, 0xffe0bd, 0xf1c27d, 0xd8a06a, 0xffd8b0, 0xffe0bd];
  const PANTS = [0x364fc7, 0x5c3d2e, 0x4e5334, 0x862e9c, 0x343a40, 0x495057, 0x212529, 0x5f3dc4, 0x6b4423, 0xf8f9fa];
  const SHIRT = [0xe03131, 0x8d6e63, 0x5c6b3c, 0xc92a2a, 0x1c7ed6, 0xf08c00, 0x343a40, 0x2f9e44, 0x868e96, 0xffffff];
  function gunMesh(w, rar) {
    const g = new T.Group(); const L = [0, 9, 17, 16, 23, 12][w] || 9, th = w === 3 ? 4.2 : 3.2;
    const body = new T.Mesh(geo.box, lam(0x2b2b2b)); body.scale.set(th, th, L); body.position.z = L / 2; g.add(body);
    const st = new T.Mesh(geo.box, lam(new T.Color(RARITY[rar] || '#b8bcc4').getHex())); st.scale.set(th + .4, th + .4, L * .35); st.position.z = L * .3; g.add(st);
    if (w === 4) { const sc = new T.Mesh(geo.cyl6, lam(0x111111)); sc.scale.set(1.6, 7, 1.6); sc.rotation.x = Math.PI / 2; sc.position.set(0, 3, L * .45); g.add(sc); }
    if (w === 2 || w === 5) { const mg = new T.Mesh(geo.box, lam(0x2b2b2b)); mg.scale.set(2.4, 6, 3); mg.position.set(0, -4, L * .5); g.add(mg); }
    return g;
  }
  function hat(ch, col) {
    const g = new T.Group(); const m = (gg, c, x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const o = new T.Mesh(gg, lam(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); g.add(o); return o; };
    switch (ch % 10) {
      case 0: m(geo.dome, 0xe03131, 0, 6, 0, 10.5, 7, 10.5); m(geo.box, 0xe03131, 0, 6.5, 9, 14, 1.2, 9); break; // кепка
      case 1: m(geo.cyl10, 0x8b5a2b, 0, 8, 0, 17, 1.4, 17); m(geo.cyl10, 0x8b5a2b, 0, 12, 0, 8.5, 8, 8.5); m(geo.box, 0x3b2a1a, 0, -3, 10.5, 9, 2, 2); break; // ковбой + усы
      case 2: m(geo.dome, 0x5c6b3c, 0, 4, 0, 12, 10, 12); break; // каска
      case 3: for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; m(geo.cone7, 0xffd43b, Math.cos(a) * 7, 13, Math.sin(a) * 7, 2.5, 7, 2.5); } m(geo.cyl10, 0xffd43b, 0, 9, 0, 8, 4, 8); break; // корона
      case 4: m(geo.cyl10, 0xe03131, 0, 5, 0, 10.6, 3, 10.6); m(geo.box, 0xe03131, 0, 4, -11, 3, 2, 8, .5); break; // бандана
      case 5: m(geo.cone7, col, 6, 11, 0, 3.5, 8, 3.5, 0, -.3); m(geo.cone7, col, -6, 11, 0, 3.5, 8, 3.5, 0, .3); break; // ушки
      case 6: for (let i = -2; i <= 2; i++) m(geo.cone7, 0x7048e8, 0, 10, i * 3.5, 2, 9, 2); break; // ирокез
      case 7: m(geo.cyl10, 0xf59f00, 0, 8, 0, 22, 1.5, 22); m(geo.cone7, 0xe8590c, 0, 15, 0, 8, 14, 8); break; // сомбреро
      case 8: m(geo.dome, 0x868e96, 0, 5, 0, 10.8, 8, 10.8); m(geo.cone7, 0xf8f9fa, 10, 10, 0, 2.2, 9, 2.2, 0, -.9); m(geo.cone7, 0xf8f9fa, -10, 10, 0, 2.2, 9, 2.2, 0, .9); m(geo.dome, 0xd9480f, 0, -5, 7, 6, 9, 4, Math.PI); break; // викинг
      case 9: m(geo.cyl10, 0xffffff, 0, 10, 0, 8, 12, 8); m(geo.sph, 0xffffff, 0, 17, 0, 10, 6, 10); break; // повар
    }
    return g;
  }
  function makeChar(ch) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const mats = { shirt: new T.MeshLambertMaterial({ color: SHIRT[ch % 10] }), skin: new T.MeshLambertMaterial({ color: SKIN[ch % 10] }), pants: new T.MeshLambertMaterial({ color: PANTS[ch % 10] }) };
    const part = (gg, mat, x, y, z, sx, sy, sz, par = body) => { const o = new T.Mesh(gg, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); par.add(o); return o; };
    const legL = new T.Group(), legR = new T.Group(); legL.position.set(-5, 15, 0); legR.position.set(5, 15, 0); body.add(legL, legR);
    part(geo.box, mats.pants, 0, -7, 0, 6.5, 14, 7, legL); part(geo.box, mats.pants, 0, -7, 0, 6.5, 14, 7, legR);
    part(geo.box, lam(0x343a40), 0, -14, 1.5, 7, 3, 10, legL); part(geo.box, lam(0x343a40), 0, -14, 1.5, 7, 3, 10, legR);
    const torso = part(geo.box, mats.shirt, 0, 24, 0, 20, 19, 13);
    const vest = part(geo.box, lam(0x1c7ed6), 0, 25, 0, 21.5, 15, 14.5); vest.visible = false;
    const head = new T.Group(); head.position.set(0, 42, 0); body.add(head);
    part(geo.sph, mats.skin, 0, 0, 0, 10.5, 10, 10, head);
    for (const s of [-1, 1]) { part(geo.sph, lam(0xffffff), s * 3.8, 1.5, 8.4, 3, 3.3, 2, head); part(geo.sph, lam(0x111111), s * 3.8, 1.5, 10.1, 1.5, 1.7, 1, head); }
    part(geo.sph, lam(0xff8787), 0, -2, 10, 1.8, 1.5, 1.5, head);
    const hg = hat(ch, SHIRT[ch % 10]); hg.position.y = 3; head.add(hg);
    const armL = new T.Group(), armR = new T.Group(); armL.position.set(-12.5, 31, 0); armR.position.set(12.5, 31, 0); body.add(armL, armR);
    part(geo.box, mats.shirt, 0, -6, 0, 5.5, 13, 5.5, armL); part(geo.box, mats.shirt, 0, -6, 0, 5.5, 13, 5.5, armR);
    part(geo.sph, mats.skin, 0, -13, 0, 3.3, 3.3, 3.3, armL); part(geo.sph, mats.skin, 0, -13, 0, 3.3, 3.3, 3.3, armR);
    armL.rotation.x = -1.25; armR.rotation.x = -1.35; armL.rotation.z = -.35;
    const gunHold = new T.Group(); gunHold.position.set(4, 27, 13); body.add(gunHold);
    const shadow = new T.Mesh(new T.CircleGeometry(15, 16), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .6; g.add(shadow);
    g.userData = { body, legL, legR, armL, armR, head, torso, vest, gunHold, gunKey: '', mats, shadow };
    return g;
  }
  function setGun(c, wb) {
    const u = c.userData; if (u.gunKey === wb) return; u.gunKey = wb;
    u.gunHold.clear(); const w = wb & 15; if (w) u.gunHold.add(gunMesh(w, wb >> 4));
  }
  function poseChar(c, p, aim, walk, opt = {}) {
    c.position.set(p[0], opt.alt || 0, p[1]); c.rotation.set(0, Math.atan2(aim[0], aim[1]), 0);
    const u = c.userData, s = Math.sin(walk), moving = opt.moving;
    u.legL.rotation.x = moving ? s * .7 : 0; u.legR.rotation.x = moving ? -s * .7 : 0;
    u.body.position.y = moving ? Math.abs(Math.cos(walk)) * 2 : 0;
    u.armL.rotation.x = -1.25 + (moving ? s * .08 : 0);
    u.vest.visible = !!opt.armor;
    const hit = opt.hit ? 1 : 0; u.mats.shirt.emissive.setScalar(hit * .8); u.mats.skin.emissive.setScalar(hit * .8);
    u.shadow.visible = !opt.alt;
  }
  // ===== лут =====
  const lootG = new Map();
  const ringGeo = new T.RingGeometry(9, 13, 20);
  function lootMesh(it) {
    const g = new T.Group(), col = it.k === 0 ? RARITY[it.r] : it.k === 1 ? AMMO_COL[it.x] : it.k === 2 ? '#ff6b6b' : '#4dabf7';
    const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: new T.Color(col), transparent: true, opacity: .7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; g.add(ring);
    const item = new T.Group(); item.position.y = 9; g.add(item);
    if (it.k === 0) { const gm = gunMesh(it.x, it.r); gm.position.z = -8; item.add(gm); }
    else if (it.k === 1) { const b = new T.Mesh(geo.box, lam(0x495057)); b.scale.set(11, 7, 8); item.add(b); for (let i = -1; i <= 1; i++) { const c = new T.Mesh(geo.cyl6, lam(new T.Color(col).getHex())); c.scale.set(1.4, 5, 1.4); c.position.set(i * 3.3, 5, 0); item.add(c); } }
    else if (it.k === 2) { const b = new T.Mesh(geo.box, lam(0xffffff)); b.scale.set(13, 9, 10); item.add(b); const c1 = new T.Mesh(geo.box, lam(0xe03131)); c1.scale.set(3, 9.4, 7); item.add(c1); const c2 = new T.Mesh(geo.box, lam(0xe03131)); c2.scale.set(9, 9.4, 3); item.add(c2); }
    else { const b = new T.Mesh(geo.box, lam(0x1c7ed6)); b.scale.set(13, 15, 5); item.add(b); }
    g.userData.item = item; g.position.set(it.p[0], 0, it.p[1]);
    return g;
  }
  function syncLoot(loot, now) {
    for (const [id, g] of lootG) if (!loot.has(id)) { scene.remove(g); lootG.delete(id); }
    for (const it of loot.values()) { let g = lootG.get(it.id); if (!g) { g = lootMesh(it); lootG.set(it.id, g); scene.add(g); } const i = g.userData.item; i.rotation.y = now / 700 + it.id; i.position.y = 9 + Math.sin(now / 300 + it.id) * 2; }
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
  const transport = plane(); transport.scale.setScalar(1.3); scene.add(transport);
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
    W3 = w; H3 = h; renderer.setSize(w, h, false);
    const asp = w / h; let hh, hw; if (asp >= 1) { hh = VIEW / 2; hw = hh * asp; } else { hw = VIEW / 2; hh = hw / asp; }
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
  }
  function setCam(p) { camera.position.set(p[0] + CAM_OFF.x, CAM_OFF.y, p[1] + CAM_OFF.z); camera.lookAt(p[0], 0, p[1]); camera.updateMatrixWorld(); }
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
    const { now, dt, objs, zone, plan, matchT, phase, loot, list, tracers, shipS, shipD, camP } = st;
    if (worldBuilt !== objs) { buildWorld(objs); worldBuilt = objs; }
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
      if (e.fire) { const tip = c.userData.gunHold.localToWorld(new T.Vector3(0, 0, 18)); flashAt(tip, 22); }
      if (e.dead) { c.userData.body.rotation.z = Math.min(1.57, e.deadT * 5) * (e.id % 2 ? 1 : -1); c.userData.body.position.y = 0; }
      else c.userData.body.rotation.z = 0;
      // парашют
      if (e.alt) { if (!c.userData.chute) { const ch = new T.Group(); for (let i = 0; i < 6; i++) { const seg = new T.Mesh(new T.SphereGeometry(24, 6, 4, i * Math.PI / 3, Math.PI / 3, 0, Math.PI / 2), lam(i % 2 ? 0xffffff : SHIRT[e.ch % 10])); ch.add(seg); } ch.position.y = 64; c.add(ch); c.userData.chute = ch; } c.userData.chute.visible = true; }
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
      if (t.t < dt * 1.5) flashAt(at(t.end, 24), 14);
    }
    for (; ti < tracerPool.length; ti++) tracerPool[ti].visible = false;
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
  return { frame, resize, project, screenToGround, killObj, preview, renderer, CAM_F, CAM_R };
})();
