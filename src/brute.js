// ===== LAST EXIT — громила и босс: цельная мускулистая модель со скелетом (Claude) =====
// База — та же анатомия MakeHuman (CC0), что у чёрного костюма (RAIDER_SUIT_MODEL). Здесь она перекачивается:
// широкие плечи и трапеции, грудь, толстые предплечья, мощные бёдра; сглаживается подразделением Loop (×4 треугольников).
// Одежда (штаны, ботинки, ремни крест-накрест, бинты, кожаный капюшон) рисуется шейдером по координатам исходной модели.
// В руке кувалда (у босса — бетонная глыба на арматуре и броня). Скелет считается в коде (процедурно), матрицы костей
// всей толпы — в одной DataTexture, вершины скинятся в шейдере InstancedMesh: сотни громил одним вызовом отрисовки.
const BruteRig = (() => {
  function create(T, data, capacity, boss) {
    const NB = data.bones.length, H = Math.PI / 2;
    const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
    // ---------- 1) скелет «перекачанного» тела: плечи шире, ноги шире ----------
    const SH = { 4: [1.8, .4, -.2], 5: [1.8, .4, -.2], 6: [1.8, .4, -.2], 7: [.8, 0, 0], 8: [1, 0, 0], 9: [1, 0, 0] };
    const shiftOf = b => { const k = b >= 10 ? b - 6 : b, s = SH[k]; return s ? [b >= 10 ? -s[0] : s[0], s[1], s[2]] : [0, 0, 0]; };
    const bind = data.bones.map(([a, b], i) => { const s = shiftOf(i); return [V(a[0] + s[0], a[1] + s[1], a[2] + s[2]), V(b[0] + s[0], b[1] + s[1], b[2] + s[2])]; });
    // толщина по костям: [x, y, z] для позвоночника, число — радиально для рук и ног
    const FAT = boss ? 1.08 : 1;
    const thick = (b, t, oy, oz) => {
      const k = b >= 10 ? b - 6 : b;
      if (k === 0) return [1.34 * FAT, 1, 1.2 * FAT];
      if (k === 1) return [1.3 * FAT, 1, 1.16 * FAT];
      if (k === 2) return [1.4 * FAT, 1, 1.32 * FAT];
      if (k === 3) return oy < 18.4 ? (oz > 1.6 ? [1.3, 1, 1] : [1.5, 1, 1.3]) : oy < 21.6 ? [1.08, 1, 1] : [1.05, 1, 1.03]; // шея толще, лицо и челюсть — без раздувания вперёд
      if (k === 4) return 1.72 * FAT;
      if (k === 5) return (t < .55 ? 1.9 : 1.55) * FAT;
      if (k === 6) return 1.32;
      if (k === 7) return 1.6 * FAT;
      if (k === 8) return t < .45 ? 1.62 : 1.48;
      return 1.42;
    };
    const P0 = data.positions, n0 = P0.length / 3, J0 = data.joints, W0 = data.weights;
    let P = new Float32Array(P0.length), O = Float32Array.from(P0);
    const a_ = V(), b_ = V(), p_ = V(), c_ = V(), o_ = V(), acc = V();
    for (let v = 0; v < n0; v++) {
      const ox = P0[v * 3], oy = P0[v * 3 + 1], oz = P0[v * 3 + 2]; acc.set(0, 0, 0); let ws = 0;
      for (let k = 0; k < 4; k++) { const w = W0[v * 4 + k]; if (w <= 0) continue; const b = J0[v * 4 + k], s = shiftOf(b);
        p_.set(ox + s[0], oy + s[1], oz + s[2]); a_.copy(bind[b][0]); b_.copy(bind[b][1]);
        const ab = b_.clone().sub(a_), t = Math.max(0, Math.min(1, p_.clone().sub(a_).dot(ab) / ab.lengthSq()));
        c_.copy(a_).addScaledVector(ab, t); o_.subVectors(p_, c_); const f = thick(b, t, oy, oz);
        if (Array.isArray(f)) o_.set(o_.x * f[0], o_.y * f[1], o_.z * f[2]); else o_.multiplyScalar(f);
        acc.addScaledVector(c_.add(o_), w); ws += w; }
      acc.multiplyScalar(1 / Math.max(ws, 1e-4));
      // мышечный рельеф: трапеции, грудные, пресс, округлая спина, широкая челюсть
      const ax = Math.abs(ox), bump = (x, c, w) => Math.max(0, 1 - ((x - c) / w) ** 2);
      acc.y += 1.9 * bump(ax, 3.6, 2.6) * bump(oy, 18.4, 2.4);
      if (oz > .8) acc.z += 1.5 * bump(oy, 13.6, 3) * bump(ax, 2.8, 3.2) + .7 * bump(oy, 6, 3) * bump(ax, 0, 3.5);
      if (oz < .3) acc.z -= 1.1 * bump(oy, 15.5, 4) * bump(ax, 2.5, 4);
      if (oy > 18.3 && oy < 21.2 && oz > 1.2) acc.x *= 1 + .12 * bump(oy, 19.6, 1.6);
      P[v * 3] = acc.x; P[v * 3 + 1] = acc.y; P[v * 3 + 2] = acc.z;
    }
    // ---------- 2) подразделение Loop: гладкое тело без граней ----------
    let I = Array.from(data.indices), Jn = Array.from(J0), Wn = Array.from(W0);
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
    let NP, NO; [NP, NO, I, Jn, Wn] = loop(P, O, I, Jn, Wn);
    const MAT = Array(NP.length / 3).fill(0);
    // ---------- 3) снаряжение: кувалда, у босса — бетонная дубина и броня (на костях) ----------
    const restFrame = (a, b, ref) => { const y = V().subVectors(b, a).normalize(), z = ref.clone().addScaledVector(y, -ref.dot(y)).normalize(), x = V().crossVectors(y, z); return new T.Matrix4().makeBasis(x, y, z).setPosition(a); };
    const FRONT = V(0, 0, 1), DOWN = V(0, -1, 0);
    function add(geo, m, joint, mat) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const p = g.attributes.position, base = NP.length / 3;
      for (let i = 0; i < p.count; i++) { NP.push(p.getX(i), p.getY(i), p.getZ(i)); NO.push(0, 0, 0); NJ_push(joint); MAT.push(mat); I.push(base + i); } }
    const NJ_push = j => { Jn.push(j, 0, 0, 0); Wn.push(1, 0, 0, 0); };
    const C = (r0, r1, h, s = 10) => new T.CylinderGeometry(r1, r0, h, s, 1), Bx = (x, y, z) => new T.BoxGeometry(x, y, z), S = (s = 12, t = 8, tl = Math.PI) => new T.SphereGeometry(1, s, t, 0, Math.PI * 2, 0, tl);
    const L = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V(sx, sy, sz));
    const hand = restFrame(bind[6][0], bind[6][1], FRONT), at = (lm) => hand.clone().multiply(lm);
    // точка на поверхности тела (после перекачки): самая выступающая вершина в нужную сторону рядом с (x, y)
    const surf = (x, y, dir, r = .8) => { let best = -1e9, bp = null; for (let i = 0; i < NP.length / 3; i++) { const vx = NP[i * 3], vy = NP[i * 3 + 1], vz = NP[i * 3 + 2]; const near = dir === 'z' ? Math.abs(vx - x) < r && Math.abs(vy - y) < r : Math.abs(vz - x) < r * 1.6 && Math.abs(vy - y) < r;
      if (!near) continue; const v = dir === 'z' ? vz : dir === '+x' ? vx : -vx; if (v > best) { best = v; bp = [vx, vy, vz]; } } return bp || [0, y, 0]; };
    // ботинки: цельная оболочка поверх стопы (у базовой модели видны пальцы) + голенище и толстая подошва
    for (const [fb, sb] of [[9, 8], [15, 14]]) { const mn = V(1e9, 1e9, 1e9), mx = V(-1e9, -1e9, -1e9);
      for (let v = 0; v < Jn.length / 4; v++) if (Jn[v * 4] === fb && Wn[v * 4] > .5 && MAT[v] === 0) { mn.min(V(NP[v * 3], NP[v * 3 + 1], NP[v * 3 + 2])); mx.max(V(NP[v * 3], NP[v * 3 + 1], NP[v * 3 + 2])); }
      if (mn.x > 1e8) continue; const c = mn.clone().add(mx).multiplyScalar(.5), h = mx.clone().sub(mn).multiplyScalar(.5);
      const shell = new T.SphereGeometry(1, 16, 10), sp = shell.attributes.position; for (let i = 0; i < sp.count; i++) { let y = sp.getY(i); if (y < -.55) y = -.55; sp.setY(i, y); sp.setZ(i, sp.getZ(i) * (sp.getZ(i) > 0 ? 1.06 : .95)); }
      for (let v = 0; v < Jn.length / 4; v++) if (Jn[v * 4] === fb && Wn[v * 4] > .5 && MAT[v] === 0) for (let d = 0; d < 3; d++) NP[v * 3 + d] = c.getComponent(d) + (NP[v * 3 + d] - c.getComponent(d)) * .6; // прячем пальцы внутрь
      add(shell, L(c.x, c.y + h.y * .18, c.z + .15, h.x * 1.06, h.y * 1.25, h.z * 1.02), fb, 9);
      const sole = new T.CylinderGeometry(1, 1, 1, 16); add(sole, L(c.x, mn.y + .3, c.z + .2, h.x * 1.08, .6, h.z * 1.04), fb, 10);
      add(C(h.x * 1.05, h.x * 1.12, 4.6, 14), L(c.x - (fb === 9 ? .25 : -.25), mn.y + 4.4, c.z - h.z * .45), sb, 9); }
    if (!boss) { // снаряжение громилы: наручники на правом боку, рация в подсумке слева, армейские жетоны на груди
      const hip = surf(.4, 5.3, '+x'), hipL = surf(.6, 5.3, '-x');
      for (const [dy, rz] of [[0, .25], [-1.7, -.2]]) add(new T.TorusGeometry(.95, .2, 6, 16), L(hip[0] + .45, hip[1] - 1 + dy, hip[2] - .2, 1, 1, 1, 0, H, rz), 0, 1);
      add(C(.12, .12, 1.1, 4), L(hip[0] + .45, hip[1] - 1.85, hip[2] - .2), 0, 1);
      add(Bx(1.2, 3, 2.1), L(hipL[0] - .65, hipL[1] - 1.4, hipL[2] + .3), 0, 3); add(Bx(1.25, .9, 2.15), L(hipL[0] - .66, hipL[1] + .45, hipL[2] + .3), 0, 8); add(C(.14, .1, 2.4, 5), L(hipL[0] - .65, hipL[1] + 1.7, hipL[2] + 1), 0, 8);
      const tag = surf(0, 12.6, 'z', .7), neckF = surf(0, 17.6, 'z', .9);
      for (const sd of [-1, 1]) { const a = V(sd * 2.6, neckF[1] - .3, neckF[2] - 1.2), b = V(sd * .25, tag[1] + .9, tag[2] + .1), m = a.clone().add(b).multiplyScalar(.5), d = b.clone().sub(a);
        add(C(.07, .07, d.length(), 4), new T.Matrix4().compose(m, new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)), 2, 1); }
      add(Bx(.9, 1.4, .12), L(tag[0] - .25, tag[1], tag[2] + .2, 1, 1, 1, -.15, 0, .12), 2, 1); add(Bx(.9, 1.4, .12), L(tag[0] + .3, tag[1] - .25, tag[2] + .3, 1, 1, 1, -.15, 0, -.1), 2, 1);
      // чёрная резиновая полицейская дубинка: рифлёная рукоять, гарда-кольцо, длинный гладкий ствол со скруглённым концом
      add(C(.95, 1.0, 1.4, 12), at(L(0, -1.6, 0)), 6, 8); add(new T.TorusGeometry(.5, .1, 4, 10), at(L(0, -2.9, 0, 1, 1, 1, 0, H)), 6, 3); add(S(12, 6, Math.PI / 2), at(L(0, -2.3, 0, 1, .6, 1, Math.PI)), 6, 8);
      add(C(.88, .88, 5.2, 12), at(L(0, 1.4, 0)), 6, 3); for (let i = 0; i < 6; i++) add(C(.96, .96, .3, 12), at(L(0, -.6 + i * .85, 0)), 6, 8);
      add(C(1.12, 1.12, .55, 14), at(L(0, 4.3, 0)), 6, 8); add(C(.92, .82, 13.5, 12), at(L(0, 11.3, 0)), 6, 8); add(S(12, 6, Math.PI / 2), at(L(0, 18.05, 0, .92, .7, .92)), 6, 8);
    } else { // босс: арматура с бетонной глыбой, торчащие прутья
      add(C(.75, .7, 30, 8), at(L(0, 15, 0)), 6, 1); add(C(.85, .85, 6, 8), at(L(0, 2.6, 0)), 6, 3);
      const rock = new T.IcosahedronGeometry(1, 1); const rp = rock.attributes.position; for (let i = 0; i < rp.count; i++) { const k = .78 + .3 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1); rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k); }
      add(rock, at(L(0, 30, 0, 4.6, 5.6, 4.2)), 6, 5); for (const [x, z, r] of [[1.5, 2, .5], [-2, .5, -.6], [.5, -2.2, .2]]) add(C(.28, .28, 6, 5), at(L(x, 31 + r * 2, z, 1, 1, 1, r, 0, r * 1.4)), 6, 6);
      const sh = [restFrame(bind[4][0], bind[4][1], FRONT), restFrame(bind[10][0], bind[10][1], FRONT)];
      sh.forEach((f, k) => { const j = k ? 10 : 4, s = k ? -1 : 1; add(S(14, 7, Math.PI / 2), f.clone().multiply(L(0, 1.6, .2, 5.2, 4.2, 5, 0, 0, Math.PI)), j, 6);
        for (let i = 0; i < 3; i++) add(C(.75, .03, 3.8, 6), f.clone().multiply(L(s * .3, -4.3 + Math.abs(i - 1) * .5, -2.3 + i * 2.3, 1, 1, 1, Math.PI, 0, 0)), j, 1); });
      const chest = restFrame(bind[2][0], bind[2][1], FRONT); const plate = new T.CylinderGeometry(6.9, 6.4, 7.6, 16, 1, true, -1.15, 2.3);
      add(plate, chest.clone().multiply(L(0, 4.4, .6, 1, 1, 1.08)), 2, 6); for (const y of [1.6, 4.4, 7.2]) for (const x of [-4.4, 4.4]) add(S(6, 4), chest.clone().multiply(L(x, y, (Math.sqrt(6.7 ** 2 - x * x) + .6) * 1.08, .36, .36, .36)), 2, 1);
      const head = restFrame(bind[3][0], bind[3][1], FRONT); add(Bx(5.4, 4.4, .9), head.clone().multiply(L(0, 4.1, 5.3, 1, 1, 1, -.12)), 3, 6); add(Bx(3.8, .45, .4), head.clone().multiply(L(0, 4.3, 5.85, 1, 1, 1, -.12)), 3, 4);
      add(S(14, 8, Math.PI / 2), head.clone().multiply(L(0, 4.4, 1.8, 3.6, 3.9, 3.9)), 3, 6);
    }
    // ---------- 4) геометрия, материал, шейдер ----------
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(NP, 3));
    geometry.setAttribute('orig', new T.Float32BufferAttribute(NO, 3));
    geometry.setAttribute('bmat', new T.Float32BufferAttribute(MAT, 1));
    geometry.setAttribute('jointIndices', new T.Uint8BufferAttribute(Jn, 4));
    geometry.setAttribute('jointWeights', new T.Float32BufferAttribute(Wn, 4));
    geometry.setIndex(I); geometry.computeVertexNormals();
    const toneArr = new Float32Array(capacity * 3), tone = new T.InstancedBufferAttribute(toneArr, 3); tone.setUsage(T.DynamicDrawUsage); geometry.setAttribute('aTone', tone);
    const palette = new Float32Array(capacity * NB * 16), texture = new T.DataTexture(palette, NB * 4, capacity, T.RGBAFormat, T.FloatType);
    texture.minFilter = texture.magFilter = T.NearestFilter; texture.generateMipmaps = false;
    const VS = `
      uniform highp sampler2D bruteBones; attribute vec4 jointIndices; attribute vec4 jointWeights; attribute vec3 orig; attribute float bmat; attribute vec3 aTone;
      varying vec3 vO; varying float vM; varying vec3 vTone;
      mat4 jm(int j) { int x = j * 4, y = gl_InstanceID; return mat4(texelFetch(bruteBones, ivec2(x, y), 0), texelFetch(bruteBones, ivec2(x + 1, y), 0), texelFetch(bruteBones, ivec2(x + 2, y), 0), texelFetch(bruteBones, ivec2(x + 3, y), 0)); }
      mat4 bskin() { mat4 r = jm(int(jointIndices.x)) * jointWeights.x; if (jointWeights.y > 0.) r += jm(int(jointIndices.y)) * jointWeights.y; if (jointWeights.z > 0.) r += jm(int(jointIndices.z)) * jointWeights.z; if (jointWeights.w > 0.) r += jm(int(jointIndices.w)) * jointWeights.w; return r / max(dot(jointWeights, vec4(1.)), .0001); }
    `;
    const install = (sh, full) => { sh.uniforms.bruteBones = { value: texture };
      sh.vertexShader = VS + sh.vertexShader.replace(/void main\s*\(\s*\)\s*\{/, '$&\nmat4 skin = bskin();')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = mat3(skin) * objectNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvO = orig; vM = bmat; vTone = aTone; transformed = (skin * vec4(transformed, 1.)).xyz;');
      if (!full) return;
      sh.fragmentShader = 'varying vec3 vO; varying float vM; varying vec3 vTone;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 p = vO; float ax = abs(p.x); float spec = .22; vec3 glow = vec3(0.); float bh = 0.;
          float n1 = sin(p.x * 1.7 + p.z * .9) * sin(p.y * 1.3 + p.z * 2.1) * .5 + .5, n2 = sin(p.x * 5.1 - p.y * 3.7) * sin(p.z * 4.3 + p.y * 2.9) * .5 + .5, n3 = sin(p.x * 23. + p.y * 7.) * sin(p.y * 19. - p.z * 13.) * sin(p.z * 17. + p.x * 11.);
          vec3 skin = vTone * (.84 + .16 * n1);
          // рельеф: пресс, нижний край грудных, ключицы — тенью
          float front = smoothstep(1.2, 2.6, p.z);
          float abs_ = front * (1. - smoothstep(2.6, 3.1, ax)) * step(6.4, p.y) * (1. - step(10.4, p.y)) * (max(1. - smoothstep(.08, .3, ax), max(max(1. - smoothstep(.08, .26, abs(p.y - 5.3)), 1. - smoothstep(.08, .26, abs(p.y - 7.4))), 1. - smoothstep(.08, .26, abs(p.y - 9.4)))));
          float pec = front * (1. - smoothstep(.15, .5, abs(p.y - 11.1 - ax * .12))) * step(.5, ax) * (1. - step(5.2, ax));
          skin *= 1. - .3 * abs_ - .34 * pec;
          // рельеф кожи: впадины пресса и грудных, разделение дельт, ложбина позвоночника, вены на предплечьях и бицепсах, поры
          float delt = (1. - smoothstep(.1, .45, abs(ax - 5.6 - (p.y - 14.) * .25))) * step(11.5, p.y) * (1. - step(17., p.y));
          float spine = (1. - smoothstep(.15, .6, ax)) * (1. - smoothstep(-.6, .6, p.z)) * step(5., p.y) * (1. - step(17., p.y));
          vec3 el = vec3(9.4, 10.5, .4), wr_ = vec3(12.9, 7.4, 5.3), q = vec3(ax, p.y, p.z) - el, fd = normalize(wr_ - el); float al = dot(q, fd); vec3 qp = q - fd * al;
          float vein = step(-1., al) * step(al, 6.4) * (1. - smoothstep(.05, .16, abs(sin(al * 1.15 + atan(qp.y, qp.z) * 2. + sin(al * 3.1) * .35))));
          vec3 sh_ = vec3(5.3, 15.9, .4), fu = normalize(el - sh_), q2 = vec3(ax, p.y, p.z) - sh_; float al2 = dot(q2, fu); vec3 qp2 = q2 - fu * al2;
          vein += step(1.5, al2) * step(al2, 6.) * (1. - smoothstep(.04, .13, abs(atan(qp2.y, qp2.z) - 1.2 + sin(al2 * 1.7) * .25))) * .7;
          bh = -1.1 * abs_ - 1.2 * pec - .9 * delt - .8 * spine + .55 * vein + .06 * n3;
          float scar = (1. - smoothstep(.05, .16, abs((p.x + 2.8) * .72 + (p.y - 13.5) * .69))) * step(-4.2, p.x) * step(p.x, 1.4) * front;
          skin = mix(skin, vec3(.86, .55, .5) * length(vTone) * .75, scar * .7);
          vec3 c = skin; spec = .35;
          // кожаный капюшон-маска с прорезями для глаз и швом по темени
          float eye = min(length((p - vec3(.92, 21.85, 3.7)) * vec3(1., 1.5, 1.)), length((p - vec3(-.92, 21.85, 3.7)) * vec3(1., 1.5, 1.)));
          float hood = step(20.55, p.y);
          if (hood > .5) { c = vec3(.075, .058, .048) * (.85 + .3 * n2); spec = .55;
            bh = .18 * n3 + .12 * n2;
            if (eye < .62) { c = vec3(.02); spec = .05; if (eye < .26) { c = vec3(.25, .2, .16); spec = .9; } }
            float seam = (1. - smoothstep(.06, .16, ax)) * step(22.2, p.y) * step(fract(p.z * 1.8 + p.y * 1.8), .5); c = mix(c, vec3(.32, .26, .2), seam); }
          else if (p.y > 18.6 && front > .1) { c *= .86 - .1 * n2; // щетина, губы, подбородок
            float lips = (1. - smoothstep(.12, .3, abs(p.y - 19.35))) * (1. - smoothstep(.8, 1.2, ax)) * step(3.2, p.z); c = mix(c, vTone * .55, lips); bh = -.6 * lips + .04 * n3; }
          // ремни крест-накрест с кольцом на груди
          float torso = step(6.3, p.y) * (1. - step(18.6, p.y)) * (1. - smoothstep(7.4, 7.8, ax));
          float sA = abs((p.x + 5.4) * .78 - (17.4 - p.y) * .58) , sB = abs((-p.x + 5.4) * .78 - (17.4 - p.y) * .58);
          float strap = torso * (1. - smoothstep(.62, .78, min(sA, sB)));
          float ring = torso * front * (1. - smoothstep(.12, .26, abs(length(vec2(p.x, p.y - 10.35)) - .82)));
          bh += (1. - smoothstep(.4, .78, min(sA, sB))) * torso * 1.1;
          if (strap > .5) { c = vec3(.16, .09, .05) * (.8 + .4 * n2); spec = .4; float rivet = step(.82, fract((p.y + p.x * .3) * 1.1)) * (1. - smoothstep(.12, .3, min(sA, sB))); c = mix(c, vec3(.55, .52, .46), rivet); bh += rivet * .5; }
          if (ring > .5) { c = vec3(.58, .56, .52); spec = .95; bh += .8; }
          // ремень с пряжкой
          if (p.y > 4.4 && p.y < 6.3) { c = vec3(.2, .12, .065) * (.8 + .3 * n2); spec = .45; bh = .9 - .9 * (1. - smoothstep(.0, .25, min(p.y - 4.4, 6.3 - p.y))) + .1 * n3; if (fract(ax * .55) < .12) bh -= .25; if (ax < 1.25 && front > .5) { c = vec3(.6, .57, .5); spec = 1.; if (ax < .75 && abs(p.y - 5.35) < .55) c = vec3(.16, .09, .05); } }
          // штаны: плотная ткань, наколенники, карманы, потёртости
          if (p.y <= 4.4) { c = vec3(.17, .16, .13) * (.82 + .3 * n1); spec = .1;
            // складки ткани: под коленом, у ботинок, на паху; боковой шов
            float knee = smoothstep(4., 0., abs(p.y + 10.8)), cuff = smoothstep(3.2, 0., abs(p.y + 18.4)), crotch = smoothstep(4., 0., abs(p.y)) * (1. - smoothstep(1., 3.5, ax));
            bh = .42 * sin(p.y * 3.1 + sin(p.x * 2.3 + p.z) * 1.6) * (knee * (1. - step(.6, p.z) * .6) + cuff * 1.3 + crotch) + .07 * n3 + .5 * (1. - smoothstep(.06, .2, abs(p.z - .3))) * step(3.6, ax);
            if (abs(p.y + 10.6) < 1.7 && p.z > .9) { c = vec3(.085, .07, .06); spec = .5; }
            float pocket = step(4.3, ax) * step(-8., p.y) * step(p.y, -2.2) * step(-1.2, p.z) * step(p.z, 2.4);
            if (pocket > .5) { c *= .82; bh += .45; if (abs(p.y + 2.6) < .3 || abs(p.y + 7.6) < .25) { c *= .7; bh -= .3; } }
            c = mix(c, c * 1.35, smoothstep(.6, 1., n2) * step(-14., p.y) * step(p.y, -7.)); }
          // ботинки с подошвой и шнуровкой
          if (p.y < -19.6) { c = vec3(.07, .06, .05) * (.8 + .3 * n2); spec = .6; bh = .12 * n2 + .5 * step(fract(p.y * 1.6), .3) * step(.8, p.z) + .6 * (1. - smoothstep(.1, .3, abs(p.y + 23.3))); if (p.y < -23.3) { c = vec3(.15, .14, .12); spec = .1; }
            if (p.z > .8 && p.y > -22.2 && abs(ax - 6.4) < .7 && fract(p.y * 1.6) < .3) c = vec3(.2, .17, .13); if (p.z > 4.2) { c = vec3(.11, .1, .09); spec = .9; } }
          // бинты на запястьях и тёмные перчатки без пальцев
          float wr = min(length(p - vec3(12.9, 7.4, 5.2)), length(p - vec3(-12.9, 7.4, 5.2)));
          float hd = min(length(p - vec3(13.5, 6.2, 6.6)), length(p - vec3(-13.5, 6.2, 6.6)));
          if (wr < 2.5 && hd > 1.3) { bh = .35 * sin((p.y + p.z * .7) * 8.2); c = vec3(.42, .38, .31) * (.75 + .35 * step(.5, fract((p.y + p.z) * 1.3))); spec = .05; if (n2 > .82) c = vec3(.35, .06, .05); }
          else if (hd < 1.75 && p.z > 6.2) { c = vec3(.09, .075, .065); spec = .45; }
          // снаряжение (vM): 1 сталь, 2 дерево, 3 обмотка, 4 свечение, 5 бетон, 6 ржавое железо, 7 полоса на бойке
          if (vM > .5) { float m = vM;
            if (m < 1.5) { c = vec3(.3, .31, .33) * (.8 + .3 * n2); spec = 1.2; }
            else if (m < 2.5) { c = vec3(.34, .21, .11) * (.75 + .4 * step(.5, fract(p.y * .0 + n1 * 3.))); spec = .15; }
            else if (m < 3.5) { c = vec3(.08, .065, .05); spec = .2; }
            else if (m < 4.5) { c = vec3(.3, .03, .02); glow = vec3(2.6, .35, .12); spec = 0.; }
            else if (m < 5.5) { c = vec3(.46, .45, .42) * (.75 + .3 * n2); spec = .03; }
            else if (m < 6.5) { c = mix(vec3(.3, .29, .28), vec3(.38, .2, .1), smoothstep(.35, .8, n2)); spec = .55; }
            else if (m < 7.5) { c = vec3(.5, .1, .06); spec = .4; }
            else if (m < 8.5) { c = vec3(.028, .028, .03) * (.9 + .2 * n2); spec = .5; }
            else if (m < 9.5) { c = vec3(.06, .05, .045) * (.8 + .4 * n2); spec = .35; }
            else { c = vec3(.13, .12, .1); spec = .1; } }
          if (vM > .5) bh = 0.;
          diffuseColor.rgb *= c;
          float bruteSpec = spec; vec3 bruteGlow = glow; float bruteH = bh;`)
        .replace('#include <specularmap_fragment>', 'float specularStrength = bruteSpec;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 sp = -vViewPosition, dpx = dFdx(sp), dpy = dFdy(sp); float dhx = dFdx(bruteH) * .11, dhy = dFdy(bruteH) * .11;
            vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1); vec3 gr = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - gr); }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bruteGlow;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float rim = 1. - max(dot(normal, normalize(vViewPosition)), 0.); gl_FragColor.rgb += vec3(.2, .17, .14) * rim * rim * rim * .5;`);
    };
    const material = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x3a3632, shininess: 38 });
    material.customProgramCacheKey = () => boss ? 'brute-boss' : 'brute';
    material.onBeforeCompile = sh => install(sh, true);
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.setColorAt(0, new T.Color(0xffffff)); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true;
    const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); depth.customProgramCacheKey = () => boss ? 'brute-boss-depth' : 'brute-depth'; depth.onBeforeCompile = sh => install(sh, false); mesh.customDepthMaterial = depth;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    const cap = new T.InstancedMesh(new T.SphereGeometry(1, 8, 5), new T.MeshLambertMaterial({ color: 0x4a1612 }), capacity * 3); cap.frustumCulled = false; cap.count = 0;
    // ---------- 5) процедурная поза ----------
    const x = V(), y = V(), z = V(), ref = V(), front = V(0, 0, 1), down = V(0, -1, 0);
    function frame(a, b, reference, out, scale = 1) { y.subVectors(b, a).normalize(); z.copy(reference).addScaledVector(y, -reference.dot(y)).normalize(); x.crossVectors(y, z); return out.makeBasis(x, y.multiplyScalar(scale), z).setPosition(a); }
    const inverse = bind.map(([a, b], i) => frame(a, b, i === 9 || i === 15 ? down : front, new T.Matrix4()).invert());
    const length = bind.map(([a, b]) => a.distanceTo(b)), bones = bind.map(() => new T.Matrix4());
    const pelvis = V(), waist = V(), chest = V(), neck = V(), face = V(), anchor = V(), mid = V(), end = V(), tip = V(), axis = V(), pole = V(), e2 = V(), t2 = V();
    const world = new T.Object3D(), color = new T.Color(), white = new T.Color(0xd8d2cc), ice = new T.Color(0x86b4d0), char = new T.Color(0x2a221e);
    const instance = new T.Matrix4(), capM = new T.Matrix4(), capQ = new T.Quaternion(), capS = V();
    const write = (bone, a, b, r = front) => frame(a, b, r, bones[bone], a.distanceTo(b) / length[bone]).multiply(inverse[bone]);
    function solve(a, b, upper, lower, dir) { axis.subVectors(b, a); const span = axis.length(); axis.multiplyScalar(1 / Math.max(span, .001)); const reach = Math.max(.001, Math.min(span, upper + lower - .03)); if (reach !== span) b.copy(a).addScaledVector(axis, reach);
      const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach); pole.copy(dir).addScaledVector(axis, -dir.dot(axis)).normalize(); mid.copy(a).addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper ** 2 - along ** 2))); }
    function stump(p, w) { capS.set(w, w * .7, w * .85); capM.compose(p, capQ, capS).premultiply(instance); cap.setMatrixAt(cap.count++, capM); }
    const ease = k => k * k * (3 - 2 * k);
    const refP = V(), refC = V(), refN = V();
    function pose(index, s) {
      const { id = 1, time = 0, walk = 0, yaw = 0, x: px = 0, z: pz = 0, scale = 1, fall = 0, atk = -1, kind = 0, hit = 0, lost = 0, burning = false, frozen = false, lift = 0, kick = 0, skin = 0xa87a5a } = s;
      const t = time, st = Math.sin(walk), sw = Math.cos(walk), crouch = lost & 4 ? 1 : 0;
      // удары дубинкой: 0 — сверху вниз, 1 — наотмашь сбоку, 2 — тычок вперёд. Замах (0–.55) → удар (.55–.66) → возврат
      let wind = 0, slam = 0; if (atk >= 0) { if (atk < .55) wind = ease(atk / .55); else if (atk < .66) { const k = (atk - .55) / .11; wind = 1 - k * k; slam = k * k; } else slam = 1 - ease((atk - .66) / .34); }
      const A = Math.min(1, wind + slam);
      // смерть: колени подламываются (0–.4), затем падает лицом вниз
      const kneel = ease(Math.min(1, fall / .4)), topple = ease(Math.max(0, (fall - .4) / .6)), alive = 1 - kneel;
      const stag = Math.min(1, kick * 1.4 + hit * .5), burn = burning && fall < .01 ? 1 : 0;
      // перенос веса: таз над опорной ногой, выше всего в середине шага; плечи скручиваются против таза
      const tw = (st * .2 * (1 - A) + (kind === 1 ? wind * .55 - slam * .75 : kind === 2 ? wind * .3 - slam * .35 : wind * .15 - slam * .2)) * alive;
      const twitchT = (t + id * 1.37) % (4.2 + (id % 5) * .6), twitch = twitchT < .3 ? Math.sin(twitchT / .3 * Math.PI) : 0;
      const breathe = Math.sin(t * 1.9 + id) * .25;
      const root = (23.2 + (1 - Math.abs(st)) * 1.1 * (1 - A) - slam * 2.6 + wind * .5 - stag * 1.2) * (1 - crouch * .6) - kneel * 10.5;
      world.position.set(px, lift + topple * 3.5 * scale, pz); world.rotation.set(topple * 1.38 + crouch * .62, yaw, burn * Math.sin(t * 9) * .05, 'YXZ'); world.scale.setScalar(scale); world.updateMatrix(); instance.copy(world.matrix); mesh.setMatrixAt(index, instance);
      refP.set(Math.sin(-tw * .6), 0, Math.cos(tw * .6)); refC.set(Math.sin(tw), 0, Math.cos(tw)); refN.set(Math.sin(tw * .5 + twitch * .35 * (id % 2 ? 1 : -1)), 0, 1).normalize();
      const fw = alive; // наклон вперёд только у живого
      pelvis.set(-st * 1.5 * (1 - A) * alive, root + bind[0][0].y, -.4 - kneel * 2);
      waist.set(-st * .8 * (1 - A) * alive, root + bind[1][0].y, (.2 + slam * .9 - wind * .6 - stag * 1.2) * fw + kneel * 1.2);
      chest.set(st * .5 * (1 - A) * alive, root + bind[2][0].y - slam * 2.2 + wind * .6 + breathe - stag * .6, (2.1 + slam * 4.6 - wind * 2.5 - stag * 3.4) * fw + kneel * 3.5);
      neck.set(st * .6 * (1 - A) * alive + twitch * .5, root + bind[3][0].y - 1.1 - slam * 3 + wind * .4 - stag * .8, (4.8 + slam * 7 - wind * 2.4 - stag * 5) * fw + kneel * 5);
      face.copy(neck).add(ref.set(twitch * (id % 2 ? 1.4 : -1.4) + burn * Math.sin(t * 7) * 1.2, 7.2 - stag * .6, 1.8 + slam * 1.2 - stag * 1.6));
      write(0, pelvis, waist, refP); write(1, waist, chest, refC); write(2, chest, neck, refC);
      if (lost & 16) { bones[3].makeScale(0, 0, 0).setPosition(neck); stump(neck, 1.7); } else write(3, neck, face, refN);
      // цели для правой руки с дубинкой
      const sh = bind[4][0].clone().applyMatrix4(bones[2]);
      let wE, wT, sE, sT;
      if (kind === 1) { wE = e2.set(10.5, sh.y + 1, -5); wT = V(1.6, .6, -2.4); sE = V(-5, sh.y - 3.5, 10.5); sT = V(-2.8, -.3, 1.2); }
      else if (kind === 2) { wE = e2.set(7, sh.y - 7.5, -5.5); wT = V(.2, .8, 2.9); sE = V(2.2, sh.y - 3.5, 16.5); sT = V(-.2, -.2, 3); }
      else { wE = e2.set(6.5, sh.y + 6.5, -3); wT = V(-.6, 2.4, -1.8); sE = V(3.5, sh.y - 5.5, 13); sT = V(-.8, -1.2, 2.8); }
      const kS = slam / Math.max(A, .001) || 0, hE = V().copy(wE).lerp(sE, kS), hT = V().copy(wT).lerp(sT, kS);
      for (let si = 0; si < 2; si++) { const side = si ? -1 : 1;
        for (let leg = 0; leg < 2; leg++) { const i = 4 + si * 6 + leg * 3; anchor.copy(bind[i][0]).applyMatrix4(bones[leg ? 0 : 2]);
          if (lost & (leg ? 4 : (si ? 2 : 1))) { for (let k = i; k < i + 3; k++) bones[k].makeScale(0, 0, 0).setPosition(anchor); stump(anchor, leg ? 2.2 : 1.9); continue; }
          if (leg) { // шаг: стопа перекатывается с пятки на носок; в ударе левая нога выходит вперёд; при смерти — на колени
            const str = st * side * (1 - A * .7) * alive, lf = Math.max(0, str) * 2.8 * alive;
            end.set(side * (5.9 + stag * .8), 3.2 + lf - slam * .5 + kneel * 1.5, str * 5.8 + (side < 0 ? A * 4 : -A * 1.5) - stag * side * 1.5 - kneel * 2);
            ref.set(side * .25, 0, 1); solve(anchor, end, length[i] * 1.03, length[i + 1] * 1.03, ref); write(i, anchor, mid); write(i + 1, mid, end);
            const toe = Math.max(0, -str) * .9 * alive; tip.set(end.x + side * .2, end.y - 1.7 + toe * .6 + kneel * 1.2, end.z + 4.9 - toe * .4 - kneel * 1.6); write(i + 2, end, tip, down); continue; }
          // руки: висят широко и качаются; правая держит дубинку; попадание — руки разлетаются; огонь — сбивает пламя с головы
          const swing = -st * side * (1 - A) * alive;
          end.set(side * (11.3 + stag * 2.4), anchor.y - 12.6 + stag * 3.5, 1.6 + swing * 4.2 - stag * 2.5); tip.set(end.x + side * .4, end.y - 3, end.z + (si ? 1.2 : .4));
          if (burn) { const f = t * 11 + side; end.set(side * (5 + Math.sin(f) * 1.6), sh.y + 2 + Math.sin(f * 1.3) * 2.6, 3 + Math.cos(f) * 2); tip.set(end.x - side * 1.4, end.y + 1.5, end.z + 1.5); }
          if (A > 0 && !si && !burn) { end.lerp(hE, A); t2.copy(hE).add(hT); tip.lerp(t2, A); }
          if (kneel > 0) { end.lerp(V(side * 8, anchor.y - 10 + topple * 6, 8 + topple * 6), kneel); tip.copy(end).add(V(0, -2.4, 2)); }
          ref.set(side * .62, -.15 + A * .4, -1);
          solve(anchor, end, length[i] * 1.06, length[i + 1] * 1.06, ref); write(i, anchor, mid); write(i + 1, mid, end); write(i + 2, end, tip, front); } }
      for (let i = 0; i < NB; i++) bones[i].toArray(palette, (index * NB + i) * 16);
      color.setRGB(1, 1, 1); if (burning) color.copy(char); if (frozen) color.lerp(ice, .58); if (hit > 0) color.lerp(white, Math.min(.35, hit * .35)); mesh.setColorAt(index, color);
      const sc = new T.Color(skin); toneArr[index * 3] = sc.r; toneArr[index * 3 + 1] = sc.g; toneArr[index * 3 + 2] = sc.b;
    }
    return { mesh, cap, pose, begin() { cap.count = 0; },
      upload(n) { mesh.count = n; if (n) { mesh.instanceMatrix.updateRange.count = n * 16; mesh.instanceColor.updateRange.count = n * 3; mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true; texture.needsUpdate = true; tone.needsUpdate = true; }
        if (cap.count) cap.instanceMatrix.needsUpdate = true; } };
  }
  return { create };
})();
