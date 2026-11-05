// ===== LAST EXIT — общий код сервера и клиента (плоская карта) =====
const HALF = 2000;          // карта 4000×4000, центр в (0,0), по краю вода
const TICK = 20, DT = 1 / TICK; // 20 обновлений в секунду
const SPEED = 175;          // скорость бега (ед/с)
const PR = 14;              // радиус персонажа
const MAXP = 10;            // игроков в матче
const VIEWD = 1150;         // кого присылать игроку (расстояние от камеры)
const HEAR = 520;           // на каком расстоянии слышно шаги за стеной
const WALLH = 64, WALLT = 6, DOOR = 44; // высота и толщина стен, ширина двери

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = a => Math.hypot(a[0], a[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm = a => { const l = Math.hypot(a[0], a[1]); return l > 1e-9 ? [a[0] / l, a[1] / l] : [1, 0]; };
const dirTo = (a, b) => norm(sub(b, a));
const perp = a => [-a[1], a[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clampMap = (p, m = PR) => [Math.max(-HALF + m, Math.min(HALF - m, p[0])), Math.max(-HALF + m, Math.min(HALF - m, p[1]))];
function mkRng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const rndMap = (rnd, m = 60) => [(rnd() * 2 - 1) * (HALF - m), (rnd() * 2 - 1) * (HALF - m)];
function nearPt(rnd, c, r) { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * r; return [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]; }
const inMap = (p, m = 0) => Math.abs(p[0]) < HALF - m && Math.abs(p[1]) < HALF - m;

// ===== Оружие =====
// ammo: 0 лёгкие, 1 тяжёлые, 2 дробь, 3 снайперские
const WEAPONS = [
  null,
  { n: 'Пистолет', dmg: 22, rate: 2.6, mag: 12, rel: 1.1, range: 480, spread: .035, ammo: 0, pel: 1, auto: false },
  { n: 'Автомат', dmg: 15, rate: 7, mag: 30, rel: 1.9, range: 560, spread: .075, ammo: 1, pel: 1, auto: true },
  { n: 'Дробовик', dmg: 12, rate: 1, mag: 5, rel: 2.3, range: 270, spread: .30, ammo: 2, pel: 8, auto: false },
  { n: 'Снайперка', dmg: 95, rate: .6, mag: 4, rel: 2.6, range: 1150, spread: .004, ammo: 3, pel: 1, auto: false },
  { n: 'ПП', dmg: 11, rate: 10, mag: 35, rel: 1.6, range: 400, spread: .12, ammo: 0, pel: 1, auto: true },
];
const RARITY = ['#b8bcc4', '#51cf66', '#4dabf7', '#cc5de8', '#ffc61a']; // серое → золотое
const RMULT = [1, 1.08, 1.16, 1.25, 1.35];
const AMMO_COL = ['#ffd43b', '#ff922b', '#ff6b6b', '#74c0fc'];
const AMMO_PACK = [24, 30, 10, 6];
const AMMO_MAX = [200, 200, 60, 40];

// ===== Высадка и огонь =====
const DROP_T = 18;   // секунд летит транспорт над картой
const SHIP_V = 240;  // скорость транспорта
const FALL_T = 2.6;  // секунд на парашюте
const ZONE_T0 = 75;  // через сколько секунд огонь начинает сжиматься (сначала — побегать, собрать лут)
const R0 = 2900;     // начальный круг накрывает всю карту
// этапы: радиус безопасного круга, скорость фронта огня (всегда медленнее игрока 175), пауза после этапа, урон/с
const ZR = [1800, 1250, 850, 540, 300, 140, 45, 0];
const ZV = [30, 34, 38, 44, 52, 60, 68, 76];
const ZP = [30, 24, 18, 14, 12, 10, 8, 0];
const ZDPS = [3, 4, 6, 8, 11, 15, 20, 30];
const ZONE = ZR.map((r, k) => [r, Math.max(6, ((k ? ZR[k - 1] : R0) - r) / ZV[k]), ZP[k]]);
// центры кругов: каждый следующий — случайно внутри прошлого
function makePlan(rnd) {
  let c = nearPt(rnd, [0, 0], 450), prev = R0; const cs = [];
  for (let k = 0; k < ZONE.length; k++) {
    const r = ZONE[k][0];
    if (k > 0 && r > 0) { const d = (prev - r) * (.25 + .45 * rnd()), a = rnd() * 6.2832; c = clampMap([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d], 150); }
    cs.push(c); prev = r;
  }
  return cs;
}
function zoneAt(t, cs) {
  let c = [0, 0], rho = R0; t -= ZONE_T0;
  if (t < 0 || !cs) return { c, rho, k: 0, mv: 0, left: Math.max(0, -t), pre: 1 };
  for (let k = 0; k < ZONE.length; k++) {
    const [r, dur, pause] = ZONE[k];
    if (t < dur) { const f = t / dur; return { c: lerp(c, cs[k], f), rho: rho + (r - rho) * f, k, mv: 1, left: dur - t }; }
    t -= dur; c = cs[k]; rho = r;
    if (t < pause) return { c, rho, k: k + 1, mv: 0, left: pause - t };
    t -= pause;
  }
  return { c, rho: 0, k: ZONE.length, mv: 0, left: 0 };
}
// следующий круг (пунктир): показываем во время паузы и до начала
const nextZone = (z, cs) => (!z.mv && cs && z.k < ZONE.length) ? { c: cs[z.k], rho: ZONE[z.k][0] } : null;
const zoneDps = z => ZDPS[Math.min(ZDPS.length - 1, Math.max(0, z.mv ? z.k : z.k - 1))];
const outZone = (p, z) => !z.pre && dist(p, z.c) > z.rho;
const shipPos = (S, D, t) => add(S, D, SHIP_V * Math.max(0, Math.min(DROP_T, t)));

// ===== Мир (одинаковый у сервера и клиента) =====
const BIOMES = [
  { n: 'city', c: [-1060, -1040], r: 580, col: '#a3aab3' },
  { n: 'base', c: [1100, -1080], r: 500, col: '#ab9d68' },
  { n: 'farm', c: [-1120, 1060], r: 520, col: '#e2c35f' },
  { n: 'market', c: [40, -20], r: 400, col: '#868d96' },
  { n: 'snow', c: [1100, 1080], r: 540, col: '#eef3f8' },
  { n: 'desert', c: [0, 1440], r: 430, col: '#e6c88e' },
];
// shape: 0 круг, 1 прямоугольник; pass — пули пролетают; nc — не мешает ходить
const OT = {
  tree: { s: 0 }, pine: { s: 0 }, rock: { s: 0 }, hay: { s: 0 }, cactus: { s: 0 }, snowman: { s: 0 },
  house: { s: 0 }, car: { s: 1 }, crate: { s: 0, hp: 45 }, wall: { s: 1 }, igloo: { s: 0 }, tent: { s: 1 },
  bw: { s: 1 }, furn: { s: 1, pass: 1 }, barrel: { s: 0 }, fence: { s: 1, pass: 1 }, bush: { s: 0, nc: 1, pass: 1 },
};
// здания: план из комнат (BSP-деление), двери между комнатами, окна (пули и взгляд проходят, человек — нет)
// style: стены/пол/крыша; hall — большой зал без деления; maxRoom — размер комнаты
const BKIND = {
  house: { w: 150, h: 112, maxRoom: 80, doors: 2, style: 'plaster', floor: 'wood', roof: 'gable', furn: 'home' },
  villa: { w: 220, h: 160, maxRoom: 90, doors: 3, style: 'brick', floor: 'wood', roof: 'gable', furn: 'home' },
  apart: { w: 320, h: 210, maxRoom: 95, doors: 4, style: 'plaster2', floor: 'tile', roof: 'flat', furn: 'home' },
  office: { w: 280, h: 200, maxRoom: 100, doors: 3, style: 'concrete', floor: 'tile', roof: 'flat', furn: 'office' },
  barracks: { w: 300, h: 130, maxRoom: 90, doors: 3, style: 'concrete', floor: 'concrete', roof: 'flat', furn: 'barracks' },
  hangar: { w: 320, h: 220, maxRoom: 90, doors: 3, style: 'metal', floor: 'concrete', roof: 'gable', furn: 'store', hall: .66, door: 70 },
  bunker: { w: 130, h: 96, maxRoom: 70, doors: 1, style: 'concrete', floor: 'concrete', roof: 'flat', furn: 'store', slit: 1 },
  barn: { w: 200, h: 130, maxRoom: 80, doors: 2, style: 'wood', floor: 'dirt', roof: 'gable', furn: 'barn', hall: .7, door: 64 },
  market: { w: 400, h: 270, maxRoom: 90, doors: 4, style: 'concrete', floor: 'tile', roof: 'flat', furn: 'store', hall: .68, door: 60 },
  lodge: { w: 230, h: 160, maxRoom: 90, doors: 2, style: 'wood', floor: 'wood', roof: 'gable', furn: 'home' },
  adobe: { w: 200, h: 170, maxRoom: 85, doors: 2, style: 'adobe', floor: 'dirt', roof: 'flat', furn: 'home' },
};
const WIN = 30; // ширина окна
function genWorld() {
  const rnd = mkRng(424242), objs = [], blds = [];
  const free = (p, m) => { for (const o of objs) if (dist(o.p, p) < m + o.rad) return false; for (const b of blds) if (dist(b.p, p) < m + b.rad) return false; return true; };
  function putA(type, p, w, h, a) {
    const u = [Math.cos(a), Math.sin(a)];
    const o = { id: objs.length, type, p, a, u, v: perp(u), w, h, rad: Math.hypot(w, h) / 2, sh: OT[type].s };
    if (OT[type].hp) o.hp = OT[type].hp; if (OT[type].nc) o.nc = 1; if (OT[type].pass) o.pass = 1; objs.push(o); return o;
  }
  const put = (type, p, w, h) => putA(type, p, w, h, rnd() * 6.2832);
  function many(type, cen, r, w, h, n, gap = 30) {
    for (let i = 0; i < n; i++) { const p = cen ? nearPt(rnd, cen, r) : rndMap(rnd, 80); if (inMap(p, 60) && free(p, Math.max(w, h) / 2 + gap)) put(type, p, w, h); }
  }
  function building(kind, p) {
    const K = BKIND[kind], W2 = K.w / 2, H2 = K.h / 2, t = WALLT, D = DOOR, ED = K.door || DOOR;
    const a = Math.floor(rnd() * 4) * 1.5708 + (rnd() - .5) * .3, u = [Math.cos(a), Math.sin(a)], v = perp(u);
    const b = { id: blds.length, kind, p, a, u, v, w: K.w, h: K.h, rad: Math.hypot(K.w, K.h) / 2, walls: [], furn: [], doors: [], rooms: [], idoors: [] };
    const L = (x, y) => add(add(p, u, x), v, y);
    const seg = (x0, y0, x1, y1, win) => { const ln = Math.hypot(x1 - x0, y1 - y0); if (ln < 3) return; const hor = Math.abs(y1 - y0) < 1e-6;
      const o = putA('bw', L((x0 + x1) / 2, (y0 + y1) / 2), hor ? ln : t, hor ? t : ln, a); o.bid = b.id; o.lx = (x0 + x1) / 2; o.ly = (y0 + y1) / 2; o.hor = hor; o.len = ln;
      if (win) { o.win = 1; o.pass = 1; } b.walls.push(o.id); };
    // стена от s0 до s1 вдоль оси (hor: по x на высоте c; иначе по y на x=c) с проёмами [центр, ширина, окно?]
    const wallLine = (hor, c, s0, s1, gaps) => { let s = s0; for (const [g, w, win] of gaps.sort((m, n) => m[0] - n[0])) { const g0 = g - w / 2, g1 = g + w / 2; if (g0 > s) hor ? seg(s, c, g0, c) : seg(c, s, c, g0); if (win) hor ? seg(g0, c, g1, c, 1) : seg(c, g0, c, g1, 1); s = g1; } if (s1 > s) hor ? seg(s, c, s1, c) : seg(c, s, c, s1); };
    // 1) комнаты: делим прямоугольник пополам, пока комнаты большие
    const inner = { x0: -W2 + t, x1: W2 - t, y0: -H2 + t, y1: H2 - t }, splits = [];
    function split(r, depth, hallOk) {
      const w = r.x1 - r.x0, h = r.y1 - r.y0, along = w >= h; // делим по длинной стороне
      if (r.hall || (w <= K.maxRoom * 1.25 && h <= K.maxRoom * 1.25) || depth > 6) { b.rooms.push(r); return; }
      let f = .38 + rnd() * .24; if (hallOk && K.hall) f = K.hall;
      if (along) { const x = r.x0 + w * f; splits.push({ hor: false, c: x, s0: r.y0, s1: r.y1 }); const A = { x0: r.x0, x1: x - t / 2, y0: r.y0, y1: r.y1 }, B = { x0: x + t / 2, x1: r.x1, y0: r.y0, y1: r.y1 }; if (hallOk && K.hall) A.hall = 1; split(A, depth + 1); split(B, depth + 1); }
      else { const y = r.y0 + h * f; splits.push({ hor: true, c: y, s0: r.x0, s1: r.x1 }); const A = { x0: r.x0, x1: r.x1, y0: r.y0, y1: y - t / 2 }, B = { x0: r.x0, x1: r.x1, y0: y + t / 2, y1: r.y1 }; if (hallOk && K.hall) A.hall = 1; split(A, depth + 1); split(B, depth + 1); }
    }
    split(inner, 0, true);
    // внутренние стены с дверью (каждое деление — один проём → все комнаты связаны)
    for (const sp of splits) {
      // где к этой стене примыкают другие перегородки — дверь туда не ставим
      const bad = splits.filter(o => o !== sp && o.hor !== sp.hor && (Math.abs(o.s0 - sp.c) < 8 || Math.abs(o.s1 - sp.c) < 8) && o.c > sp.s0 && o.c < sp.s1).map(o => o.c);
      // место для двери: подальше от примыканий (хватает 14 ед., чтобы человек прошёл)
      let g = (sp.s0 + sp.s1) / 2, best = -1; const g0 = sp.s0 + D / 2 + 2, g1 = sp.s1 - D / 2 - 2;
      for (let k = 0; k < 24; k++) { const c = g0 + (g1 - g0) * ((k + rnd()) / 24), m = Math.min(40, ...bad.map(x => Math.abs(x - c)), 99) + rnd() * 8; if (m > best) { best = m; g = c; } }
      wallLine(sp.hor, sp.c, sp.s0, sp.s1, [[g, D, 0]]);
      b.idoors.push(sp.hor ? [g, sp.c] : [sp.c, g]);
    }
    // 2) наружные стены: двери и окна
    const sides = [[true, H2 - t / 2, -W2, W2, 1], [true, -H2 + t / 2, -W2, W2, -1], [false, -W2 + t / 2, -H2 + t, H2 - t, -1], [false, W2 - t / 2, -H2 + t, H2 - t, 1]];
    const doorsAt = sides.map(() => []);
    const sk = sides.map(sd => (sd[3] - sd[2]) + (rnd() - .5) * 40), order = [0, 1, 2, 3].sort((i, j) => sk[j] - sk[i] || i - j); // без рандома внутри sort — мир одинаковый везде
    for (let k = 0; k < K.doors; k++) doorsAt[order[k % 4]].push(1);
    sides.forEach(([hor, c, s0, s1, sg], si) => {
      const joins = splits.filter(o => o.hor !== hor && (Math.abs(o.s0 - (hor ? c - sg * t / 2 : c - sg * t / 2)) < 10 || Math.abs(o.s1 - (c - sg * t / 2)) < 10)).map(o => o.c);
      const gaps = [], clear = g => joins.every(j => Math.abs(j - g) > 24) && gaps.every(([x, w]) => Math.abs(x - g) > w / 2 + 20) && g - 26 > s0 + 10 && g + 26 < s1 - 10;
      for (const _ of doorsAt[si]) { for (let k = 0; k < 30; k++) { const g = s0 + ED / 2 + 14 + rnd() * (s1 - s0 - ED - 28); if (clear(g)) { gaps.push([g, ED, 0]); const lp = hor ? [g, c] : [c, g], n = hor ? [0, sg] : [sg, 0]; b.doors.push({ i: L(lp[0] - n[0] * 28, lp[1] - n[1] * 28), o: L(lp[0] + n[0] * 30, lp[1] + n[1] * 30) }); break; } } }
      // окна через каждые ~70
      // окна: равномерно в свободных промежутках между дверями и перегородками
      const ww = K.slit ? 22 : WIN, blk = [[s0 - 1, s0 + 14], [s1 - 14, s1 + 1], ...gaps.map(([g, w]) => [g - w / 2 - 12, g + w / 2 + 12]), ...joins.map(j => [j - 19, j + 19])].sort((m, n) => m[0] - n[0]);
      let cur = blk[0][1]; for (const [x0, x1] of blk.slice(1)) { if (x0 > cur) { const lf = x0 - cur; if (lf >= ww + 6) { const n = Math.max(1, Math.floor(lf / 56)); for (let k = 0; k < n; k++) gaps.push([cur + (k + .5) * lf / n, ww, 1]); } } cur = Math.max(cur, x1); }
      wallLine(hor, c, s0, s1, gaps);
    });
    // 3) мебель по комнатам — у стен, не перекрывая двери
    const doorPts = b.idoors.concat(b.doors.map(d => { const r = sub(lerp(d.i, d.o, .5), p); return [dot(r, u), dot(r, v)]; }));
    const fu = (fk, x, y, w, h) => { const lp = [x, y]; if (doorPts.some(d => dist(d, lp) < Math.max(w, h) / 2 + 30)) return null; const o = putA(fk === 'crate' ? 'crate' : fk === 'hay' ? 'hay' : fk === 'barrel' ? 'barrel' : 'furn', L(x, y), w, h, a); o.fk = fk; o.bid = b.id; b.furn.push(o.id); return o; };
    const SETS = { home: [['bed', 24, 40], ['table', 30, 20], ['sofa', 40, 16], ['shelf', 34, 10], ['desk', 28, 14]], office: [['desk', 30, 16], ['desk', 30, 16], ['shelf', 40, 10], ['table', 40, 22]], barracks: [['bunk', 20, 40], ['bunk', 20, 40], ['shelf', 30, 10], ['crate', 30, 30]], store: [['shelf', 50, 12], ['crate', 30, 30], ['barrel', 18, 18]], barn: [['hay', 30, 30], ['crate', 30, 30], ['hay', 30, 30]] };
    for (const r of b.rooms) {
      const set = SETS[K.furn], rw = r.x1 - r.x0, rh = r.y1 - r.y0;
      if (r.hall) { // зал: ряды стеллажей
        const rowsY = Math.floor((rh - 60) / 56); for (let i = 0; i < rowsY; i++) { const y = r.y0 + 45 + i * 56; for (let x = r.x0 + 50; x < r.x1 - 50; x += 90) fu(K.furn === 'barn' ? 'hay' : rnd() < .7 ? 'shelf' : 'crate', x, y, K.furn === 'barn' ? 30 : 60, K.furn === 'barn' ? 30 : 12); } continue; }
      const n = 1 + Math.floor(rnd() * 2.5);
      for (let i = 0; i < n; i++) { const [fk, fw, fh] = set[Math.floor(rnd() * set.length)], side = Math.floor(rnd() * 4);
        const x = side < 2 ? r.x0 + fw / 2 + 4 + rnd() * Math.max(0, rw - fw - 8) : side === 2 ? r.x0 + fh / 2 + 3 : r.x1 - fh / 2 - 3;
        const y = side >= 2 ? r.y0 + fw / 2 + 4 + rnd() * Math.max(0, rh - fw - 8) : side === 0 ? r.y0 + fh / 2 + 3 : r.y1 - fh / 2 - 3;
        if (side >= 2) fu(fk, x, y, fh, fw); else fu(fk, x, y, fw, fh); }
    }
    // граф комнат: какие комнаты соединяет каждая дверь
    const rIn = (r, q, m) => q[0] > r.x0 - m && q[0] < r.x1 + m && q[1] > r.y0 - m && q[1] < r.y1 + m;
    b.adj = []; for (const dp of b.idoors) { const rs = b.rooms.map((r, i) => rIn(r, dp, t + 2) ? i : -1).filter(i => i >= 0); if (rs.length >= 2) b.adj.push({ a: rs[0], b: rs[1], p: dp }); }
    for (const d of b.doors) { const r_ = sub(d.i, p), lp = [dot(r_, u), dot(r_, v)]; d.room = Math.max(0, b.rooms.findIndex(r => rIn(r, lp, 4))); }
    // проверка: во все комнаты можно зайти; если мебель мешает — убираем её
    const allOk = () => { const S = 6, X = b.w / 2 + 30, Y = b.h / 2 + 30, nx = Math.ceil(2 * X / S), ny = Math.ceil(2 * Y / S), ob = b.walls.map(i => objs[i]).concat(b.furn.map(i => objs[i]).filter(o => !o.gone));
      const ok = new Uint8Array(nx * ny), seen = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = -X + i * S, y = -Y + j * S; if (Math.abs(x) > b.w / 2 + 2 || Math.abs(y) > b.h / 2 + 2) { ok[j * nx + i] = 1; continue; } const q = L(x, y); ok[j * nx + i] = ob.some(o => Math.abs(o.p[0] - q[0]) < o.rad + PR + 4 && Math.abs(o.p[1] - q[1]) < o.rad + PR + 4 && objPush(o, q, PR + 3)) ? 0 : 1; }
      const Q = [0]; seen[0] = 1; while (Q.length) { const k = Q.pop(), i = k % nx, j = (k / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = i + di, c = j + dj; if (a2 < 0 || c < 0 || a2 >= nx || c >= ny) continue; const q = c * nx + a2; if (!seen[q] && ok[q]) { seen[q] = 1; Q.push(q); } } }
      return b.rooms.every(r => { for (let j = Math.ceil((r.y0 + Y) / S); -Y + j * S < r.y1; j++) for (let i = Math.ceil((r.x0 + X) / S); -X + i * S < r.x1; i++) if (seen[j * nx + i]) return true; return false; }); };
    for (let k = b.furn.length - 1; k >= 0 && !allOk(); k--) { const o = objs[b.furn[k]]; o.gone = 1; }
    blds.push(b); return b;
  }
  function manyB(kinds, cen, r, n, tries = 30) { for (let i = 0; i < n; i++) { const kind = kinds[Math.floor(rnd() * kinds.length)], K = BKIND[kind], m = Math.hypot(K.w, K.h) / 2 + 30;
    for (let k = 0; k < tries; k++) { const p = cen ? nearPt(rnd, cen, r) : rndMap(rnd, m); if (inMap(p, m) && free(p, m)) { building(kind, p); break; } } } }
  const B = BIOMES;
  building('market', B[3].c);
  manyB(['apart', 'office', 'apart', 'villa', 'house'], B[0].c, 520, 11); manyB(['house', 'villa'], B[0].c, 560, 6);
  manyB(['barracks', 'hangar', 'barracks'], B[1].c, 440, 5); manyB(['bunker'], B[1].c, 460, 5);
  manyB(['barn'], B[2].c, 470, 3); manyB(['house', 'villa'], B[2].c, 500, 4);
  manyB(['office', 'house'], B[3].c, 380, 3);
  manyB(['lodge'], B[4].c, 480, 4); manyB(['adobe'], B[5].c, 380, 5);
  manyB(['house', 'villa', 'house', 'adobe', 'lodge'], null, 0, 16, 10); // одиночные дома по карте
  // улица: машины, бочки, заборы, кусты
  many('car', B[0].c, 560, 46, 26, 16); many('car', B[3].c, 380, 46, 26, 20); many('barrel', B[1].c, 480, 18, 18, 24); many('barrel', B[3].c, 380, 18, 18, 10);
  many('wall', B[1].c, 480, 90, 18, 12); many('tent', B[1].c, 480, 60, 50, 8);
  many('hay', B[2].c, 500, 30, 30, 26); many('fence', B[2].c, 500, 90, 6, 18);
  many('pine', B[4].c, 520, 40, 40, 80); many('snowman', B[4].c, 500, 24, 24, 14);
  many('cactus', B[5].c, 420, 26, 26, 50); many('rock', B[5].c, 420, 40, 40, 26);
  many('crate', null, 0, 34, 34, 90, 40);
  many('tree', null, 0, 44, 44, 420); many('rock', null, 0, 36, 36, 110); many('bush', null, 0, 34, 34, 260, 10);
  // убираем «лишнюю» мебель и перенумеровываем
  const keep = objs.filter(o => !o.gone), idm = new Map(); objs.length = 0; keep.forEach((o, i) => { idm.set(o.id, i); o.id = i; objs.push(o); });
  for (const b of blds) { b.walls = b.walls.map(i => idm.get(i)); b.furn = b.furn.filter(i => idm.has(i)).map(i => idm.get(i)); }
  objs.blds = blds; gridBuild(objs);
  return objs;
}
// сетка для быстрых проверок (какие объекты рядом)
const GC = 100;
function gridBuild(objs) {
  const g = new Map();
  for (const o of objs) { const r = o.rad; for (let cx = Math.floor((o.p[0] - r) / GC); cx <= Math.floor((o.p[0] + r) / GC); cx++) for (let cy = Math.floor((o.p[1] - r) / GC); cy <= Math.floor((o.p[1] + r) / GC); cy++) { const k = cx * 1000 + cy; let a = g.get(k); if (!a) g.set(k, a = []); a.push(o); } }
  objs.grid = g; objs.stamp = 0;
}
function nearObjs(objs, p, r) {
  const out = [], st = ++objs.stamp;
  for (let cx = Math.floor((p[0] - r) / GC); cx <= Math.floor((p[0] + r) / GC); cx++) for (let cy = Math.floor((p[1] - r) / GC); cy <= Math.floor((p[1] + r) / GC); cy++) { const a = objs.grid.get(cx * 1000 + cy); if (a) for (const o of a) if (o._s !== st) { o._s = st; out.push(o); } }
  return out;
}
// объекты вдоль луча (клетки сетки, через которые он проходит)
function rayObjs(objs, a, d, len) {
  const out = [], st = ++objs.stamp; let x = Math.floor(a[0] / GC), y = Math.floor(a[1] / GC);
  const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, tdx = Math.abs(GC / (d[0] || 1e-9)), tdy = Math.abs(GC / (d[1] || 1e-9));
  let tx = ((sx > 0 ? (x + 1) * GC : x * GC) - a[0]) / (d[0] || 1e-9), ty = ((sy > 0 ? (y + 1) * GC : y * GC) - a[1]) / (d[1] || 1e-9);
  for (let i = 0; i < 80; i++) { const c = objs.grid.get(x * 1000 + y); if (c) for (const o of c) if (o._s !== st) { o._s = st; out.push(o); }
    if (Math.min(tx, ty) > len) break; if (tx < ty) { tx += tdx; x += sx; } else { ty += tdy; y += sy; } }
  return out;
}
// в каком здании точка (индекс или -1)
function bldAt(blds, p) {
  if (!blds) return -1;
  for (const b of blds) { if (Math.abs(p[0] - b.p[0]) > b.rad || Math.abs(p[1] - b.p[1]) > b.rad) continue; const r = sub(p, b.p); if (Math.abs(dot(r, b.u)) < b.w / 2 && Math.abs(dot(r, b.v)) < b.h / 2) return b.id; }
  return -1;
}
// видно ли точку b из точки a: стены загораживают, окна — нет; внутрь чужого здания не видно (крыша)
function canSee(objs, a, b, ba, bb) {
  if (bb >= 0 && bb !== ba) return false;
  const d = dist(a, b); if (d < 1) return true; const dir = norm(sub(b, a));
  for (const o of rayObjs(objs, a, dir, d)) { if (o.type !== 'bw' || o.win) continue; if (rayObj(a, dir, o) < d - 2) return false; }
  return true;
}
// столкновение точки p (радиус rr) с объектом; вектор выталкивания или null
function objPush(o, p, rr) {
  const rel = sub(p, o.p), lx = dot(rel, o.u), ly = dot(rel, o.v);
  if (o.sh === 0) { const d = Math.hypot(lx, ly), m = o.w / 2 + rr; if (d < m) { if (d < 1e-6) return mul(o.u, m); return mul(rel, (m - d) / d); } return null; }
  const hx = o.w / 2 + rr, hy = o.h / 2 + rr;
  if (Math.abs(lx) < hx && Math.abs(ly) < hy) { const px = hx - Math.abs(lx), py = hy - Math.abs(ly); return px < py ? mul(o.u, (Math.sign(lx) || 1) * px) : mul(o.v, (Math.sign(ly) || 1) * py); }
  return null;
}
function collide(objs, p) {
  for (const o of nearObjs(objs, p, PR + 4)) {
    if (o.dead || o.nc) continue; const lim = o.rad + PR + 2;
    if (Math.abs(o.p[0] - p[0]) > lim || Math.abs(o.p[1] - p[1]) > lim) continue;
    const pu = objPush(o, p, PR); if (pu) p = add(p, pu);
  }
  return clampMap(p);
}
// шаг движения (одинаковый на сервере и в предсказании клиента)
function stepMove(objs, p, mv, m = 1) {
  const k = Math.min(1, len(mv));
  if (k < .05) return p;
  return collide(objs, add(p, norm(mv), SPEED * m * k * DT));
}
// луч из o (единичное направление d): расстояние до круга / прямоугольника или Infinity
function rayCircle(o, d, c, r) { const f = sub(o, c), b = dot(f, d), cc = dot(f, f) - r * r; if (cc <= 0) return 0; const disc = b * b - cc; if (disc < 0 || b > 0) return Infinity; return -b - Math.sqrt(disc); }
function rayObj(o, d, ob) {
  if (ob.sh === 0) return rayCircle(o, d, ob.p, ob.w / 2 * .85);
  const rel = sub(o, ob.p); let t0 = -Infinity, t1 = Infinity;
  for (const [oo, dd, h] of [[dot(rel, ob.u), dot(d, ob.u), ob.w / 2], [dot(rel, ob.v), dot(d, ob.v), ob.h / 2]]) {
    if (Math.abs(dd) < 1e-9) { if (Math.abs(oo) > h) return Infinity; continue; }
    let a = (-h - oo) / dd, b = (h - oo) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1 || t1 < 0) return Infinity; return Math.max(0, t0);
}
const q16 = v => Math.max(-32767, Math.min(32767, Math.round(v * 10))); // координата → int16 (точность 0.1)
const i8 = v => Math.max(-127, Math.min(127, Math.round(v * 127)));
