// ===== LAST EXIT — зомби и кровь (дополнение к render3d) =====
// Зомби — 8 инстансных частей на всех (сотни без тормозов). Кровь «запекается» в текстуру земли и остаётся навсегда.
const ZFX = (() => {
  const T = THREE, scene = G3.scene, renderer = G3.renderer, MAT = c => G3.MAT({ color: c });
  const cvTex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return new T.CanvasTexture(c); };
  // ===== кровь в текстуре земли (вся карта) =====
  const BS = HALF * 2 + 200, RT = new T.WebGLRenderTarget(2048, 2048, { depthBuffer: false });
  const bloodMat = new T.MeshBasicMaterial({ map: RT.texture, transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const bloodPlane = new T.Mesh(new T.PlaneGeometry(BS, BS), bloodMat); bloodPlane.rotation.x = -Math.PI / 2; bloodPlane.position.y = 1.9; bloodPlane.renderOrder = 1; scene.add(bloodPlane);
  const dScene = new T.Scene(), dCam = new T.OrthographicCamera(-BS / 2, BS / 2, BS / 2, -BS / 2, .1, 100); dCam.position.set(0, 50, 0); dCam.up.set(0, 0, -1); dCam.lookAt(0, 0, 0);
  const blob = k => cvTex(128, 128, x => { x.translate(64, 64); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 26 + k * 5, 0, 7); x.fill(); const n = 7 + k * 3;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 24 + Math.random() * 36, s = 2 + Math.random() * 8; x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, 7); x.fill(); }
    for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, r0 = 20 + k * 4; x.beginPath(); x.ellipse(Math.cos(a) * (r0 + 6), Math.sin(a) * (r0 + 6), 10 + Math.random() * 8, 5 + Math.random() * 4, a, 0, 7); x.fill(); } });
  const TEX = { b0: blob(0), b1: blob(1), b2: blob(2),
    drop: cvTex(32, 32, x => { const g = x.createRadialGradient(16, 16, 2, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(.7, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }),
    foot: cvTex(32, 64, x => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(16, 22, 9, 15, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(16, 49, 7, 9, 0, 0, 7); x.fill(); }),
    body: cvTex(64, 128, x => { x.fillStyle = '#fff'; x.fillRect(16, 30, 32, 54); x.beginPath(); x.arc(32, 18, 13, 0, 7); x.fill(); x.save(); x.translate(12, 34); x.rotate(.35); x.fillRect(-5, 0, 10, 38); x.restore(); x.save(); x.translate(52, 34); x.rotate(-.5); x.fillRect(-5, 0, 10, 38); x.restore(); x.fillRect(18, 82, 11, 42); x.save(); x.translate(41, 84); x.rotate(-.25); x.fillRect(-5, 0, 11, 40); x.restore(); }),
    crack: cvTex(128, 128, x => { x.strokeStyle = '#fff'; x.lineCap = 'round'; const br = (px, py, a, l, w, d) => { x.lineWidth = w; x.beginPath(); x.moveTo(px, py); let qx = px, qy = py; const n = 5 + Math.random() * 4 | 0; for (let i = 0; i < n; i++) { a += (Math.random() - .5) * .9; qx += Math.cos(a) * l / n; qy += Math.sin(a) * l / n; x.lineTo(qx, qy); if (d > 0 && Math.random() < .35) { x.stroke(); br(qx, qy, a + (Math.random() < .5 ? 1 : -1) * (.6 + Math.random() * .6), l * .45, w * .6, d - 1); x.lineWidth = w; x.beginPath(); x.moveTo(qx, qy); } } x.stroke(); };
      const a0 = Math.random() * 6.28; br(64, 64, a0, 60, 3.2, 2); br(64, 64, a0 + Math.PI + (Math.random() - .5) * .6, 54, 3, 2); }),
    hole: cvTex(64, 64, x => { const g = x.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, 'rgba(50,50,50,1)'); g.addColorStop(.55, 'rgba(70,70,70,1)'); g.addColorStop(.7, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28, r = 24 + Math.random() * 7; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill();
      x.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = 26 + Math.random() * 4; x.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2, 2); } }),
    patch: cvTex(64, 64, x => { x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.moveTo(6 + Math.random() * 6, 6); for (const [px, py] of [[58, 4], [60, 58], [4, 60]]) x.lineTo(px + (Math.random() - .5) * 6, py + (Math.random() - .5) * 6); x.fill(); x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }),
    scorch: cvTex(64, 64, x => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }) };
  const pool = [], dq = []; for (let i = 0; i < 80; i++) { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false })); m.rotation.x = -Math.PI / 2; m.visible = false; dScene.add(m); pool.push(m); }
  let needClear = true;
  const GN = 200, grid = new Float32Array(GN * GN), gi = p => { const x = Math.floor((p[0] / BS + .5) * GN), y = Math.floor((p[1] / BS + .5) * GN); return x < 0 || y < 0 || x >= GN || y >= GN ? -1 : y * GN + x; };
  function decal(p, size, tex, col, a = 1, rot = Math.random() * 6.28, sy = 1) { dq.push([p[0], p[1], size, tex, col, a, rot, sy]); }
  const BLOOD = [0x7d0000, 0x6e0303, 0x5e0000, 0x8c0808], bcol = () => BLOOD[Math.floor(Math.random() * 4)];
  function wet(p, r, a) { const c = BS / GN; for (let dx = -r; dx <= r; dx += c) for (let dy = -r; dy <= r; dy += c) { const i = gi([p[0] + dx, p[1] + dy]); if (i >= 0) grid[i] = Math.min(3, grid[i] + a); } }
  function bloodAt(p, size, a = .9) { decal(p, size, 'b' + Math.floor(Math.random() * 3), bcol(), a); wet(p, size * .4, a); }
  let ruinV = -1;
  function flush() {
    { const R = G3.ruin(); if (R.v !== ruinV) { ruinV = R.v; needClear = true; } }
    if (needClear) { const cc = renderer.getClearColor(new T.Color()), ca = renderer.getClearAlpha(); renderer.setRenderTarget(RT); renderer.setClearColor(0, 0); renderer.clear(); renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); needClear = false; grid.fill(0); dq.unshift(...G3.ruin().decals); } // разбитый асфальт, ямы, пятна мазута — под кровью
    while (dq.length) {
      const batch = dq.splice(0, pool.length);
      batch.forEach((d, i) => { const m = pool[i]; m.position.set(d[0], 0, d[1]); m.scale.set(d[2], d[2] * d[7], 1); m.rotation.z = d[6]; m.material.map = TEX[d[3]]; m.material.color.setHex(d[4]); m.material.opacity = d[5]; m.material.needsUpdate = true; m.visible = true; });
      const ac = renderer.autoClear; renderer.setRenderTarget(RT); renderer.autoClear = false; renderer.render(dScene, dCam); renderer.autoClear = ac; renderer.setRenderTarget(null);
      for (const m of pool) m.visible = false;
    }
  }
  // ===== брызги и ошмётки =====
  const PN = 700, drops = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0x9a0000 }), PN); drops.frustumCulled = false; scene.add(drops);
  const dP = new Float32Array(PN * 3), dV = new Float32Array(PN * 3), dL = new Float32Array(PN), dS = new Float32Array(PN); let dI = 0;
  const M4 = new T.Matrix4(), V3 = new T.Vector3(), Q = new T.Quaternion(), S3 = new T.Vector3(), E = new T.Euler(), ZERO = new T.Matrix4().makeScale(0, 0, 0);
  function spray(p, h, dir, n, sp, size = 1.6) { for (let k = 0; k < n; k++) { const i = dI++ % PN; dP[i * 3] = p[0]; dP[i * 3 + 1] = h; dP[i * 3 + 2] = p[1]; const a = Math.atan2(dir[1], dir[0]) + (Math.random() - .5) * 1.4, s = sp * (.3 + Math.random()); dV[i * 3] = Math.cos(a) * s; dV[i * 3 + 1] = 40 + Math.random() * sp * .8; dV[i * 3 + 2] = Math.sin(a) * s; dL[i] = 1; dS[i] = size * (.5 + Math.random()); } }
  const GIBN = 160, gibs = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), MAT(0xffffff), GIBN); gibs.frustumCulled = false; gibs.setColorAt(0, new T.Color(0x7a0a0a)); scene.add(gibs);
  const gb = []; for (let i = 0; i < GIBN; i++) gb.push({ on: 0, p: [0, 0, 0], v: [0, 0, 0], r: [0, 0, 0], w: [0, 0, 0], s: [1, 1, 1], t: 0 }); let gI = 0;
  function gib(p, h, dir, s, col, sp) { const i = gI++ % GIBN, o = gb[i]; o.on = 1; o.p = [p[0], h, p[1]]; const a = Math.atan2(dir[1], dir[0]) + (Math.random() - .5) * 1.6, v = sp * (.4 + Math.random() * .8); o.v = [Math.cos(a) * v, 60 + Math.random() * 130, Math.sin(a) * v]; o.r = [0, 0, 0]; o.w = [(Math.random() - .5) * 20, (Math.random() - .5) * 20, (Math.random() - .5) * 20]; o.s = s; o.t = 0; gibs.setColorAt(i, new T.Color(col)); gibs.instanceColor.needsUpdate = true; }
  // огонь (огнемёт, горящие зомби)
  const glow = TEX.drop, SPN = 150, sps = []; for (let i = 0; i < SPN; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xffb040, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.visible = false; s.userData = { t: 9, life: 1, v: [0, 0, 0], s0: 10, s1: 20 }; scene.add(s); sps.push(s); } let spI = 0;
  function sprite(p, h, s0, s1, life, col, v = [0, 0, 0]) { const s = sps[spI++ % SPN]; s.position.set(p[0], h, p[1]); s.material.color.setHex(col); s.userData = { t: 0, life, v, s0, s1 }; s.visible = true; }
  function flame(from, d, end) { G3.flameJet(from, d, end); if ((d[0] || d[1]) && Math.random() < .08) decal(add(from, d, end * (.7 + Math.random() * .3)), 16 + Math.random() * 12, 'scorch', 0x16100c, .35); for (let i = 0; i < 1; i++) sprite(add(from, d, Math.random() * end), 18, 6, 22, .35, Math.random() < .5 ? 0xff8a20 : 0xffd040, [d[0] * 120, 20, d[1] * 120]); }
  function boom(c, r = 100) { G3.boom(c, r); decal(c, r * 1.2, 'scorch', 0x16100c, .85); spray(c, 10, [1, 0], 30, 160, 2.4); }
  // ===== зомби =====
  const ZN = 400;
  const zShadow = new T.InstancedMesh(new T.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28, depthWrite: false }), ZN); zShadow.frustumCulled = false; scene.add(zShadow);
  const base = new T.Matrix4(), loc = new T.Matrix4(), tmp = new T.Matrix4(), C = new T.Color(), WHITE = new T.Color(1, 1, 1), FIRE = new T.Color(1, .45, .1), ICE = new T.Color(.6, .85, 1);
  const STREET_LOOKS = [
    { skin: 0xb98162, shirt: 0xe96355, pants: 0x3e658e, hair: 0x41c7ef, shorts: true, open: true, coralShirt: true },
    { skin: 0xd49c82, shirt: 0xe9edf4, pants: 0x3a6a9a, hair: 0xff5ba9, shorts: true, crop: true, unicorn: true },
    { skin: 0x815740, shirt: 0x79da57, pants: 0x36638d, hair: 0x9a6ee9, crop: true },
    { skin: 0xc38c68, shirt: 0xffb039, pants: 0x416b98, hair: 0x29b8bc, open: true }
  ];
  function look(id) {
    return { ...STREET_LOOKS[(id - 1 + Math.floor((id - 1) / STREET_LOOKS.length)) % STREET_LOOKS.length], seed: ((id * 9301) % 233280) / 38880 };
  }
  // Бегун: округлый костюм и маска, два пакета инстансов на всех налётчиков.
  const RAIDER = 1, STANDARD_BEARER = 2, ENFORCER = 4;
  const raiderGeo = new T.SphereGeometry(1, 8, 6);
  const suit = new T.InstancedMesh(raiderGeo, new T.MeshPhongMaterial({
    color: 0xffffff, emissive: 0x252130, specular: 0x515669, shininess: 30
  }), ZN * 14);
  const raiderMarks = new T.InstancedMesh(raiderGeo, new T.MeshBasicMaterial({ color: 0xffffff }), ZN * 2);
  for (const mesh of [suit, raiderMarks]) {
    // Three.js r128 выделяет буфер цветов по count при первом setColorAt.
    mesh.setColorAt(0, WHITE);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const limb = new T.Vector3(), limbUp = new T.Vector3(0, 1, 0);
  let suitCount = 0, markCount = 0;
  function enemyPart(mesh, i, color, x, y, z, sx, sy, sz, rx = 0, rz = 0, ry = 0) {
    loc.compose(V3.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S3.set(sx, sy, sz));
    mesh.setMatrixAt(i, tmp.multiplyMatrices(base, loc));
    mesh.setColorAt(i, color);
  }
  function raiderLimb(x, y0, z0, y1, z1, width) {
    limb.set(0, y1 - y0, z1 - z0);
    const length = limb.length();
    loc.compose(V3.set(x, (y0 + y1) / 2, (z0 + z1) / 2),
      Q.setFromUnitVectors(limbUp, limb.normalize()), S3.set(width, length / 2 + width * .55, width));
    suit.setMatrixAt(suitCount, tmp.multiplyMatrices(base, loc));
    suit.setColorAt(suitCount++, C);
  }
  function enemyColor(hex, z, t) {
    C.setHex(hex);
    if (z.fl & 2) C.lerp(FIRE, .35 + .2 * Math.sin(t * 20 + (z.seed || 0)));
    if (z.fl & 8) C.lerp(ICE, .6);
    if (z.flash > 0) C.lerp(WHITE, z.flash);
    return C;
  }
  const raiderRig = renderer.capabilities.isWebGL2 ? RaiderSuit.createSuit(T, RAIDER_SUIT_MODEL, ZN) : null;
  let raiderCount = 0;
  if (raiderRig) {
    raiderRig.mesh.name = 'Skinned raiders';
    scene.add(raiderRig.mesh, raiderRig.cap);
    // The existing projected enemy shadow follows every raider.
    raiderRig.mesh.castShadow = false;
  }
  function drawSkinnedRaider(z, sc, t) {
    const id = z.id || 1, fall = z.fall || 0;
    const frozen = Boolean(z.fl & 8);
    const [dx, dz] = z.d || [0, 0];
    const side = dx * Math.cos(z.yaw) - dz * Math.sin(z.yaw);
    const attack = !frozen && !fall && (z.fl & 1) ? ((t - (z.attackSince ?? t)) % .85) : -1;
    raiderRig.pose(raiderCount++, {
      id, time: t, freezeTime: z.freezeSince, walk: (frozen ? (z.freezeWalk ?? z.walk) : z.walk) / (.12 * RaiderSuit.SUIT_STRIDE_LENGTH),
      x: z.p[0], z: z.p[1], scale: sc, yaw: z.yaw, attack,
      backTurn: fall ? 0 : (z.backTurn || 0), fall, impact: side < 0 ? -1 : 1,
      lift: z.fl & 4 ? 10 * Math.abs(Math.sin(t * 6)) : 0,
      hit: z.flash, lost: z.lost, frozen, burning: Boolean(z.fl & 2)
    });
  }
  function drawRaider(z, sc, t) {
    if (raiderRig) return drawSkinnedRaider(z, sc, t);
    const fall = z.fall || 0, noLegs = z.lost & 4, phase = z.walk / (Math.PI * 2);
    const air = z.fl & 4 ? 10 * Math.abs(Math.sin(t * 6)) : 0;
    const lunge = z.fl & 1 ? .5 + .5 * Math.sin(t * 16) : 0;
    const turn = fall ? 0 : (z.backTurn || 0);
    const kick = Math.max(0, turn * 2 - 1);
    const height = noLegs ? 9 : 19 + Math.cos(z.walk * 2) * .8 - lunge * 2 + kick * 3;
    const recoil = (z.kick || 0) * .2;
    base.compose(V3.set(z.p[0], air, z.p[1]), Q.setFromEuler(E.set(0, z.yaw + Math.PI * turn, 0)), S3.setScalar(sc));
    if (fall) {
      base.multiply(tmp.makeTranslation(0, 6, 0));
      base.multiply(tmp.makeRotationZ(fall * Math.PI / 2));
      base.multiply(tmp.makeTranslation(0, -height, 0));
    }
    enemyPart(suit, suitCount++, enemyColor(0x625472, z, t), 0, height, 2, 7, 5.6, 14, -.12 + recoil);
    enemyPart(suit, suitCount++, enemyColor(0x51465b, z, t), 0, height + .5, -10, 6, 4.8, 6);
    enemyPart(raiderMarks, markCount++, enemyColor(0xe88757, z, t), 0, height + 5.2, 6, 5.3, 1.4, 6.5);
    if (!(z.lost & 16)) {
      const headZ = 16 + lunge * 3;
      enemyPart(suit, suitCount++, enemyColor(0x625770, z, t), turn * 2.8, height + 1, headZ - turn * 3, 4.8, 5.8, 5.4, recoil, 0, turn * 1.25);
      enemyPart(raiderMarks, markCount++, enemyColor(0xf2af68, z, t), turn * 6.7, height + 2.5, headZ + 4.7 - turn * 6, 3.9, 1.35, 1.2, 0, 0, turn * 1.25);
    }
    enemyColor(0x594e64, z, t);
    for (const side of [-1, 1]) {
      for (const front of [true, false]) {
        if (front ? z.lost & (side < 0 ? 1 : 2) : noLegs) continue;
        // Диагональные пары: опора идёт назад, перенос возвращает кисть или стопу вперёд.
        const offset = phase + ((side < 0) === front ? .5 : 0);
        const step = offset - Math.floor(offset);
        const swing = Math.max(0, (step - .58) / .42);
        const stride = step < .58 ? 1 - 2 * step / .58 : -Math.cos(swing * Math.PI);
        const lift = Math.sin(swing * Math.PI) * 7;
        const jointZ = front ? 11 : -10, endZ = jointZ + stride * 12 + (front ? 3 : -1) - (front ? 0 : kick * 12);
        const endY = fall ? height - 4 : 2 + lift * (1 - turn) + (front ? 0 : kick * 13);
        const jointY = height - (front ? 1 : 2);
        const bendY = (jointY + endY) / 2 + (front ? 2 : 5);
        const bendZ = (jointZ + endZ) / 2 + (front ? -4 : 6);
        raiderLimb(side * 6, jointY, jointZ, bendY, bendZ, front ? 2.7 : 3.1);
        raiderLimb(side * 6, bendY, bendZ, endY, endZ, 2.3);
      }
    }
  }
  // Двусторонний радужный флаг. Складки заданы в общей геометрии.
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 64;
  bannerCanvas.height = 48;
  const bannerInk = bannerCanvas.getContext('2d');
  const rainbow = ['#e6373b', '#ff8b25', '#ffdf3e', '#319b53', '#2766d3', '#893bb5'];
  const stripeHeight = bannerCanvas.height / rainbow.length;
  rainbow.forEach((color, i) => {
    bannerInk.fillStyle = color;
    bannerInk.fillRect(0, i * stripeHeight, bannerCanvas.width, stripeHeight);
  });
  const bannerGeo = new T.PlaneGeometry(1, 1, 12, 2).translate(.5, 0, 0);
  const bannerTime = { value: 0 };
  const bannerMaterial = new T.MeshBasicMaterial({
    map: new T.CanvasTexture(bannerCanvas), side: T.DoubleSide
  });
  bannerMaterial.onBeforeCompile = shader => {
    shader.uniforms.bannerTime = bannerTime;
    shader.vertexShader = 'uniform float bannerTime; varying float foldLight;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float along = position.x;
        float flutter = along * 12.5 - bannerTime * 4.4 + instanceMatrix[3].x * .027;
        transformed.z += sin(flutter) * .16 * along;
        transformed.y -= along * .115 + cos(flutter) * along * .04;
        foldLight = .89 + cos(flutter) * along * .16;
      `);
    shader.fragmentShader = 'varying float foldLight;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= foldLight;');
  };
  const banners = new T.InstancedMesh(bannerGeo, bannerMaterial, ZN);
  banners.setColorAt(0, WHITE);
  banners.count = 0;
  banners.frustumCulled = false;
  scene.add(banners);
  const supportRings = new T.InstancedMesh(new T.RingGeometry(.978, 1, 48).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({ color: 0xfcc068, transparent: true, opacity: .55, depthWrite: false }), ZN);
  supportRings.frustumCulled = false;
  supportRings.count = 0;
  scene.add(supportRings);
  let supportCount = 0;
  let bannerCount = 0;
  const bannerPivot = new T.Matrix4();
  const bearerRig = raiderRig ? RaiderSuit.createSuit(T, RAIDER_SUIT_MODEL, ZN, "bearer") : null;
  if (bearerRig) {
    bearerRig.mesh.name = 'Skinned standard bearers';
    bearerRig.mesh.castShadow = false;
    scene.add(bearerRig.mesh, bearerRig.cap);
  }
  const flagGrip = new T.Vector3();
  const flagPole = new T.InstancedMesh(new T.LatheGeometry([
    new T.Vector2(0, -15), new T.Vector2(.78, -15), new T.Vector2(.78, 32),
    new T.Vector2(1.4, 32), new T.Vector2(1.45, 33.5), new T.Vector2(0, 36)
  ], 8), new T.MeshPhongMaterial({ color: 0xffffff, shininess: 18 }), ZN);
  flagPole.setColorAt(0, WHITE);
  flagPole.count = 0;
  flagPole.frustumCulled = false;
  scene.add(flagPole);
  let bearerCount = 0, poleCount = 0;

  function drawSkinnedBearer(z, sc, t, fall, attack) {
    const frozen = z.fl & 8, hasFlag = !(z.lost & 2);
    const walk = z.walk * .56, wave = frozen || fall ? 0 : Math.sin(t * 4.8 + (z.seed || 0));
    bearerRig.pose(bearerCount, {
      walk, yaw: z.yaw, x: z.p[0], z: z.p[1], scale: sc * .88,
      fall, attack: frozen ? 0 : attack, hit: z.flash, lost: z.lost, burning: z.fl & 2,
      frozen, backTurn: 0, lift: 0, wave, grip: hasFlag ? flagGrip : null
    });
    if (hasFlag) {
      bearerRig.mesh.getMatrixAt(bearerCount, base);
      bannerPivot.makeTranslation(flagGrip.x, flagGrip.y, flagGrip.z);
      bannerPivot.multiply(tmp.makeRotationZ(.13 + wave * .37));
      bannerPivot.multiply(tmp.makeRotationX(.08 + attack * .5 + wave * .11));
      base.multiply(bannerPivot);
      enemyPart(flagPole, poleCount++, enemyColor(0xa48261, z, t), 0, 0, 0, 1, 1, 1);
      enemyPart(banners, bannerCount++, enemyColor(0xffffff, z, t), 0, 23.4, 0, 23, 16, 18, 0, 0, -1.36);
    }
    bearerCount++;
  }

  function drawStandardBearer(z, sc, t, fall) {
    const support = z.ty === RAIDER_SUPPORT;
    const crawl = z.lost & 4, stride = Math.sin(z.walk * .7);
    const attack = z.fl & 1 ? .5 + .5 * Math.sin(t * 12) : 0;
    if (!support && bearerRig) return drawSkinnedBearer(z, sc, t, fall, attack);
    const lean = .07 + attack * .23 - (z.kick || 0) * .35;
    const bob = Math.abs(stride) * 1.2;
    base.compose(V3.set(z.p[0], 0, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.setScalar(sc));
    if (fall) base.multiply(tmp.makeRotationX(-fall * 1.45));
    else if (crawl) base.multiply(tmp.makeRotationX(1.33)).multiply(tmp.makeTranslation(0, -19, -8));

    enemyPart(suit, suitCount++, enemyColor(support ? 0x2f9296 : 0x713343, z, t), 0, 22 + bob, 0, 10, 13, 7, lean);
    enemyPart(suit, suitCount++, enemyColor(support ? 0x42bbb1 : 0x8a3b52, z, t), 0, 24 + bob, -5.5, 11, 15, 4.8, lean - .13);
    enemyPart(raiderMarks, markCount++, enemyColor(support ? 0xf4cd76 : 0xb8734d, z, t), 0, 29 + bob, 2, 11, 3, 6, lean);
    if (!(z.lost & 16)) {
      enemyPart(suit, suitCount++, enemyColor(0xbb8970, z, t), 0, 36 + bob, 2, 4.8, 5.4, 4.5, lean);
      enemyPart(suit, suitCount++, enemyColor(0x513241, z, t), 0, 38 + bob, .2, 5.3, 4.4, 4.8, lean);
      enemyPart(suit, suitCount++, enemyColor(0x513241, z, t), 0, 40 + bob, -3.5, 3.1, 2.8, 3.1);
    }
    if (!crawl) {
      enemyPart(suit, suitCount++, enemyColor(0x4b3540, z, t), -4.4, 8 + Math.max(0, stride) * 3, stride * 5, 3.8, 9, 3.8, stride * .22);
      enemyPart(suit, suitCount++, enemyColor(0x4b3540, z, t), 4.4, 8 + Math.max(0, -stride) * 3, -stride * 5, 3.8, 9, 3.8, -stride * .22);
    }
    const rightHand = !(z.lost & 2), leftHand = !(z.lost & 1);
    const flagHand = rightHand ? 1 : support && leftHand ? -1 : 0;
    const sleeve = support ? 0x2f9296 : 0x843952;
    if (leftHand && flagHand !== -1) enemyPart(suit, suitCount++, enemyColor(sleeve, z, t), -10, 23 + bob, 3 + attack * 5, 3.3, 8, 3.4, -stride * .24 - attack * .8);
    if (support || flagHand) {
      if (flagHand) enemyPart(suit, suitCount++, enemyColor(sleeve, z, t), flagHand * 10, 25 + bob, 6, 3.3, 7.5, 3.4, -.65);
      // Если знаменосец поддержки потерял обе руки, флаг остаётся в креплении за спиной.
      bannerPivot.makeTranslation(flagHand * 11, 23 + bob + (support ? 4 : 0), flagHand ? 9 : -6);
      bannerPivot.multiply(tmp.makeRotationX(.14 + attack * .5));
      bannerPivot.multiply(tmp.makeRotationZ(-.13 + stride * .08 + fall * .6 + (support && flagHand && !fall && !(z.fl & 8) ? Math.sin(t * 5) * .32 : 0)));
      base.multiply(bannerPivot);
      enemyPart(suit, suitCount++, enemyColor(0x8e614a, z, t), 0, 9, 0, 1.05, 23, 1.05);
      enemyPart(banners, bannerCount++, enemyColor(0xffffff, z, t), 0, 23, 0, 21, 15, 14);
    }
  }
  // Громила: открытые плечи и грудь, кожаная портупея и металлические пряжки.
  const enforcerSkin = new T.InstancedMesh(raiderGeo, new T.MeshPhongMaterial({
    color: 0xffffff, emissive: 0x211510, specular: 0x332417, shininess: 16
  }), ZN * 12);
  enforcerSkin.setColorAt(0, WHITE);
  enforcerSkin.count = 0;
  enforcerSkin.frustumCulled = false;
  scene.add(enforcerSkin);
  const ENFORCER_SKIN = [0x69442f, 0x79513b, 0x86583d];
  const LEATHER = 0x302729, STRAP = 0x51332e;
  const enforcerTone = seed => ENFORCER_SKIN[Math.floor((seed || 0) / 2) % ENFORCER_SKIN.length];
  let enforcerSkinCount = 0;
  // громила и босс — цельная мускулистая модель со скелетом (src/brute.js)
  const bruteRig = raiderRig ? BruteRig.create(T, RAIDER_SUIT_MODEL, 120, false) : null, bossRig = null; // босс — пока прежний
  if (bruteRig) scene.add(bruteRig.mesh, bruteRig.cap);
  let bruteCount = 0, bossCount = 0;
  const BRUTE_SKIN = [0x3b2a22, 0x4a3326, 0x2f2019, 0x54392b, 0x3a261c];
  function drawEnforcer(z, sc, t, fall) {
    if (bruteRig && !ZT[z.ty].boss && bruteCount < 120) {
      const ac = t * 1.3 + z.id * .37, atk = z.fl & 1 ? ac % 1 : -1;
      bruteRig.pose(bruteCount++, { id: z.id, time: t, kind: (Math.floor(ac) + z.id) % 3, walk: z.walk * .62, yaw: z.yaw, x: z.p[0], z: z.p[1], scale: sc * .86, fall, atk, hit: z.flash, lost: z.lost,
        burning: z.fl & 2, frozen: z.fl & 8, kick: z.kick || 0, lift: z.fl & 4 ? 8 * Math.abs(Math.sin(t * 6)) : 0, skin: BRUTE_SKIN[(z.seed || z.id) % BRUTE_SKIN.length] });
      return;
    }
    const crawl = z.lost & 4, stride = Math.sin(z.walk * .66);
    const swing = z.fl & 1 ? .5 + .5 * Math.sin(t * 11) : 0;
    const lean = .12 + swing * .26 - (z.kick || 0) * .32;
    const bob = Math.abs(stride) * 1.1;
    const skin = enforcerTone(z.seed);
    base.compose(V3.set(z.p[0], 0, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.setScalar(sc));
    if (fall) base.multiply(tmp.makeRotationX(-fall * 1.5));
    else if (crawl) base.multiply(tmp.makeRotationX(1.35)).multiply(tmp.makeTranslation(0, -18, -8));

    enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), 0, 28 + bob, 0, 9.9, 10.5, 6, lean);
    enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), 0, 22 + bob, 1.3, 6.5, 7.2, 5.4, lean);
    enemyPart(suit, suitCount++, enemyColor(LEATHER, z, t), 0, 18.5 + bob, 0, 7.6, 4.8, 5.4);
    enemyPart(suit, suitCount++, enemyColor(STRAP, z, t), 0, 20 + bob, .3, 7.7, 1.65, 5.6);
    enemyPart(raiderMarks, markCount++, enemyColor(0xc4a177, z, t), 0, 20 + bob, 5.8, 1.7, 1.1, .7);
    enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), 0, 37 + bob, 2, 3.5, 4.1, 3.6, lean);
    enemyPart(suit, suitCount++, enemyColor(STRAP, z, t), 0, 37.5 + bob, 2, 3.6, 1.3, 3.75, lean);
    if (!(z.lost & 16)) {
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), 0, 42 + bob, 2.7, 4.55, 5.25, 4.5, lean);
      enemyPart(suit, suitCount++, enemyColor(LEATHER, z, t), 0, 44 + bob, 2.1, 4.75, 3.5, 4.65, lean);
      enemyPart(raiderMarks, markCount++, enemyColor(0xaf9078, z, t), 0, 43.3 + bob, 6.5, 2.9, .7, .5);
    }
    for (const side of [-1, 1]) {
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), side * 4.5, 31 + bob, 4, 5, 3.9, 3.6, lean);
      enemyPart(suit, suitCount++, enemyColor(STRAP, z, t), side * 4.2, 30.5 + bob, 6.5, 1.15, 6.3, 1.25, lean, -side * .5);
      enemyPart(suit, suitCount++, enemyColor(STRAP, z, t), side * 3.5, 31 + bob, -4.7, 1.15, 6.8, 1.4, lean, -side * .56);
      if (!crawl) {
        const step = stride * side, lift = Math.max(0, step) * 2.3;
        enemyPart(suit, suitCount++, enemyColor(LEATHER, z, t), side * 4.7, 12.5 + lift, step * 3, 4.1, 7, 4.3, step * .27);
        enemyPart(suit, suitCount++, enemyColor(0x211d21, z, t), side * 5, 4.5 + lift, 1 + step * 5, 3.55, 5.2, 4.7, step * .12);
      }
      if (z.lost & (side < 0 ? 1 : 2)) continue;
      const motion = stride * side, punch = swing * (side === 1 ? 1 : .4);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), side * 10.1, 32 + bob, 1, 4.6, 4.8, 4.3);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), side * 11.7, 27 + bob + punch * 2, 2 + motion * 2 + punch * 4, 3.65, 5.6, 3.6, -.27 + motion * .35 - punch, side * .1);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(skin, z, t), side * 11.9, 22 + bob + punch * 5, 5 + motion * 3 + punch * 6, 3, 5.2, 3.4, -.65 + motion * .35 - punch);
      enemyPart(suit, suitCount++, enemyColor(LEATHER, z, t), side * 11.9, 18.5 + bob + punch * 8, 7 + motion * 4 + punch * 8, 3.2, 3.6, 3.6);
    }
  }
  const printCanvas = document.createElement('canvas');
  printCanvas.width = printCanvas.height = 32;
  const ink = printCanvas.getContext('2d');
  // Голова единорога и розовая грива. Крупный принт читается с игровой камеры.
  ink.fillStyle = '#ec4f9f';
  ink.beginPath();
  ink.ellipse(15, 20, 10, 11, -.32, 0, Math.PI * 2);
  ink.fill();
  ink.fillStyle = '#eefaff';
  ink.beginPath();
  for (const [x, y] of [[9, 28], [12, 13], [16, 7], [18, 13], [23, 15], [29, 23], [25, 27], [18, 24], [18, 30]]) ink.lineTo(x, y);
  ink.closePath();
  ink.fill();
  ink.fillStyle = '#f3b53a';
  ink.beginPath(); ink.moveTo(20, 14); ink.lineTo(25, 2); ink.lineTo(26, 17); ink.fill();
  ink.fillStyle = '#4b4269'; ink.fillRect(20, 17, 3, 3);
  const prints = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
    map: new T.CanvasTexture(printCanvas), alphaTest: .3, side: T.DoubleSide
  }), ZN * 2);
  prints.setColorAt(0, WHITE);
  prints.count = 0;
  prints.frustumCulled = false;
  scene.add(prints);
  let printCount = 0;

  function fabricMesh(finish, capacity) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const weave = ((x + y * 3) % 5) * 4 + ((x * 19 + y * 29 + x * y * 7) % 23);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 218 + weave;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    finish(ctx);
    const tex = new T.CanvasTexture(canvas);
    tex.wrapS = T.RepeatWrapping;
    const mesh = new T.InstancedMesh(raiderGeo, new T.MeshPhongMaterial({
      map: tex, color: 0xffffff, emissive: 0x16181b, specular: 0x26252b, shininess: 12
    }), capacity);
    mesh.setColorAt(0, WHITE);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  function denimSeams(ctx) {
    ctx.fillStyle = '#777c85';
    for (const x of [0, 31, 61]) ctx.fillRect(x, 0, 3, 64);
    ctx.fillStyle = '#d4c5a5';
    for (const x of [2, 33, 63]) for (let y = 0; y < 64; y += 5) ctx.fillRect(x, y, 1, 2);
  }
  const denimLeg = fabricMesh(ctx => {
    // Вытертая ткань спереди и сзади, складки в зоне колена.
    for (const x of [16, 48]) {
      const fade = ctx.createRadialGradient(x, 29, 2, x, 29, 16);
      fade.addColorStop(0, '#fff9');
      fade.addColorStop(1, '#fff0');
      ctx.fillStyle = fade; ctx.fillRect(x - 16, 10, 32, 38);
      ctx.strokeStyle = '#5c6173aa'; ctx.lineWidth = 2;
      for (const y of [30, 37, 44]) {
        ctx.beginPath(); ctx.moveTo(x - 10, y);
        ctx.quadraticCurveTo(x + 1, y + 5, x + 9, y - 2); ctx.stroke();
      }
    }
    denimSeams(ctx);
  }, ZN * 4);
  const denimWaist = fabricMesh(ctx => {
    denimSeams(ctx);
    ctx.fillStyle = '#737887';
    ctx.fillRect(0, 16, 64, 5);
    ctx.fillRect(46, 21, 3, 37);
    ctx.lineWidth = 2;
    for (const x of [39, 56]) {
      ctx.fillStyle = '#a3a9b5'; ctx.strokeStyle = '#e7d2ab';
      ctx.beginPath(); ctx.moveTo(x - 6, 29); ctx.lineTo(x + 6, 29);
      ctx.lineTo(x + 5, 42); ctx.lineTo(x, 47); ctx.lineTo(x - 5, 42);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }, ZN);
  const streetCotton = fabricMesh(ctx => {
    ctx.fillStyle = '#4b3e452e';
    for (let x = 4; x < 64; x += 12) ctx.fillRect(x, 0, 2, 64);
    ctx.fillRect(0, 42, 64, 2);
    ctx.fillStyle = '#ffe4d06b';
    ctx.fillRect(0, 46, 64, 1);
    ctx.fillRect(0, 49, 64, 2);
  }, ZN * 4);
  let denimCount = 0, waistCount = 0, cottonCount = 0;

  const streetRig = raiderRig ? RaiderSuit.createSuit(T, RAIDER_SUIT_MODEL, ZN, "street") : null;
  let streetCount = 0;
  if (streetRig) {
    streetRig.mesh.name = 'Skinned street raiders';
    streetRig.mesh.castShadow = false;
    scene.add(streetRig.mesh, streetRig.cap);
  }
  function drawStreetRaider(z, sc, t, fall) {
    const crawl = z.lost & 4, turn = fall ? 0 : (z.backTurn || 0);
    const phase = z.walk * .85;
    const coral = z.coralShirt;
    const stride = Math.sin(phase) * (1 - turn * 2);
    const attack = z.fl & 1 ? .5 + .5 * Math.sin(t * 14) : 0;
    if (coral && streetRig) {
      streetRig.pose(streetCount++, {
        walk: phase, yaw: z.yaw, x: z.p[0], z: z.p[1], scale: sc * .87,
        fall, attack, hit: z.flash, lost: z.lost, burning: z.fl & 2, frozen: z.fl & 8,
        backTurn: turn, lift: z.fl & 4 ? 8 * Math.abs(Math.sin(t * 6)) : 0
      });
      return;
    }
    const air = z.fl & 4 ? 8 * Math.abs(Math.sin(t * 6)) : 0;
    const lean = .13 + attack * .24 + turn * .21 - (z.kick || 0) * .35;
    const bob = Math.abs(stride);
    const flourish = coral && !fall && !crawl ? (1 - turn) * (1 - attack) : 0;
    // The hips lead the next crossing step; the shoulders counter-rotate.
    const sway = Math.cos(phase) * flourish;
    const hipX = sway * 1.43, shoulderX = -sway * .72;
    const hipRoll = sway * .12, shoulderRoll = -sway * .095;
    base.compose(V3.set(z.p[0], air, z.p[1]), Q.setFromEuler(E.set(0, z.yaw + Math.PI * turn, 0)), S3.setScalar(sc));
    if (fall) base.multiply(tmp.makeRotationX(-fall * 1.48));
    else if (crawl) base.multiply(tmp.makeRotationX(1.35)).multiply(tmp.makeTranslation(0, -18, -8));

    if (z.open || z.crop) enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t), shoulderX, 26 + bob + (coral ? 1.2 : 0), 1, 5.8, 7, 4.4, lean, shoulderRoll);
    if (z.open) {
      for (const side of [-1, 1]) {
        enemyPart(streetCotton, cottonCount++, enemyColor(z.shirt, z, t), shoulderX + side * 3.7, 29 + bob + (coral ? 1.2 : 0), .3, 3.6, coral ? 7 : 8, 4.7, lean, shoulderRoll + side * .08);
        enemyPart(suit, suitCount++, enemyColor(0xf4d9c2, z, t), shoulderX + side * 2.4, 34.3 + bob, 4.35, 1.05, 2.6, .85, lean + .24, shoulderRoll - side * .52);
      }
    } else {
      enemyPart(streetCotton, cottonCount++, enemyColor(z.shirt, z, t), 0, 29.5 + bob, 1.3, 6.8, z.crop ? 5.2 : 8.4, 4.55, lean);
      if (z.unicorn) {
        enemyPart(prints, printCount++, enemyColor(0xffffff, z, t), 0, 30 + bob, 5.85, 6, 6, 1, lean);
        enemyPart(prints, printCount++, enemyColor(0xffffff, z, t), 0, 31 + bob, -3.4, 6, 6, 1, -lean, 0, Math.PI);
      }
    }
    enemyPart(denimWaist, waistCount++, enemyColor(z.pants, z, t), hipX, 20, 0, 6.4, coral ? 3.1 : 3.9, 4.6, 0, hipRoll);
    if (!(z.lost & 16)) {
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t), shoulderX + turn, 38 + bob, 2.4, 4.15, 4.75, 4.25, lean, 0, turn * 1.65);
      enemyPart(suit, suitCount++, enemyColor(z.hair, z, t), shoulderX + turn - .65, 40.7 + bob, 2.15, 4.55, 3.1, 4.5, lean, .29, turn * 1.65);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.hair, z, t).lerp(WHITE, .18),
        shoulderX + turn + .7, 42.2 + bob, 2.05, 2.15, 2.05, 4.25, lean - .19, -.38, turn * 1.65);
      enemyPart(raiderMarks, markCount++, enemyColor(0x523d39, z, t), shoulderX + turn * 5, 38.7 + bob, 6.48 - turn * 4.4, 2.7, .57, .44, 0, 0, turn * 1.65);
    }
    for (const side of [-1, 1]) {
      const step = stride * side, lift = Math.max(0, step) * 2.5;
      if (!crawl && coral) {
        const footX = side * (4.0 - flourish * (1.45 + Math.max(0, step) * 1.55));
        const kneeX = (side * 3.55 + hipX + footX) * .5;
        const roll = (kneeX - (side * 3.4 + hipX)) * .095;
        enemyPart(denimLeg, denimCount++, enemyColor(z.pants, z, t),
          side * 3.35 + hipX, 17 + lift * .35, step * 2.2, 3.33, 4.1, 3.45, step * .38, roll);
        enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t),
          kneeX, 11.65 + lift * .7, step * 3.9, 2.65, 5.45, 2.75, step * .29, roll);
        enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t),
          (kneeX + footX) * .5, 6.85 + lift, step * 5.4, 2.13, 4.75, 2.32, -step * .16, (footX - kneeX) * .10);
        enemyPart(suit, suitCount++, enemyColor(0x37363e, z, t),
          footX, 2.25 + lift, 1.65 + step * 6, 2.72, 1.95, 4.2, step * .12);
        enemyPart(suit, suitCount++, enemyColor(0xe0d9ce, z, t),
          footX, .96 + lift, 1.93 + step * 6, 2.78, .73, 4.26, step * .12);
      } else if (!crawl) {
        enemyPart(denimLeg, denimCount++, enemyColor(z.pants, z, t), side * 3.4, 15.5 + lift, step * 4, 3.3, z.shorts ? 5 : 7, 3.4, step * .4);
        if (z.shorts) enemyPart(suit, suitCount++, enemyColor(0x9ab4c9, z, t),
          side * 3.45, 12.35 + lift, step * 4.5, 3.07, 1.55, 3.15, step * .4);
        const shin = z.shorts ? enforcerSkin : denimLeg;
        const shinIndex = z.shorts ? enforcerSkinCount++ : denimCount++;
        enemyPart(shin, shinIndex, enemyColor(z.shorts ? z.skin : z.pants, z, t), side * 3.85, 7.6 + lift, step * 5.4, 2.4, 5.7, 2.5, -step * .13);
        enemyPart(suit, suitCount++, enemyColor(z.shorts ? 0xe1e7f2 : 0x322936, z, t), side * 4, 2.8 + lift, 1.6 + step * 6, 2.8, 2.6, 4.1);
      }
      if (z.lost & (side < 0 ? 1 : 2)) continue;
      const wrist = Math.sin(phase + .75) * side * flourish;
      const reach = attack * (side === 1 ? 1 : .45);
      enemyPart(streetCotton, cottonCount++, enemyColor(z.shirt, z, t), shoulderX + side * 7, 31 + bob, 1, 2.75, coral ? 3.25 : 3.55, 2.75, .2 * step, shoulderRoll + side * .2);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t), shoulderX + side * 8.2, 26 + bob + reach * 3, 2 - step * 2.3 + reach * 2.5, 2.05, 5.4, 2.3, -.19 + step * .5 - reach);
      enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t), shoulderX + side * 8.35 + wrist * .85, 21.7 + bob + reach * 6, 3 - step * 4.8 + reach * 6, 1.85, coral ? 3.45 : 4.1, 2.1, -.38 + step * .45 - reach, wrist * .22);
      if (coral) enemyPart(enforcerSkin, enforcerSkinCount++, enemyColor(z.skin, z, t),
        shoulderX + side * 8.35 + wrist * 1.7, 18.6 + bob + reach * 7,
        3.55 - step * 5.8 + reach * 7, 1.63, 1.85, 1.72, -.28 - wrist * .42 - reach, wrist * .46);
    }
  }
  function draw(list, now) {
    let shadowCount = 0;
    raiderCount = 0;
    if (raiderRig) raiderRig.begin();
    streetCount = 0;
    bruteCount = bossCount = 0; if (bruteRig) bruteRig.begin(); if (bossRig) bossRig.begin();
    if (streetRig) streetRig.begin();
    bearerCount = poleCount = 0;
    if (bearerRig) bearerRig.begin();
    const t = now / 1000;
    bannerTime.value = t;
    suitCount = markCount = bannerCount = enforcerSkinCount = printCount = supportCount = denimCount = waistCount = cottonCount = 0;
    for (const z of list) {
      if (shadowCount >= ZN) break;
      const Tz = ZT[z.ty], sc = Tz.sc * (ZVIS[z.ty] || 1), fall = z.fall || 0;
      zShadow.setMatrixAt(shadowCount++, M4.compose(V3.set(z.p[0], .6, z.p[1]),
        Q.setFromEuler(E.set(0, z.ty === RAIDER ? z.yaw : 0, 0)),
        S3.set(Tz.r * 1.1, 1, Tz.r * (z.ty === RAIDER ? 2 : 1.1))));
      if (z.ty === RAIDER) drawRaider(z, sc, t);
      else if (z.ty === STANDARD_BEARER || z.ty === RAIDER_SUPPORT) {
        if (z.ty === RAIDER_SUPPORT && !fall) {
          supportRings.setMatrixAt(supportCount++, M4.compose(V3.set(z.p[0], .9, z.p[1]),
            Q.identity(), S3.set(SUPPORT_RADIUS, 1, SUPPORT_RADIUS)));
        }
        drawStandardBearer(z, sc, t, fall);
      }
      else if (z.ty === ENFORCER || Tz.boss) drawEnforcer(z, sc, t, fall);
      else drawStreetRaider(z, sc, t, fall);
    }
    if (raiderRig) raiderRig.upload(raiderCount);
    if (bruteRig) bruteRig.upload(bruteCount); if (bossRig) bossRig.upload(bossCount);
    if (streetRig) streetRig.upload(streetCount);
    if (bearerRig) bearerRig.upload(bearerCount);
    flagPole.count = poleCount;
    zShadow.count = shadowCount; zShadow.instanceMatrix.needsUpdate = true;
    suit.count = suitCount;
    raiderMarks.count = markCount;
    banners.count = bannerCount;
    enforcerSkin.count = enforcerSkinCount;
    prints.count = printCount;
    denimLeg.count = denimCount;
    denimWaist.count = waistCount;
    streetCotton.count = cottonCount;
    supportRings.count = supportCount;
    if (supportCount) {
      supportRings.instanceMatrix.updateRange.count = supportCount * 16;
      supportRings.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [suit, raiderMarks, banners, flagPole, enforcerSkin, prints, denimLeg, denimWaist, streetCotton]) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.updateRange.count = mesh.count * 16;
      mesh.instanceColor.updateRange.count = mesh.count * 3;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }
  // ===== попадание и смерть =====
  function hit(p, d, gore, z) { spray(p, 20, d, 4 + gore * 3, 90 + gore * 40); if (Math.random() < .5) bloodAt(add(p, d, 12 + Math.random() * 20), 14 + gore * 5, .8); if (z) z.flash = .9; }
  // видимый размер врагов под рост игрока (~62 ед. = 1.8 м): налётчики ~1.75 м, громила ~2 м, бегун — взрослый человек на четвереньках
  const ZVIS = [1.38, 1.2, 1.02, 1.12, .9, 1];
  const dying = [];
  function kill(p, d, g, ty, lost, z) {
    const sc = ZT[ty].sc * (ZVIS[ty] || 1);
    const L = ty === RAIDER ? { skin: 0x625770, shirt: 0x625472 } : ty === STANDARD_BEARER ? { skin: 0xbb8970, shirt: 0x713343 } : (ty === ENFORCER || ZT[ty].boss) ? { skin: enforcerTone(z?.seed), shirt: LEATHER } : z || look(Math.floor(Math.random() * 999), ty);
    spray(p, 20 * sc, d, 10 + g * 10, 120 + g * 50, 1.6 + g * .3); bloodAt(p, 30 * sc + g * 8, 1);
    for (let i = 0; i < 2 + g; i++) bloodAt(add(p, d, 15 + Math.random() * 40 * (g * .4 + .6)), 10 + Math.random() * 16, .9);
    if (g >= 5) { for (let i = 0; i < 14; i++) gib(p, 18 * sc, d, [3 + Math.random() * 5, 3 + Math.random() * 5, 3 + Math.random() * 5].map(v => v * sc), Math.random() < .4 ? L.skin : Math.random() < .5 ? L.shirt : 0x7a0a0a, 230); bloodAt(p, 70 * sc, 1); return; }
    if (g >= 3) { if (!(lost & 1) && Math.random() < .6) { gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], L.skin, 160); lost |= 1; } if (!(lost & 2) && Math.random() < .6) { gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], L.skin, 160); lost |= 2; } if (Math.random() < .55) { gib(p, 32 * sc, d, [9 * sc, 9 * sc, 9 * sc], L.skin, 200); lost |= 16; } }
    dying.push({ ...(z || look(1)), p: [...p], d, yaw: z ? z.yaw : Math.atan2(-d[0], -d[1]), ty, lost, t: 0, seed: z?.seed ?? 1, kb: 4 + g * 7 });
  }
  // ===== кровавые следы ног =====
  const feet = {};
  function footsteps(id, p, moving, dt) {
    const f = feet[id] || (feet[id] = { lp: p, d: 0, side: 1, wet: 0 }); const i = gi(p); if (i >= 0 && grid[i] > .25) f.wet = Math.min(1, f.wet + grid[i] * .5);
    const step = dist(p, f.lp); f.d += step;
    if (f.d > 17 && f.wet > .05 && step > 0) { const a = Math.atan2(p[0] - f.lp[0], p[1] - f.lp[1]); f.d = 0; f.side *= -1; decal(add(p, [Math.cos(a) * 3.5 * f.side, -Math.sin(a) * 3.5 * f.side]), 7, 'foot', 0x4e0000, .75 * f.wet, -a + Math.PI, 1.6); f.wet *= .88; }
    f.lp = p;
  }
  // ===== кадр =====
  function update(dt, now, zl) {
    flush();
    for (let i = 0; i < PN; i++) { if (dL[i] <= 0) { drops.setMatrixAt(i, ZERO); continue; }
      dV[i * 3 + 1] -= 520 * dt; dP[i * 3] += dV[i * 3] * dt; dP[i * 3 + 1] += dV[i * 3 + 1] * dt; dP[i * 3 + 2] += dV[i * 3 + 2] * dt;
      if (dP[i * 3 + 1] <= 0) { dL[i] = 0; if (Math.random() < .35) decal([dP[i * 3], dP[i * 3 + 2]], 4 + dS[i] * 3, 'drop', bcol(), .9); drops.setMatrixAt(i, ZERO); continue; }
      drops.setMatrixAt(i, M4.compose(V3.set(dP[i * 3], dP[i * 3 + 1], dP[i * 3 + 2]), Q.identity(), S3.setScalar(dS[i]))); }
    drops.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < GIBN; i++) { const o = gb[i]; if (!o.on) { gibs.setMatrixAt(i, ZERO); continue; }
      o.t += dt; if (o.p[1] > o.s[1] / 2) { o.v[1] -= 500 * dt; for (let k = 0; k < 3; k++) { o.p[k] += o.v[k] * dt; o.r[k] += o.w[k] * dt; } if (Math.random() < .3) spray([o.p[0], o.p[2]], o.p[1], [o.v[0], o.v[2]], 1, 20, 1.2); }
      else { o.p[1] = o.s[1] / 2; o.v[0] *= .8; o.v[2] *= .8; o.w = o.w.map(x => x * .8); o.p[0] += o.v[0] * dt; o.p[2] += o.v[2] * dt; if (o.t > .25 && Math.random() < .2) decal([o.p[0], o.p[2]], 6, 'drop', bcol(), .8); }
      if (o.t > 8) { o.on = 0; decal([o.p[0], o.p[2]], Math.max(o.s[0], o.s[1]) * 1.4, 'b0', 0x3a0a08, .9); }
      gibs.setMatrixAt(i, M4.compose(V3.set(o.p[0], o.p[1], o.p[2]), Q.setFromEuler(E.set(o.r[0], o.r[1], o.r[2])), S3.set(o.s[0], o.s[1], o.s[2]))); }
    gibs.instanceMatrix.needsUpdate = true;
    const all = zl.slice();
    for (let i = dying.length - 1; i >= 0; i--) { const z = dying[i]; z.t += dt;
      if (z.t > 2.4) { decal(add(z.p, z.d, 14 * ZT[z.ty].sc), 34 * ZT[z.ty].sc, 'body', 0x3a1812, .95, -z.yaw + Math.PI); bloodAt(z.p, 26 * ZT[z.ty].sc, .7); dying.splice(i, 1); continue; }
      const k = Math.min(1, z.t / .35); all.push({ ...z, p: add(z.p, z.d, k * 10 + Math.min(1, z.t / .25) * (z.kb || 0)), walk: 0, fl: 0, flash: 0, fall: Math.max(.01, k) }); }
    draw(all, now);
    for (const s of sps) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > u.life) { s.visible = false; continue; } const k = u.t / u.life; s.scale.setScalar(u.s0 + (u.s1 - u.s0) * k); s.material.opacity = 1 - k; s.position.x += u.v[0] * dt; s.position.y += u.v[1] * dt; s.position.z += u.v[2] * dt; }
  }
  function reset() { needClear = true; dying.length = 0; for (const o of gb) o.on = 0; dL.fill(0); for (const k in feet) delete feet[k]; }
  return { update, look, hit, kill, decal, bloodAt, spray, flame, boom, footsteps, reset, wetAt: p => { const i = gi(p); return i < 0 ? 0 : grid[i]; } };
})();
