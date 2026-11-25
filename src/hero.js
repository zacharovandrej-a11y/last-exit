// ===== LAST EXIT — игровые герои: цельное тело MakeHuman (CC0) на суставах игрового скелета (Claude) =====
// Тело то же, что у громилы и налётчиков, но обычных пропорций; у женщин уже плечи и талия, шире бёдра, грудь.
// Модель переставлена в позу «руки и ноги вниз» и привязана к суставам игровой фигуры (body, head, armL/R, elL/R,
// legL/R, kneeL/R), поэтому вся прежняя анимация — шаг, бег, прицел, отдача, смерть, ползание — работает как была.
// Одежда рисуется шейдером по исходным координатам модели; волосы, каска, борода, покрывало, ряса, крест, разгрузка —
// геометрия на тех же костях: один SkinnedMesh — один вызов отрисовки на героя.
const HeroBody = (() => {
  // вид: k — набор одежды в шейдере; fem — женская фигура; skin/hair/a/b/c — цвета кожи, волос, верха, низа, акцента
  const LOOK = {
    0: { k: 0, skin: 0xc8977a, hair: 0x3a2c22, a: 0x5a6142, b: 0x4e5538, c: 0x3a3a2c },
    10: { k: 1, fem: 1, skin: 0xd8b29a, hair: 0x1e1614, a: 0x4f6670, b: 0x2e3846, c: 0x8a8478 },
    11: { k: 2, skin: 0xc8a088, hair: 0x6c645c, a: 0x17161a, b: 0x1c1b20, c: 0xd2ad5e, robe: 1, wide: 1 },
    12: { k: 3, fem: 1, skin: 0xd6b29c, hair: 0x2a2420, a: 0x18191d, b: 0x1c1d22, c: 0xe8e4da, robe: 1 },
    13: { k: 4, fem: 1, old: 1, skin: 0xcda088, hair: 0xb8b0a4, a: 0x8a6448, b: 0x3a3236, c: 0xa8423a, robe: 2 },
    14: { k: 5, skin: 0xbf9070, hair: 0x2a1e16, a: 0xece6d8, b: 0x3c5a86, c: 0xb0302c, wide: 1 },
    15: { k: 6, skin: 0xd6ab8e, hair: 0x5a3a28, a: 0x7a2a34, b: 0x2c3038, c: 0xe8e2d4 },
    16: { k: 7, skin: 0xc49478, hair: 0x3c2c24, a: 0x3e5e80, b: 0x3a5878, c: 0x6a5240, wide: 1 },
  };
  const cache = new Map();
  function loop(P, O, I, J, W) {
    const n = P.length / 3, E = new Map(), nb = Array.from({ length: n }, () => new Set());
    const key = (a, b) => a < b ? a * n + b : b * n + a;
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], c = I[t + (e + 2) % 3], k = key(a, b);
      nb[a].add(b); nb[b].add(a); const r = E.get(k); if (r) r.o.push(c); else E.set(k, { a, b, o: [c], i: -1 }); }
    const NP = [], NO = [], NJ = [], NW = [];
    for (let v = 0; v < n; v++) { const k = nb[v].size, be = k > 3 ? 3 / (8 * k) : 3 / 16; for (const [src, dst] of [[P, NP], [O, NO]]) { let x = src[v * 3] * (1 - k * be), y = src[v * 3 + 1] * (1 - k * be), z = src[v * 3 + 2] * (1 - k * be); for (const u of nb[v]) { x += src[u * 3] * be; y += src[u * 3 + 1] * be; z += src[u * 3 + 2] * be; } dst.push(x, y, z); }
      for (let j = 0; j < 4; j++) { NJ.push(J[v * 4 + j]); NW.push(W[v * 4 + j]); } }
    for (const e of E.values()) { e.i = NP.length / 3; const { a, b, o } = e;
      for (const [src, dst] of [[P, NP], [O, NO]]) for (let d = 0; d < 3; d++) dst.push(o.length === 2 ? (src[a * 3 + d] + src[b * 3 + d]) * .375 + (src[o[0] * 3 + d] + src[o[1] * 3 + d]) * .125 : (src[a * 3 + d] + src[b * 3 + d]) * .5);
      const m = new Map(); for (const v of [a, b]) for (let j = 0; j < 4; j++) { const w = W[v * 4 + j]; if (w > 0) m.set(J[v * 4 + j], (m.get(J[v * 4 + j]) || 0) + w * .5); }
      const top = [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4), s = top.reduce((x, y) => x + y[1], 0);
      for (let j = 0; j < 4; j++) { NJ.push(top[j] ? top[j][0] : 0); NW.push(top[j] ? top[j][1] / s : 0); } }
    const NI = []; for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]], ab = E.get(key(a, b)).i, bc = E.get(key(b, c)).i, ca = E.get(key(c, a)).i; NI.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
    return [NP, NO, NI, NJ, NW];
  }
  const RIGMAP = [0, 0, 0, 1, 2, 3, 3, 6, 7, 7, 4, 5, 5, 8, 9, 9]; // кость модели → сустав фигуры (0 body, 1 head, 2/3 правая рука, 4/5 левая, 6/7 правая нога, 8/9 левая)
  function build(T, data, id) {
    const L_ = LOOK[id], fem = !!L_.fem, V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
    const K = fem ? (L_.old ? .955 : .985) : 1.03, Y0 = 24.45, S = (x, y, z) => V(x * K, (y + Y0) * K, z * K);
    // ---------- 1) фигура: у женщин плечи уже и покатые, талия тоньше, бёдра шире; у бабушки сутулость; у «широких» живот ----------
    const armShift = fem ? -.5 : L_.wide ? .2 : 0, shiftOf = b => { const k = b >= 10 ? b - 6 : b; return k >= 4 && k <= 6 ? (b >= 10 ? -armShift : armShift) : 0; };
    const MB = data.bones.map(([a, b], i) => { const s = shiftOf(i); return [V(a[0] + s, a[1], a[2]), V(b[0] + s, b[1], b[2])]; });
    const P0 = data.positions, n0 = P0.length / 3, J0 = data.joints, W0 = data.weights, bump = (x, c, w) => Math.max(0, 1 - ((x - c) / w) ** 2);
    const P = new Float32Array(P0.length);
    for (let v = 0; v < n0; v++) {
      const ox = P0[v * 3], oy = P0[v * 3 + 1], oz = P0[v * 3 + 2], ax = Math.abs(ox); let sx = 0, tor = 0;
      for (let k = 0; k < 4; k++) { const b = J0[v * 4 + k], w = W0[v * 4 + k]; sx += w * shiftOf(b); if (b <= 2) tor += w; }
      let x = ox + sx, y = oy, z = oz;
      if (fem) {
        x *= 1 - .13 * bump(oy, 7.4, 3.4) * tor - .06 * bump(oy, 15, 2.6) * tor + .11 * bump(oy, .6, 3.6);
        if (oz > .6) z += 1.1 * bump(oy, 12.3, 2.6) * bump(ax, 2.2, 2.3) * tor;
        if (oz < 0) z -= .45 * bump(oy, -.5, 3);
        y -= .45 * bump(ax, 4.6, 1.8) * bump(oy, 16.2, 1.6);
        if (oy > 17.7 && oy < 20.6) x *= .94; // лицо уже, подбородок мягче
      }
      if (L_.old) { if (oy > 16.5) z += .9 * Math.min(1, (oy - 16.5) / 3); if (oz < .2) z -= .7 * bump(oy, 14.5, 3.5); if (oz > 0) z += .6 * bump(oy, 6, 3) * tor; }
      if (L_.wide) { if (oz > .4) z += (id === 11 ? 1.5 : .7) * bump(oy, 6.6, 3.4) * tor; x *= 1 + .05 * bump(oy, 6.6, 3.4) * tor; }
      P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    }
    let I = Array.from(data.indices), Jn = Array.from(J0), Wn = Array.from(W0), NP, NO;
    // под одеждой грудь гладкая: сглаживаем рельеф (соски и мышцы) спереди на груди
    { const nb = Array.from({ length: n0 }, () => new Set()); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
      for (let it = 0; it < 3; it++) { const Q = Float32Array.from(P); for (let v = 0; v < n0; v++) { const oy = P0[v * 3 + 1], oz = P0[v * 3 + 2]; if (oy < 9.5 || oy > 15.5 || oz < 1.2 || Math.abs(P0[v * 3]) > 6) continue; let x = 0, y = 0, z = 0; for (const u of nb[v]) { x += Q[u * 3]; y += Q[u * 3 + 1]; z += Q[u * 3 + 2]; } const k = nb[v].size; P[v * 3] = Q[v * 3] * .4 + x / k * .6; P[v * 3 + 1] = Q[v * 3 + 1] * .4 + y / k * .6; P[v * 3 + 2] = Q[v * 3 + 2] * .4 + z / k * .6; } } }
    // ---------- 2) подразделение Loop: гладкое тело ----------
    [NP, NO, I, Jn, Wn] = loop(P, Float32Array.from(P0), I, Jn, Wn);
    // ---------- 3) поза «руки и ноги вниз» под суставы фигуры ----------
    const front = V(0, 0, 1), down = V(0, -1, 0), _x = V(), _y = V(), _z = V();
    const frame = (a, b, ref, sc = 1) => { _y.subVectors(b, a).normalize(); _z.copy(ref).addScaledVector(_y, -ref.dot(_y)).normalize(); _x.crossVectors(_y, _z); return new T.Matrix4().makeBasis(_x, _y.clone().multiplyScalar(sc), _z).setPosition(a); };
    const SA = MB.map(([a]) => S(a.x, a.y, a.z)), SB = MB.map(([, b]) => S(b.x, b.y, b.z)), len = SA.map((a, i) => a.distanceTo(SB[i]));
    const TA = SA.map(a => a.clone()), TB = SB.map(b => b.clone());
    for (const o of [0, 6]) { // руки: плечо на месте, плечо и предплечье отвесно, кисть чуть вперёд
      const A = SA[4 + o], E = A.clone().add(V(0, -len[4 + o], -.2)), W = E.clone().add(V(0, -len[5 + o], .35));
      TA[4 + o] = A; TB[4 + o] = E; TA[5 + o] = E; TB[5 + o] = W; TA[6 + o] = W; TB[6 + o] = W.clone().add(V(0, -len[6 + o], .45));
      const H = SA[7 + o], Kn = H.clone().add(V(0, -len[7 + o], .25)), An = Kn.clone().add(V(0, -len[8 + o], -.25));
      TA[7 + o] = H; TB[7 + o] = Kn; TA[8 + o] = Kn; TB[8 + o] = An; TA[9 + o] = An; TB[9 + o] = An.clone().add(SB[9 + o].clone().sub(SA[9 + o])); }
    const ref = i => i === 9 || i === 15 ? down : front;
    const M = MB.map((_, i) => frame(TA[i], TB[i], ref(i), TA[i].distanceTo(TB[i]) / Math.max(1e-4, len[i])).multiply(frame(SA[i], SB[i], ref(i)).invert()));
    const nv = NP.length / 3, POS = [], ORIG = [], SKI = [], SKW = [], RG = [], MAT = [], p_ = V(), acc = V();
    for (let v = 0; v < nv; v++) {
      const s = S(NP[v * 3], NP[v * 3 + 1], NP[v * 3 + 2]); acc.set(0, 0, 0); let ws = 0; const rw = new Map(), rg = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) { const b = Jn[v * 4 + k], w = Wn[v * 4 + k]; if (w <= 0) continue; acc.addScaledVector(p_.copy(s).applyMatrix4(M[b]), w); ws += w;
        rw.set(RIGMAP[b], (rw.get(RIGMAP[b]) || 0) + w); const kk = b >= 10 ? b - 6 : b; if (kk === 3) rg[0] += w; else if (kk === 4 || kk === 5) rg[1] += w; else if (kk === 6) rg[2] += w; else if (kk === 9) rg[3] += w; }
      acc.multiplyScalar(1 / Math.max(ws, 1e-4)); POS.push(acc.x, acc.y, acc.z); ORIG.push(NO[v * 3], NO[v * 3 + 1], NO[v * 3 + 2]); RG.push(...rg); MAT.push(0);
      const top = [...rw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((m, e) => m + e[1], 0);
      for (let k = 0; k < 4; k++) { SKI.push(top[k] ? top[k][0] : 0); SKW.push(top[k] ? top[k][1] / sum : 0); } }
    // суставы фигуры для этого тела
    const J = { shR: TA[4], elR: TB[4], wrR: TB[5], shL: TA[10], elL: TB[10], wrL: TB[11], hipR: TA[7], knR: TB[7], hipL: TA[13], knL: TB[13], neck: SA[3] };
    const restOf = [V(), J.neck, J.shR, J.elR, J.shL, J.elL, J.hipR, J.knR, J.hipL, J.knL];
    // точка на поверхности тела рядом с (x, y) в координатах исходной модели, самая выступающая в сторону dir
    const surf = (x, y, dir = 1, r = .9) => { let best = -1e9, bi = -1; for (let v = 0; v < nv; v++) { const ox = ORIG[v * 3], oy = ORIG[v * 3 + 1]; if (Math.abs(ox - x) > r || Math.abs(oy - y) > r || RG[v * 4 + 1] > .3) continue; const z = POS[v * 3 + 2] * dir; if (z > best) { best = z; bi = v; } } return bi < 0 ? S(x, y, 0) : V(POS[bi * 3], POS[bi * 3 + 1], POS[bi * 3 + 2]); };
    // ---------- 4) одежда и вещи: геометрия на суставах ----------
    const add = (geo, m, bone, mat, w2) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const p = g.attributes.position, base = POS.length / 3;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); POS.push(x, y, z); ORIG.push(x / K, y / K - Y0, z / K); RG.push(0, 0, 0, 0); MAT.push(mat);
        const ws = w2 ? w2(x, y, z) : [[bone, 1]]; for (let k = 0; k < 4; k++) { SKI.push(ws[k] ? ws[k][0] : 0); SKW.push(ws[k] ? ws[k][1] : 0); } I.push(base + i); } };
    const Lm = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V(sx, sy, sz));
    const at = (q, sx, sy, sz, rx = 0, ry = 0, rz = 0) => Lm(q.x, q.y, q.z, sx * K, sy * K, sz * K, rx, ry, rz); // q — уже в координатах фигуры
    const H = (x, y, z) => S(x, y, z); // точка головы/тела в исходных координатах → фигура
    const Sph = (s = 20, t = 14, tl = Math.PI) => new T.SphereGeometry(1, s, t, 0, Math.PI * 2, 0, tl), Bx = (x, y, z) => new T.BoxGeometry(x, y, z), Cy = (rt, rb, h, s = 16, open = false) => new T.CylinderGeometry(rt, rb, h, s, 1, open);
    const RB = (x, y, z, r = .35) => { const g = new T.BoxGeometry(x, y, z, 3, 3, 3), p = g.attributes.position, hx = x / 2 - r, hy = y / 2 - r, hz = z / 2 - r; for (let i = 0; i < p.count; i++) { const v = V(p.getX(i), p.getY(i), p.getZ(i)), c = V(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z))), d = v.sub(c); if (d.length() > 1e-5) d.setLength(r); p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z); } g.computeVertexNormals(); return g; }; // скруглённый ящик
    const k = L_.k;
    // кисти сжаты в кулак (держат оружие): пальцы подгибаются к ладони
    for (const [side, o] of [[1, 0], [-1, 6]]) { const Wr = TA[6 + o], ax_ = TB[6 + o].clone().sub(Wr).normalize(), L6 = len[6 + o];
      for (let v = 0; v < nv; v++) { if (RG[v * 4 + 1] + RG[v * 4 + 2] < .5 || POS[v * 3] * side < 0) continue; const d = V(POS[v * 3], POS[v * 3 + 1], POS[v * 3 + 2]).sub(Wr), t = d.dot(ax_); if (t < .3 * L6 || d.clone().addScaledVector(ax_, -t).length() > 5) continue; // пальцы весят и на предплечье
        const F = Wr.clone().addScaledVector(ax_, .55 * L6).add(V(-side * .35, 0, .15)), q = V(POS[v * 3], POS[v * 3 + 1], POS[v * 3 + 2]), k = Math.min(1, (t - .35 * L6) / (.3 * L6)) * RG[v * 4 + 2];
        q.lerp(F.clone().add(q.clone().sub(F).multiplyScalar(.24)), k); POS[v * 3] = q.x; POS[v * 3 + 1] = q.y; POS[v * 3 + 2] = q.z; } }
    // обувь: цельная оболочка вместо стопы с пальцами + подошва (на голени — стопа в фигуре не гнётся отдельно)
    for (const side of [1, -1]) { const mn = V(1e9, 1e9, 1e9), mx = V(-1e9, -1e9, -1e9), ids = [];
      for (let v = 0; v < nv; v++) if (RG[v * 4 + 3] > .45 && POS[v * 3] * side > 0) { ids.push(v); mn.min(V(POS[v * 3], POS[v * 3 + 1], POS[v * 3 + 2])); mx.max(V(POS[v * 3], POS[v * 3 + 1], POS[v * 3 + 2])); }
      if (!ids.length) continue; const c = mn.clone().add(mx).multiplyScalar(.5), h = mx.clone().sub(mn).multiplyScalar(.5);
      for (const v of ids) for (let d = 0; d < 3; d++) POS[v * 3 + d] = c.getComponent(d) + (POS[v * 3 + d] - c.getComponent(d)) * .62;
      const shell = new T.SphereGeometry(1, 18, 12), sp = shell.attributes.position; for (let i = 0; i < sp.count; i++) { let y = sp.getY(i); if (y < -.55) y = -.55; sp.setY(i, y); sp.setZ(i, sp.getZ(i) * (sp.getZ(i) > 0 ? 1.05 : .92)); }
      const kb = side > 0 ? 7 : 9; add(shell, Lm(c.x, c.y + h.y * .2, c.z + .1, h.x * 1.08, h.y * 1.22, h.z * 1.02), kb, 16);
      add(new T.CylinderGeometry(1, 1, 1, 18), Lm(c.x, mn.y + .25, c.z + .15, h.x * 1.1, .5, h.z * 1.05), kb, 17); }
    if (L_.robe) { // юбка рясы / облачения / юбка бабушки: края идут за бёдрами
      const yT = S(0, 4.4, 0).y, yB = L_.robe === 2 ? S(0, -14, 0).y : S(0, -21.6, 0).y, rT = (L_.wide ? 5.9 : 5.3) * K, rB = (L_.robe === 2 ? 7.4 : L_.wide ? 9.6 : 8.6) * K, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new T.Vector2(rT + (rB - rT) * Math.pow(t, .8) + Math.sin(t * Math.PI) * .25, yT - (yT - yB) * t)); }
      const lathe = new T.LatheGeometry(pts.reverse(), 36); lathe.scale(1, 1, .84); lathe.translate(0, 0, .2);
      add(lathe, new T.Matrix4(), 0, 13, (x, y) => { const t = Math.max(0, Math.min(1, (yT - y) / (yT - yB))), s = Math.max(-1, Math.min(1, x / (rT + 1))), wl = Math.min(.85, Math.abs(s) * t * 1.1); return wl < .02 ? [[0, 1]] : [[0, 1 - wl], [s > 0 ? 6 : 8, wl]]; }); }
    const headC = H(0, 22.4, 1.55); // центр черепа
    if (k === 0) { // военный: каска с ремешком, плитник с подсумками, рюкзак
      add(Sph(24, 12, Math.PI * .54), Lm(0, headC.y + .4 * K, headC.z - .1, 3.25 * K, 3.2 * K, 3.6 * K, -.06), 1, 1);
      add(new T.TorusGeometry(1, .07, 6, 32), Lm(0, headC.y + .05 * K, headC.z - .1, 3.3 * K, 3.65 * K, 1, Math.PI / 2 - .06), 1, 1);
      add(Bx(1.6, .7, .6), Lm(0, H(0, 24.2, 0).y, H(0, 0, 4.95).z, K, K, K, -.5), 1, 12); // крепление под ПНВ
      const cf = surf(0, 11.4, 1), cb = surf(0, 11.4, -1);
      add(RB(8.2, 8.6, 1.5, .4), at(cf.clone().add(V(0, 0, .55 * K)), 1, 1, 1, -.06), 0, 6); add(RB(8.2, 8.6, 1.3, .4), at(cb.clone().add(V(0, .2, -.5 * K)), 1, 1, 1, .06), 0, 6);
      for (const s of [-1, 1]) add(RB(2.1, 1.4, 7.6, .35), at(V(s * 3.1 * K, cf.y + 4.3 * K, (cf.z + cb.z) / 2), 1, 1, 1), 0, 6); // плечевые лямки
      for (let i = -1; i <= 1; i++) add(RB(2.2, 2.9, 1.5, .3), at(cf.clone().add(V(i * 2.5 * K, -1.7 * K, 1.4 * K)), 1, 1, 1), 0, 7);
      add(RB(1.8, 3.2, 1.3, .3), at(cf.clone().add(V(-3.2 * K, 2.2 * K, 1.1 * K)), 1, 1, 1), 0, 7); add(Cy(.12, .12, 2.6, 5), at(cf.clone().add(V(-3.2 * K, 4.6 * K, 1.1 * K)), 1, 1, 1), 0, 12); // рация с антенной
      add(RB(7, 7.4, 3.2, .8), at(cb.clone().add(V(0, -.6 * K, -2.4 * K)), 1, 1, 1), 0, 7); // рюкзачок
      const hip = surf(4.6, 2.6, 1); add(RB(1.6, 3.4, 2.4, .3), at(V(hip.x + .8, hip.y - .4, hip.z - 1.2), 1, 1, 1), 0, 12); // кобура
    }
    if (k === 1) { // женщина: распущенные тёмные волосы, воротник куртки
      add(Sph(28, 16, Math.PI * .62), Lm(0, headC.y + .1 * K, headC.z - .05 * K, 2.98 * K, 3.38 * K, 3.32 * K, -1.0), 1, 4);
      const back = new T.SphereGeometry(1, 20, 14); add(back, Lm(0, H(0, 17.8, 0).y, H(0, 0, -1.3).z, 2.9 * K, 5.2 * K, 1.35 * K, .1), 1, 4);
      for (const s of [-1, 1]) { add(Sph(16, 12), Lm(s * 2.55 * K, H(0, 19.9, 0).y, H(0, 0, 1.3).z, .95 * K, 3.4 * K, 1.6 * K, .1, 0, s * .1), 1, 4); add(Sph(14, 10), Lm(s * 2.3 * K, H(0, 16.4, 0).y, H(0, 0, .1).z, 1.3 * K, 2.4 * K, 1.3 * K, .3, 0, s * .2), 0, 4); }
      add(Sph(16, 10), Lm(-.8 * K, H(0, 24.3, 0).y, H(0, 0, 3.7).z, 2.1 * K, .75 * K, 1.1 * K, .55, 0, .3), 1, 4); // чёлка набок
      add(new T.TorusGeometry(1, .32, 8, 24, Math.PI * 1.4), Lm(0, H(0, 17.4, 0).y, H(0, 0, .35).z, 2.6 * K, 2.4 * K, 1.3 * K, Math.PI / 2 + .25, 0, Math.PI * 1.2), 0, 0); // воротник
    }
    if (k === 2) { // батюшка: борода, усы, седые волосы, скуфья, наперсный крест на цепи
      add(Sph(18, 14), Lm(0, H(0, 18.2, 0).y, H(0, 0, 2.85).z, 2.1 * K, 2.7 * K, 1.5 * K, .22), 1, 5); for (const s of [-1, 1]) add(Sph(12, 10), Lm(s * 1.85 * K, H(0, 19.7, 0).y, H(0, 0, 2.3).z, .85 * K, 1.9 * K, 1.2 * K, .1, 0, s * .2), 1, 5);
      add(Sph(14, 8), Lm(0, H(0, 19.85, 0).y, H(0, 0, 4.45).z, 1.3 * K, .38 * K, .5 * K), 1, 5);
      add(Sph(18, 12), Lm(0, H(0, 20.6, 0).y, H(0, 0, -.5).z, 2.55 * K, 2.6 * K, 1.3 * K, -.2), 1, 4);
      add(Sph(24, 10, Math.PI * .5), Lm(0, H(0, 23.4, 0).y, headC.z - .15, 2.95 * K, 2.15 * K, 3.1 * K, -.12), 1, 8);
      const cf = surf(0, 10.2, 1); add(Bx(.9, 4.8, .4), at(cf.clone().add(V(0, 0, .5)), 1, 1, 1), 0, 3); add(Bx(3.4, .9, .4), at(cf.clone().add(V(0, 1.1 * K, .5)), 1, 1, 1), 0, 3);
      add(Bx(2.2, .6, .38), at(cf.clone().add(V(0, -1.3 * K, .52)), 1, 1, 1, 0, 0, -.3), 0, 3);
      const nk = H(0, 17.3, 0); for (const s of [-1, 1]) { const a = V(s * 2.1 * K, nk.y, surf(s * 2.1, 16.4, 1).z), b = cf.clone().add(V(s * .3, 2.6 * K, .35)), m = a.clone().add(b).multiplyScalar(.5), d = b.clone().sub(a);
        add(Cy(.09, .09, d.length(), 5), new T.Matrix4().compose(m, new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)), 0, 3); }
    }
    if (k === 3) { // монахиня: апостольник вокруг лица, накидка на плечи, белая полоска надо лбом
      add(Sph(28, 18, Math.PI * .74), Lm(0, headC.y - .1 * K, headC.z - .1 * K, 3.15 * K, 3.55 * K, 3.45 * K, -1.22), 1, 8);
      add(Sph(20, 12), Lm(0, H(0, 17.7, 0).y, H(0, 0, 1.6).z, 2.8 * K, 1.8 * K, 2.6 * K), 1, 8); // под подбородком
      add(new T.TorusGeometry(1, .16, 6, 28, Math.PI), Lm(0, H(0, 24.0, 0).y, H(0, 0, 1.55).z, 2.98 * K, 3.25 * K, 1, Math.PI / 2 - .3), 1, 9);
      const cf = surf(0, 11, 1); add(Bx(.6, 2.8, .3), at(cf.clone().add(V(0, 0, 1.9)), 1, 1, 1), 0, 3); add(Bx(1.8, .55, .3), at(cf.clone().add(V(0, .6 * K, 1.9)), 1, 1, 1), 0, 3);
    }
    if (k === 4) { // бабушка: платок с узлом под подбородком и треугольником на затылке
      add(Sph(28, 16, Math.PI * .7), Lm(0, headC.y + .05 * K, headC.z - .05 * K, 3.08 * K, 3.48 * K, 3.42 * K, -.95), 1, 10);
      add(Sph(12, 8), Lm(0, H(0, 17.9, 0).y, H(0, 0, 3.3).z, .85 * K, .7 * K, .75 * K), 1, 10);
      add(Sph(16, 10), Lm(0, H(0, 19.4, 0).y, H(0, 0, -1.2).z, 2.2 * K, 2.3 * K, .75 * K, .35), 1, 10);
    }
    if (k === 5) { // горожанин: красная кепка козырьком вперёд
      add(Sph(24, 10, Math.PI * .5), Lm(0, H(0, 23.2, 0).y, headC.z - .05, 2.98 * K, 2.4 * K, 3.15 * K, -.1), 1, 11);
      add(Cy(1, 1, .2, 24), Lm(0, H(0, 23.35, 0).y, H(0, 0, 4.55).z, 2.3 * K, K, 2.1 * K, -.12), 1, 11);
      add(Sph(8, 6), Lm(0, H(0, 25.6, 0).y, headC.z - .1, .35 * K, .25 * K, .35 * K), 1, 11);
    }
    if (k === 6) { // фельдшер: сумка через плечо с крестом
      const cb = surf(4.8, 3.5, 1); add(RB(2.6, 4.4, 5.2, .6), at(V(5.6 * K, cb.y - .5, (cb.z + surf(4.8, 3.5, -1).z) / 2), 1, 1, 1), 0, 14);
      const a = surf(-3, 15.6, 1), b = V(5.4 * K, cb.y + 1.6, cb.z - 1), m = a.clone().add(b).multiplyScalar(.5), d = b.clone().sub(a); add(Bx(.9, d.length(), .35), new T.Matrix4().compose(m.add(V(0, 0, .3)), new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)), 0, 2);
      const a2 = surf(-3, 15.6, -1), m2 = a2.clone().add(b).multiplyScalar(.5), d2 = b.clone().sub(a2); add(Bx(.9, d2.length(), .35), new T.Matrix4().compose(m2.add(V(0, 0, -.3)), new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d2.normalize()), V(1, 1, 1)), 0, 2);
    }
    if (k === 7) { // механик: пояс с подсумками, ключ в кармане
      for (const s of [-1, 1]) { const hp = surf(s * 4.4, 3.2, 1); add(RB(2.4, 2.8, 1.7, .35), at(V(hp.x + s * .4, hp.y - .6, hp.z - .9), 1, 1, 1), 0, 15); }
      const hp = surf(-4.2, 0, -1); add(Bx(.5, 4.2, .9), at(V(hp.x, hp.y + .8, hp.z - .3), 1, 1, 1, 0, 0, .15), 0, 3); // гаечный ключ из заднего кармана
    }
    // ---------- 5) геометрия ----------
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(POS, 3)); g.setAttribute('orig', new T.Float32BufferAttribute(ORIG, 3));
    g.setAttribute('rg', new T.Float32BufferAttribute(RG, 4)); g.setAttribute('bmat', new T.Float32BufferAttribute(MAT, 1));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SKI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SKW, 4));
    g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
    return { geometry: g, J, restOf, arm: [len[4] * 1, len[5] + len[6] * .55], hand: len[5] + len[6] * .45, legLen: len[7] };
  }
  // ---------- одежда шейдером: координаты исходной модели (vO), доли костей (vRg: голова, рука, кисть, стопа), вещь (vM) ----------
  const FRAG = `
    vec3 p = vO; float ax = abs(p.x); float spec = .12, bh = 0.;
    float n1 = sin(p.x * 1.7 + p.z * .9) * sin(p.y * 1.3 + p.z * 2.1) * .5 + .5, n2 = sin(p.x * 5.1 - p.y * 3.7) * sin(p.z * 4.3 + p.y * 2.9) * .5 + .5, n3 = sin(p.x * 23. + p.y * 7.) * sin(p.y * 19. - p.z * 13.) * sin(p.z * 17. + p.x * 11.) * .5 + .5;
    float arm = smoothstep(.35, .65, vRg.y), hand = smoothstep(.3, .6, vRg.z), foot = smoothstep(.3, .6, vRg.w), head = smoothstep(.3, .6, vRg.x);
    vec3 skin = uSkin * (.9 + .12 * n1), c = skin; spec = .28;
    float front = smoothstep(.8, 2.2, p.z);
    // ---- лицо ----
    bool isHead = p.y > 17.3 && arm < .5 && hand < .5;
    if (isHead) {
      vec3 q = vec3(ax, p.y, p.z);
      float e = length((q - vec3(.93, 21.85, 3.72)) * vec3(1., 1.75, 1.));
      float lid = smoothstep(.62, .3, e);
      c = mix(c, c * vec3(.78, .7, .68), lid * .55);
      if (e < .34 && p.z > 3.3) { c = vec3(.86, .83, .78); spec = .8; float ir = length((q.xy - vec2(.95, 21.84)) * vec2(1., 1.1)); if (ir < .17) { c = uHair.r > .45 ? vec3(.32, .42, .48) : vec3(.24, .16, .1); if (ir < .075) c = vec3(.02); } bh = .2; }
      float brow = (1. - smoothstep(.09, .17, abs(p.y - 22.48 + (ax - .95) * (ax - .95) * .22))) * step(.32, ax) * (1. - step(1.62, ax)) * step(3.05, p.z);
      c = mix(c, uHair * .8, brow * FEMB);
      float lips = (1. - smoothstep(.12, .24, abs(p.y - 19.38 + ax * ax * .12))) * (1. - smoothstep(.62, .86, ax)) * step(3.25, p.z);
      c = mix(c, skin * LIPC, lips); bh -= lips * .35;
      float nose = (1. - smoothstep(.2, .45, ax)) * smoothstep(20.2, 20.8, p.y) * (1. - step(21.6, p.y)) * step(3.6, p.z); c *= 1. - .08 * nose;
      // щетина у мужчин
      c = mix(c, c * vec3(.74, .72, .72), STUBBLE * smoothstep(20.3, 19.4, p.y) * step(17.9, p.y) * smoothstep(.6, 1.8, p.z) * (1. - lips));
      // короткая стрижка: волосы на темени и затылке, виски; уши свободны
      float hl = mix(23.35, 19.4, smoothstep(2.7, -2.4, p.z)), ear = length((q - vec3(3.05, 21.2, .35)) * vec3(1.6, .9, 1.2));
      float hair = step(hl, p.y) + step(2.6, ax) * step(20.6, p.y) * step(p.z, 2.1) * step(1.15, ear);
      if (hair > .5 && SHORTHAIR > .5) { c = uHair * (.75 + .4 * n3 * n2); spec = .4; bh = .25 * n3; }
    }
    // ---- кисти ----
    if (hand > .5) { c = skin * (.95 + .08 * n2); spec = .3; }
    float belt = step(3.55, p.y) * (1. - step(4.75, p.y)) * (1. - arm) * (1. - hand);
    float legs = (1. - step(3.6, p.y)) * (1. - arm) * (1. - hand);
    float shoe = max(foot, step(p.y, -21.3) * legs);
    float cuffW = min(length(p - vec3(12.9, 7.36, 5.27)), length(p - vec3(-12.9, 7.36, 5.27)));
    vec3 top = uA, bot = uB;
    #if HK == 0
      // камуфляж «цифра»: пятна трёх тонов
      float cm1 = sin(p.x * 1.3 + p.y * .7 + 1.7) * sin(p.y * 1.1 - p.z * 1.4) + sin(p.x * 2.9 - p.z * 2.3 + p.y * .4) * .5;
      float cm2 = sin(p.x * 2.2 - p.y * 1.7 + 3.) * sin(p.z * 2. + p.y * .9);
      vec3 camo = uA; camo = mix(camo, vec3(.24, .22, .16), step(.45, cm1)); camo = mix(camo, vec3(.52, .47, .34), step(.62, cm2)); camo = mix(camo, vec3(.16, .17, .12), step(.78, cm1 * cm2 + .3));
      top = camo * (.85 + .2 * n3); bot = top;
    #endif
    if (!isHead && hand < .5) {
      c = top * (.84 + .22 * n2); spec = .08; bh = .1 * n3;
      // складки на рукавах и в паху
      bh += arm * .35 * sin(p.y * 2.6 + p.x * 1.3 + n1 * 2.) * smoothstep(.4, 1., n1);
      if (cuffW < 1.05 && CUFF > .5) { c *= .82; bh += .4; }
      if (legs > .5) { c = bot * (.84 + .22 * n2); float knee = smoothstep(3.5, 0., abs(p.y + 10.9)); bh = .38 * sin(p.y * 3.1 + sin(p.x * 2.3 + p.z) * 1.6) * (knee + smoothstep(3., 0., abs(p.y + 19.))) + .07 * n3 + .45 * (1. - smoothstep(.06, .2, abs(p.z - .3))) * step(3.6, ax); }
      if (belt > .5) { c = BELTC * (.8 + .3 * n2); spec = .35; bh = .6 - .6 * (1. - smoothstep(0., .22, min(p.y - 3.55, 4.75 - p.y))); if (ax < 1. && front > .5) { c = vec3(.55, .5, .4); spec = 1.; bh = .9; } }
      if (shoe > .5) { c = SHOEC * (.82 + .3 * n2); spec = .55; bh = .12 * n2 + .5 * (1. - smoothstep(.1, .3, abs(p.y + 23.3)));
        if (p.y < -23.5) { c = SOLEC; spec = .1; } if (p.z > .9 && p.y > -22.6 && fract(p.y * 1.6) < .28 && LACES > .5) c = SHOEC * 1.6; }
      #if HK == 0
        if (legs > .5 && abs(p.y + 10.7) < 1.5 && p.z > .8) { c = vec3(.12, .12, .1); spec = .5; bh = .6; } // наколенники
        if (hand > .2) c = vec3(.18, .17, .13);
      #elif HK == 1
        // куртка: молния, нагрудные карманы, кокетка; джинсы со строчкой; сапоги до середины голени
        if (!(legs > .5)) { if (ax < .14 && front > .5 && p.y > 4.7) { c = vec3(.25, .25, .24); spec = .9; bh = .5; }
          float pk = step(1., ax) * step(ax, 3.2) * step(11.6, p.y) * step(p.y, 14.) * front; if (pk > .5) { c *= .9; bh += .35; if (abs(p.y - 13.8) < .2) bh -= .5; }
          if (abs(p.y - 15.4) < .12 && front > .2) bh -= .4; }
        else { c = mix(c, c * 1.35, smoothstep(.55, 1., n2) * smoothstep(3.5, 0., abs(p.y + 9.))); if (abs(p.z - .3) < .12 && ax > 3.4) c = vec3(.62, .5, .3); }
        if (p.y < -15.5 && legs > .5) { c = vec3(.2, .13, .08) * (.82 + .3 * n2); spec = .5; bh = .1 * n3; }
      #elif HK == 2 || HK == 3
        c = top * (.86 + .2 * n2); spec = .14; // ряса/облачение до пят
        if (CUFF > .5 && cuffW < 1.3) { c *= .78; bh += .35; }
        if (HK == 2 && ax < .16 && front > .5 && p.y > 4. && p.y < 17.) { c = vec3(.3, .3, .32); bh = .4; } // ряд пуговиц
      #elif HK == 4
        // вязаная кофта: «косы» вертикальными жгутами, пуговицы; чулки и туфли
        if (!(legs > .5)) { float kn = sin(p.y * 9.) * .5 + .5, cable = 1. - smoothstep(.1, .35, abs(fract(p.x * .55 + .5) - .5)); c = top * (.78 + .22 * kn + .1 * cable); bh = .35 * kn + .45 * cable;
          if (ax < .7 && front > .5 && fract(p.y * .42) < .12 && p.y > 4.) { c = vec3(.86, .82, .72); bh = .8; spec = .7; }
          if (p.y < 5.2 && p.y > 3.6) { c = top * .7; bh = .5 * sin(p.y * 12.); } }
        else if (shoe < .5) { c = uSkin * vec3(.78, .7, .64) * (.92 + .1 * n3); spec = .45; }
      #elif HK == 5
        // белая майка: бретели, низкий вырез; руки и плечи открыты; джинсы, белые кроссовки
        if (!(legs > .5)) { float strap = step(1.6, ax) * step(ax, 3.4); bool open_ = arm > .3 || (p.y > 15.2 && strap < .5 && (front > .3 || p.z < -1.)) || (p.y > 16.6); if (open_) { c = skin; spec = .3; bh = 0.; } else { c = top * (.9 + .1 * n2); bh = .15 * sin(p.y * 14.); } }
        else { c = mix(c, c * 1.4, smoothstep(.55, 1., n2) * smoothstep(3.5, 0., abs(p.y + 9.))); if (abs(p.z - .3) < .12 && ax > 3.4) c = vec3(.66, .52, .3); }
        if (shoe > .5) { c = vec3(.9, .88, .84) * (.9 + .1 * n2); spec = .35; if (p.y < -23.4) c = vec3(.7, .68, .64); if (abs(p.y + 22.6) < .25) c = uC; }
      #elif HK == 6
        // форменная куртка скорой: светоотражающие полосы, белый крест на груди слева
        if (!(legs > .5)) { float band = (1. - step(.55, abs(p.y - 8.2))) * (1. - arm) + arm * (1. - step(.5, abs(length(p.xy - vec2(sign(p.x) * 7.2, 13.)) - 0.)) ) * 0.;
          float sb = arm * step(8.8, ax) * step(ax, 10.4); if (band > .5 || sb > .5) { c = vec3(.78, .8, .74); spec = 1.2; bh = .3; }
          vec2 cr = vec2(p.x - 2.7, p.y - 13.4); float crs = step(abs(cr.x), .95) * step(abs(cr.y), .28) + step(abs(cr.x), .28) * step(abs(cr.y), .95);
          if (front > .5 && length(cr) < 1.35) { c = vec3(.92, .9, .86); bh = .3; if (crs > .5) c = vec3(.75, .12, .16); }
          if (ax < .14 && front > .5 && p.y > 4.7) { c = vec3(.2); spec = .9; bh = .5; } }
        else if (abs(p.y + 9.) < .35 || abs(p.y + 17.) < .35) { c = vec3(.78, .8, .74); spec = 1.; }
      #elif HK == 7
        // синий комбинезон: нагрудный карман, наколенники потемнее, масляные пятна; перчатки
        c = top * (.82 + .22 * n2); float pk = step(.9, ax) * step(ax, 3.4) * step(11.4, p.y) * step(p.y, 14.2) * front * step(p.x, 0.); if (pk > .5) { c *= .88; bh += .4; }
        if (legs > .5 && abs(p.y + 10.9) < 1.8 && p.z > .8) c *= .8;
        c = mix(c, vec3(.12, .12, .13), smoothstep(.9, .99, n2 * n1 + .12) * .55);
        if (ax < .14 && front > .5 && p.y > 4.) { c = vec3(.5, .5, .52); spec = 1.; bh = .5; }
        if (shoe > .5) c = vec3(.24, .16, .1) * (.85 + .2 * n2);
      #endif
    }
    #if HK == 7
      if (hand > .5) { c = uC * (.82 + .3 * n2); spec = .25; bh = .2 * n3; }
    #endif
    // ---- вещи ----
    float m = vM;
    if (m > .5) { bh = 0.;
      if (m < 1.5) { c = uA * vec3(.92, .96, .86) * (.85 + .22 * n2); spec = .25; bh = .15 * n3; }            // каска
      else if (m < 2.5) { c = vec3(.07, .07, .065); spec = .4; }                                          // ремни
      else if (m < 3.5) { c = uC * (.95 + .1 * n2); spec = 2.2; }                                         // золото/металл
      else if (m < 4.5) { c = uHair * (.7 + .45 * smoothstep(.2, .9, sin(p.x * 9. + p.y * 1.6 + n1 * 4.) * .5 + .5)); spec = .9; bh = .5 * sin(p.x * 14. + p.y * 2. + n1 * 5.); } // волосы прядями
      else if (m < 5.5) { c = uHair * 1.08 * (.75 + .4 * smoothstep(.1, .9, sin(p.x * 11. + p.y * 4.) * .5 + .5)); spec = .5; bh = .4 * sin(p.x * 13. + p.y * 5.); } // борода
      else if (m < 6.5) { c = uC * (.82 + .22 * n2) * vec3(1., 1., .9); spec = .12; bh = .12 * n3; }        // плитник
      else if (m < 7.5) { c = uC * .78 * (.85 + .2 * n2); spec = .1; bh = .2 * n3; }                       // подсумки, рюкзак
      else if (m < 8.5) { c = uA * (.85 + .25 * n2); spec = .15; bh = .1 * n3; }                            // чёрная ткань
      else if (m < 9.5) { c = vec3(.86, .84, .8); spec = .2; }                                            // белая полоска
      else if (m < 10.5) { float fl = step(.72, sin(p.x * 6. + p.y * 3.) * sin(p.y * 6. - p.z * 5.)); c = mix(uC, vec3(.92, .84, .6), fl) * (.85 + .2 * n2); spec = .15; } // платок в цветочек
      else if (m < 11.5) { c = uC * (.85 + .2 * n2); spec = .2; }                                         // кепка
      else if (m < 12.5) { c = vec3(.09, .09, .085); spec = .7; }                                         // пластик, резина
      else if (m < 13.5) { c = uB * (.8 + .25 * n2); spec = .12; bh = .3 * sin(atan(p.x, p.z) * 9. + p.y * .3) * smoothstep(0., -16., p.y); } // юбка: складки книзу
      else if (m < 14.5) { c = vec3(.62, .14, .16) * (.85 + .2 * n2); spec = .4; if (abs(p.x * 0.) < 1. && length(vec2(p.y - (-.5), p.z - 4.)) < 0.) c = vec3(1.); } // сумка
      else if (m < 15.5) { c = vec3(.34, .24, .14) * (.8 + .3 * n2); spec = .35; }                         // кожа
      else if (m < 16.5) { c = SHOEC * (.85 + .25 * n2); spec = .6; bh = .15 * n3; if (LACES > .5 && p.z > 1.6 && fract(p.z * 1.7) < .3 && p.y > -23.2) c = SHOEC * (SHOEC.r > .5 ? .8 : 1.8); } // обувь
      else { c = SOLEC; spec = .1; } }                                                                         // подошва
    diffuseColor.rgb *= c;
    float heroSpec = spec, heroH = bh;`;
  const CFG = { // параметры шейдера по героям
    0: { FEMB: 1, LIPC: 'vec3(.82,.62,.58)', STUBBLE: .9, SHORTHAIR: 1, CUFF: 1, BELTC: 'vec3(.34,.3,.2)', SHOEC: 'vec3(.1,.085,.07)', SOLEC: 'vec3(.06)', LACES: 1 },
    10: { FEMB: .75, LIPC: 'vec3(.8,.55,.53)', STUBBLE: 0, SHORTHAIR: 0, CUFF: 1, BELTC: 'vec3(.2,.13,.08)', SHOEC: 'vec3(.2,.13,.08)', SOLEC: 'vec3(.08)', LACES: 0 },
    11: { FEMB: 1, LIPC: 'vec3(.8,.6,.56)', STUBBLE: 0, SHORTHAIR: 1, CUFF: 1, BELTC: 'vec3(.1,.1,.1)', SHOEC: 'vec3(.06,.06,.06)', SOLEC: 'vec3(.04)', LACES: 0 },
    12: { FEMB: .7, LIPC: 'vec3(.82,.56,.54)', STUBBLE: 0, SHORTHAIR: 0, CUFF: 1, BELTC: 'vec3(.1,.1,.1)', SHOEC: 'vec3(.06,.06,.06)', SOLEC: 'vec3(.04)', LACES: 0 },
    13: { FEMB: .6, LIPC: 'vec3(.8,.58,.56)', STUBBLE: 0, SHORTHAIR: 0, CUFF: 0, BELTC: 'vec3(.3,.22,.18)', SHOEC: 'vec3(.16,.1,.07)', SOLEC: 'vec3(.06)', LACES: 0 },
    14: { FEMB: 1, LIPC: 'vec3(.8,.58,.54)', STUBBLE: .8, SHORTHAIR: 1, CUFF: 0, BELTC: 'vec3(.22,.14,.08)', SHOEC: 'vec3(.9,.88,.84)', SOLEC: 'vec3(.7)', LACES: 1 },
    15: { FEMB: 1, LIPC: 'vec3(.8,.58,.54)', STUBBLE: .5, SHORTHAIR: 1, CUFF: 1, BELTC: 'vec3(.12,.12,.12)', SHOEC: 'vec3(.07,.07,.07)', SOLEC: 'vec3(.05)', LACES: 1 },
    16: { FEMB: 1, LIPC: 'vec3(.8,.58,.54)', STUBBLE: 1, SHORTHAIR: 1, CUFF: 1, BELTC: 'vec3(.2,.14,.09)', SHOEC: 'vec3(.24,.16,.1)', SOLEC: 'vec3(.07)', LACES: 1 },
  };
  function material(T, id) {
    const L_ = LOOK[id], c = CFG[id], col = h => new T.Color(h);
    const mat = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x302c28, shininess: 30, skinning: true }); // three r128: скиннинг включается флагом материала
    mat.customProgramCacheKey = () => 'hero' + id;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uSkin: { value: col(L_.skin) }, uHair: { value: col(L_.hair) }, uA: { value: col(L_.a) }, uB: { value: col(L_.b) }, uC: { value: col(L_.c) } });
      const defs = `#define HK ${L_.k}\n` + Object.entries(c).map(([k, v]) => `#define ${k} ${typeof v === 'number' ? v.toFixed(3) : v}`).join('\n') + '\n';
      sh.vertexShader = 'attribute vec3 orig; attribute vec4 rg; attribute float bmat; varying vec3 vO; varying vec4 vRg; varying float vM;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvO = orig; vRg = rg; vM = bmat;');
      sh.fragmentShader = defs + 'uniform vec3 uSkin, uHair, uA, uB, uC; varying vec3 vO; varying vec4 vRg; varying float vM;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG)
        .replace('#include <specularmap_fragment>', 'float specularStrength = heroSpec;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 sp = -vViewPosition, dpx = dFdx(sp), dpy = dFdy(sp); float dhx = dFdx(heroH) * .06, dhy = dFdy(heroH) * .06;
            vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1); vec3 gr = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - gr); }`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float rim = 1. - max(dot(normal, normalize(vViewPosition)), 0.); gl_FragColor.rgb += vec3(.2, .18, .15) * rim * rim * rim * .45;`);
    };
    return mat;
  }
  // тело героя на суставах фигуры u (группы body, head, armR, elR, armL, elL, legR, kneeR, legL, kneeL)
  function attach(T, data, id, u) {
    let b = cache.get(id); if (!b) { b = build(T, data, id); cache.set(id, b); }
    const J = b.J, set = (o, v, par) => o.position.copy(par ? v.clone().sub(par) : v);
    set(u.head, J.neck); set(u.armR, J.shR); set(u.elR, J.elR, J.shR); set(u.armL, J.shL); set(u.elL, J.elL, J.shL);
    set(u.legR, J.hipR); set(u.kneeR, J.knR, J.hipR); set(u.legL, J.hipL); set(u.kneeL, J.knL, J.hipL);
    const groups = [u.body, u.head, u.armR, u.elR, u.armL, u.elL, u.legR, u.kneeR, u.legL, u.kneeL], bones = groups.map(g => { const bn = new T.Bone(); g.add(bn); return bn; });
    const mesh = new T.SkinnedMesh(b.geometry, material(T, id)); mesh.castShadow = true; mesh.frustumCulled = false; mesh.userData.noOutline = true; mesh.userData.noMerge = true;
    u.body.add(mesh);
    const root = u.body.parent; root.updateMatrixWorld(true); // поза покоя: все суставы без поворота
    mesh.bind(new T.Skeleton(bones));
    return { mesh, arm: b.arm, hand: b.hand };
  }
  return { has: id => !!LOOK[id], attach };
})();
