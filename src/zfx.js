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
  function flame(from, d, end) { for (let i = 0; i < 2; i++) sprite(add(from, d, Math.random() * end), 18, 6, 22, .35, Math.random() < .5 ? 0xff8a20 : 0xffd040, [d[0] * 120, 20, d[1] * 120]); }
  function boom(c, r = 100) { G3.boom(c, r); decal(c, r * 1.2, 'scorch', 0x16100c, .85); spray(c, 10, [1, 0], 30, 160, 2.4); }
  // ===== зомби =====
  const ZN = 400, PART = ['legL', 'legR', 'torso', 'head', 'armL', 'armR', 'eyes', 'jaw', 'stain', 'hair', 'brow', 'nose', 'ears', 'wound'], PG = {
    legL: [new T.BoxGeometry(5.2, 16, 5.4).translate(0, -8, 0), [-3.3, 16, 0]], legR: [new T.BoxGeometry(5.2, 16, 5.4).translate(0, -8, 0), [3.3, 16, 0]],
    torso: [new T.BoxGeometry(13.5, 16, 8.5).translate(0, 8, 0), [0, 15, 0]], head: [new T.BoxGeometry(8.6, 9, 8.6).translate(0, 4.5, 0), [0, 30, 2]],
    armL: [new T.BoxGeometry(4.2, 15, 4.2).translate(0, -7, 0), [-8.8, 29, 0]], armR: [new T.BoxGeometry(4.2, 15, 4.2).translate(0, -7, 0), [8.8, 29, 0]],
    eyes: [new T.BoxGeometry(7.4, 2.2, .8).translate(0, 5.4, 4.8), [0, 30, 2]], stain: [new T.BoxGeometry(9, 8, .8).translate(1, 7, 4.4), [0, 15, 0]], jaw: [new T.BoxGeometry(7, 2.6, 2).translate(0, 1.2, 4.4), [0, 30, 2]],
    hair: [new T.BoxGeometry(9.2, 2.4, 9.4).translate(0, 9.4, -.5), [0, 30, 2]], brow: [new T.BoxGeometry(8.2, 1.5, 1.6).translate(0, 7.1, 4.5), [0, 30, 2]], nose: [new T.BoxGeometry(1.6, 2.4, 1.6).translate(0, 4, 5), [0, 30, 2]],
    ears: [new T.BoxGeometry(10.4, 3, 1.8).translate(0, 4.8, 0), [0, 30, 2]], wound: [new T.BoxGeometry(.7, 3.6, 3.8).translate(4.4, 5.4, 1), [0, 30, 2]] }; // голова: волосы клочьями, надбровья, нос, уши, рана
  const ZM = {}; for (const k of PART) { const m = new T.InstancedMesh(PG[k][0], k === 'eyes' ? new T.MeshBasicMaterial({ color: 0xffffff }) : MAT(0xffffff), ZN); m.frustumCulled = false; m.castShadow = k === 'torso'; m.setColorAt(0, new T.Color()); m.count = 0; scene.add(m); ZM[k] = m; }
  const zShadow = new T.InstancedMesh(new T.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28, depthWrite: false }), ZN); zShadow.frustumCulled = false; scene.add(zShadow);
  const base = new T.Matrix4(), loc = new T.Matrix4(), tmp = new T.Matrix4(), C = new T.Color(), WHITE = new T.Color(1, 1, 1), FIRE = new T.Color(1, .45, .1), ICE = new T.Color(.6, .85, 1);
  const HAIR = [0x2a1e16, 0x4a3424, 0x1a1a1a, 0x6a5a40, 0x8a8a84, 0x5a2a14];
  // одежда — как у горожан, только грязная и в крови
  const SHIRT = [0x6a2c2c, 0x2c4468, 0x46602e, 0x5e523a, 0x523a5e, 0x7e735a, 0x2c2c2c, 0x6a5020, 0x385252, 0x8a8478], PANTS = [0x23283a, 0x3a2e20, 0x2c3a48, 0x1e1e1e, 0x46382a], SKIN = [0x5d7350, 0x67765a, 0x536649, 0x6f7058, 0x5f6a55, 0x77806a];
  const SPEC = { 2: [0x6a5a48, 0x3a3020], 4: [0x2f2f36, 0x22222a], 5: [0x3a1a1a, 0x201010] }; // толстяк, громила, босс — своя одежда
  function look(id, ty) { const h = n => ((id * 9301 + n * 49297) % 233280) / 233280; const sp = SPEC[ty]; return { skin: SKIN[Math.floor(h(1) * SKIN.length)], shirt: sp ? sp[0] : SHIRT[Math.floor(h(2) * SHIRT.length)], pants: sp ? sp[1] : PANTS[Math.floor(h(3) * PANTS.length)], seed: h(4) * 6, hair: HAIR[Math.floor(h(5) * HAIR.length)], bald: h(6) < .3 || ty === 4, wnd: h(7) < .55 }; }
  // Бегун: округлый костюм и маска, два пакета инстансов на всех налётчиков.
  const RAIDER = 1, STANDARD_BEARER = 2;
  const raiderGeo = new T.SphereGeometry(1, 8, 6);
  const suit = new T.InstancedMesh(raiderGeo, new T.MeshPhongMaterial({
    color: 0xffffff, emissive: 0x252130, specular: 0x515669, shininess: 30
  }), ZN * 11);
  const raiderMarks = new T.InstancedMesh(raiderGeo, new T.MeshBasicMaterial({ color: 0xffffff }), ZN * 2);
  for (const mesh of [suit, raiderMarks]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.setColorAt(0, WHITE);
    scene.add(mesh);
  }
  const limb = new T.Vector3(), limbUp = new T.Vector3(0, 1, 0);
  let suitCount = 0, markCount = 0;
  function enemyPart(mesh, i, color, x, y, z, sx, sy, sz, rx = 0) {
    loc.compose(V3.set(x, y, z), Q.setFromEuler(E.set(rx, 0, 0)), S3.set(sx, sy, sz));
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
  function drawRaider(z, sc, t) {
    const fall = z.fall || 0, noLegs = z.lost & 4, phase = z.walk / (Math.PI * 2);
    const air = z.fl & 4 ? 10 * Math.abs(Math.sin(t * 6)) : 0;
    const lunge = z.fl & 1 ? .5 + .5 * Math.sin(t * 16) : 0;
    const height = noLegs ? 9 : 19 + Math.cos(z.walk * 2) * .8 - lunge * 2;
    const recoil = (z.kick || 0) * .2;
    base.compose(V3.set(z.p[0], air, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.setScalar(sc));
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
      enemyPart(suit, suitCount++, enemyColor(0x625770, z, t), 0, height + 1, headZ, 4.8, 5.8, 5.4, recoil);
      enemyPart(raiderMarks, markCount++, enemyColor(0xf2af68, z, t), 0, height + 2.5, headZ + 4.7, 3.9, 1.35, 1.2);
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
        const jointZ = front ? 11 : -10, endZ = jointZ + stride * 12 + (front ? 3 : -1);
        const endY = fall ? height - 4 : 2 + lift;
        const jointY = height - (front ? 1 : 2);
        const bendY = (jointY + endY) / 2 + (front ? 2 : 5);
        const bendZ = (jointZ + endZ) / 2 + (front ? -4 : 6);
        raiderLimb(side * 6, jointY, jointZ, bendY, bendZ, front ? 2.7 : 3.1);
        raiderLimb(side * 6, bendY, bendZ, endY, endZ, 2.3);
      }
    }
  }
  // Двустороннее знамя с вымышленной эмблемой. Складки заданы в общей геометрии.
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 64;
  bannerCanvas.height = 48;
  const bannerInk = bannerCanvas.getContext('2d');
  bannerInk.fillStyle = '#9d243a';
  bannerInk.fillRect(0, 0, 64, 48);
  bannerInk.fillStyle = '#edcf8c';
  bannerInk.fillRect(2, 3, 60, 3);
  bannerInk.fillRect(2, 42, 60, 3);
  bannerInk.beginPath();
  bannerInk.moveTo(32, 10);
  bannerInk.lineTo(47, 24);
  bannerInk.lineTo(32, 38);
  bannerInk.lineTo(17, 24);
  bannerInk.closePath();
  bannerInk.fill();
  bannerInk.fillStyle = '#492536';
  bannerInk.fillRect(28, 17, 8, 14);
  const bannerGeo = new T.PlaneGeometry(1, 1, 6, 1);
  const bannerVertices = bannerGeo.attributes.position;
  for (let i = 0; i < bannerVertices.count; i++) {
    const x = bannerVertices.getX(i) + .5;
    bannerVertices.setXYZ(i, x, bannerVertices.getY(i) - .1 * x, Math.sin(x * 9) * .09 * x);
  }
  const banners = new T.InstancedMesh(bannerGeo, new T.MeshBasicMaterial({
    map: new T.CanvasTexture(bannerCanvas), side: T.DoubleSide
  }), ZN);
  banners.count = 0;
  banners.frustumCulled = false;
  banners.setColorAt(0, WHITE);
  scene.add(banners);
  let bannerCount = 0;
  const bannerPivot = new T.Matrix4();
  function drawStandardBearer(z, sc, t, fall) {
    const crawl = z.lost & 4, stride = Math.sin(z.walk * .7);
    const attack = z.fl & 1 ? .5 + .5 * Math.sin(t * 12) : 0;
    const lean = .07 + attack * .23 - (z.kick || 0) * .35;
    const bob = Math.abs(stride) * 1.2;
    base.compose(V3.set(z.p[0], 0, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.setScalar(sc));
    if (fall) base.multiply(tmp.makeRotationX(-fall * 1.45));
    else if (crawl) base.multiply(tmp.makeRotationX(1.33)).multiply(tmp.makeTranslation(0, -19, -8));

    enemyPart(suit, suitCount++, enemyColor(0x713343, z, t), 0, 22 + bob, 0, 10, 13, 7, lean);
    enemyPart(suit, suitCount++, enemyColor(0x8a3b52, z, t), 0, 24 + bob, -5.5, 11, 15, 4.8, lean - .13);
    enemyPart(raiderMarks, markCount++, enemyColor(0xb8734d, z, t), 0, 29 + bob, 2, 11, 3, 6, lean);
    if (!(z.lost & 16)) {
      enemyPart(suit, suitCount++, enemyColor(0xbb8970, z, t), 0, 36 + bob, 2, 4.8, 5.4, 4.5, lean);
      enemyPart(suit, suitCount++, enemyColor(0x513241, z, t), 0, 38 + bob, .2, 5.3, 4.4, 4.8, lean);
      enemyPart(suit, suitCount++, enemyColor(0x513241, z, t), 0, 40 + bob, -3.5, 3.1, 2.8, 3.1);
    }
    if (!crawl) {
      enemyPart(suit, suitCount++, enemyColor(0x4b3540, z, t), -4.4, 8 + Math.max(0, stride) * 3, stride * 5, 3.8, 9, 3.8, stride * .22);
      enemyPart(suit, suitCount++, enemyColor(0x4b3540, z, t), 4.4, 8 + Math.max(0, -stride) * 3, -stride * 5, 3.8, 9, 3.8, -stride * .22);
    }
    if (!(z.lost & 1)) enemyPart(suit, suitCount++, enemyColor(0x843952, z, t), -10, 23 + bob, 3 + attack * 5, 3.3, 8, 3.4, -stride * .24 - attack * .8);
    if (!(z.lost & 2)) {
      enemyPart(suit, suitCount++, enemyColor(0x843952, z, t), 10, 25 + bob, 6, 3.3, 7.5, 3.4, -.65);
      // Древко и ткань вращаются вместе вокруг руки.
      bannerPivot.makeTranslation(11, 23 + bob, 9);
      bannerPivot.multiply(tmp.makeRotationX(.14 + attack * .5));
      bannerPivot.multiply(tmp.makeRotationZ(-.13 + stride * .08 + fall * .6));
      base.multiply(bannerPivot);
      enemyPart(suit, suitCount++, enemyColor(0x8e614a, z, t), 0, 9, 0, 1.05, 23, 1.05);
      enemyPart(banners, bannerCount++, enemyColor(0xffffff, z, t), 0, 23, 0, 21, 15, 14);
    }
  }
  function draw(list, now) {
    let n = 0, shadowCount = 0; const t = now / 1000;
    suitCount = markCount = bannerCount = 0;
    for (const z of list) {
      if (shadowCount >= ZN) break; const Tz = ZT[z.ty], sc = Tz.sc, crawl = z.lost & 4, ph = z.walk, sw = Math.sin(ph), att = z.fl & 1, air = z.fl & 4 ? 1 : 0, fall = z.fall || 0;
      zShadow.setMatrixAt(shadowCount++, M4.compose(V3.set(z.p[0], .6, z.p[1]),
        Q.setFromEuler(E.set(0, z.ty === RAIDER ? z.yaw : 0, 0)),
        S3.set(Tz.r * 1.1, 1, Tz.r * (z.ty === RAIDER ? 2 : 1.1))));
      if (z.ty === RAIDER) { drawRaider(z, sc, t); continue; }
      if (z.ty === STANDARD_BEARER) { drawStandardBearer(z, sc, t, fall); continue; }
      base.compose(V3.set(z.p[0], (crawl ? 2 : 0) + air * 10 * Math.abs(Math.sin(t * 6)), z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.set(sc, sc, sc));
      if (fall) base.multiply(tmp.makeRotationX(-(1 - Math.pow(1 - fall, 3)) * 1.5));
      else if (crawl) base.multiply(tmp.makeRotationX(1.35)).multiply(tmp.makeTranslation(0, -14, -8));
      const flash = Math.max(0, z.flash || 0), burn = z.fl & 2;
      for (const k of PART) {
        const m = ZM[k], j = PG[k][1]; let rx = 0, rz = 0, hide = false;
        if (k === 'legL' || k === 'legR') { rx = (k === 'legL' ? sw : -sw) * .6 * (crawl ? .2 : 1) * (fall ? 0 : 1) + (fall ? .3 * fall : 0); hide = crawl; }
        else if (k === 'armL') { rx = fall ? -1.2 - fall : -1.45 + (att ? Math.sin(t * 14) * .5 : Math.sin(ph * .5) * .12) + air * -.4; rz = -.1; hide = z.lost & 1; }
        else if (k === 'armR') { rx = fall ? -1.4 - fall : -1.45 + (att ? Math.cos(t * 14) * .5 : Math.cos(ph * .5) * .12) + air * -.4; rz = .1; hide = z.lost & 2; }
        else if (k === 'torso' || k === 'stain') { rx = .3 + (att ? .15 : 0) + ZT[z.ty].sc * .03 - (z.kick || 0) * .6; rz = Math.sin(ph * .5) * .08; }
        else { rx = .25 - (z.kick || 0) * .7 + (att && k === 'jaw' ? Math.abs(Math.sin(t * 12)) * .4 : 0); rz = Math.sin(t * 2 + (z.seed || 0)) * .25; hide = (z.lost & 16) || (k === 'hair' && z.bald) || (k === 'wound' && !z.wnd); }
        if (hide) loc.copy(ZERO); else { loc.makeTranslation(j[0], j[1], j[2]); loc.multiply(tmp.makeRotationFromEuler(E.set(rx, 0, rz))); }
        m.setMatrixAt(n, tmp.multiplyMatrices(base, loc));
        if (k === 'eyes') C.setHex(z.ty === 5 ? 0xff2020 : z.ty === 4 ? 0xff6a20 : 0xffe060); else if (k === 'stain' || k === 'wound') C.setHex(k === 'wound' ? 0x6a0808 : 0x4a0606); else if (k === 'hair') C.setHex(z.hair || 0x2a1e16); else if (k === 'brow' || k === 'nose' || k === 'ears') { C.setHex(z.skin); C.multiplyScalar(k === 'brow' ? .62 : .88); } else C.setHex(k === 'head' || k === 'armL' || k === 'armR' || k === 'jaw' ? (k === 'jaw' ? 0x3a0c0c : z.skin) : k === 'torso' ? z.shirt : z.pants);
        if (burn) C.lerp(FIRE, .35 + .2 * Math.sin(t * 20 + (z.seed || 0))); if (z.fl & 8 && k !== 'eyes') C.lerp(ICE, .6); if (flash > 0) C.lerp(WHITE, flash); if (fall > .8 && k !== 'eyes') C.multiplyScalar(.85);
        m.setColorAt(n, C);
      }
      n++;
    }
    for (const k of PART) { ZM[k].count = n; ZM[k].instanceMatrix.needsUpdate = true; if (ZM[k].instanceColor) ZM[k].instanceColor.needsUpdate = true; }
    zShadow.count = shadowCount; zShadow.instanceMatrix.needsUpdate = true;
    suit.count = suitCount;
    raiderMarks.count = markCount;
    banners.count = bannerCount;
    for (const mesh of [suit, raiderMarks, banners]) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }
  // ===== попадание и смерть =====
  function hit(p, d, gore, z) { spray(p, 20, d, 4 + gore * 3, 90 + gore * 40); if (Math.random() < .5) bloodAt(add(p, d, 12 + Math.random() * 20), 14 + gore * 5, .8); if (z) z.flash = .9; }
  const dying = [];
  function kill(p, d, g, ty, lost, z) {
    const sc = ZT[ty].sc;
    const L = ty === RAIDER ? { skin: 0x625770, shirt: 0x625472 } : ty === STANDARD_BEARER ? { skin: 0xbb8970, shirt: 0x713343 } : z || look(Math.floor(Math.random() * 999), ty);
    spray(p, 20 * sc, d, 10 + g * 10, 120 + g * 50, 1.6 + g * .3); bloodAt(p, 30 * sc + g * 8, 1);
    for (let i = 0; i < 2 + g; i++) bloodAt(add(p, d, 15 + Math.random() * 40 * (g * .4 + .6)), 10 + Math.random() * 16, .9);
    if (g >= 5) { for (let i = 0; i < 14; i++) gib(p, 18 * sc, d, [3 + Math.random() * 5, 3 + Math.random() * 5, 3 + Math.random() * 5].map(v => v * sc), Math.random() < .4 ? L.skin : Math.random() < .5 ? L.shirt : 0x7a0a0a, 230); bloodAt(p, 70 * sc, 1); return; }
    if (g >= 3) { if (!(lost & 1) && Math.random() < .6) { gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], L.skin, 160); lost |= 1; } if (!(lost & 2) && Math.random() < .6) { gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], L.skin, 160); lost |= 2; } if (Math.random() < .55) { gib(p, 32 * sc, d, [9 * sc, 9 * sc, 9 * sc], L.skin, 200); lost |= 16; } }
    dying.push({ p: [...p], d, yaw: z ? z.yaw : Math.atan2(-d[0], -d[1]), ty, lost, t: 0, skin: L.skin, shirt: L.shirt, pants: L.pants, hair: L.hair, bald: L.bald, wnd: L.wnd, seed: 1, kb: 4 + g * 7 });
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
      const k = Math.min(1, z.t / .35); all.push({ p: add(z.p, z.d, k * 10 + Math.min(1, z.t / .25) * (z.kb || 0)), ty: z.ty, lost: z.lost, yaw: z.yaw, walk: 0, fl: 0, skin: z.skin, shirt: z.shirt, pants: z.pants, hair: z.hair, bald: z.bald, wnd: z.wnd, seed: 1, flash: 0, fall: Math.max(.01, k) }); }
    draw(all, now);
    for (const s of sps) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > u.life) { s.visible = false; continue; } const k = u.t / u.life; s.scale.setScalar(u.s0 + (u.s1 - u.s0) * k); s.material.opacity = 1 - k; s.position.x += u.v[0] * dt; s.position.y += u.v[1] * dt; s.position.z += u.v[2] * dt; }
  }
  function reset() { needClear = true; dying.length = 0; for (const o of gb) o.on = 0; dL.fill(0); for (const k in feet) delete feet[k]; }
  return { update, look, hit, kill, decal, bloodAt, spray, flame, boom, footsteps, reset, wetAt: p => { const i = gi(p); return i < 0 ? 0 : grid[i]; } };
})();
