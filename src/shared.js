// ===== LAST EXIT — общий код сервера и клиента (плоская карта) =====
const HALF = 1500;          // карта 3000×3000, центр в (0,0), по краю вода
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
const DROP_T = 14;   // секунд летит транспорт над картой
const SHIP_V = 220;  // скорость транспорта
const FALL_T = 2.6;  // секунд на парашюте
const ZONE_T0 = 30;  // через сколько секунд огонь начинает сжиматься
const R0 = 2150;     // начальный круг накрывает всю карту
// этапы: радиус безопасного круга, скорость фронта огня (всегда медленнее игрока 175), пауза после этапа, урон/с
const ZR = [1350, 950, 640, 400, 230, 110, 35, 0];
const ZV = [30, 34, 38, 44, 52, 60, 68, 76];
const ZP = [20, 16, 14, 12, 12, 10, 8, 0];
const ZDPS = [3, 4, 6, 8, 11, 15, 20, 30];
const ZONE = ZR.map((r, k) => [r, Math.max(6, ((k ? ZR[k - 1] : R0) - r) / ZV[k]), ZP[k]]);
// центры кругов: каждый следующий — случайно внутри прошлого
function makePlan(rnd) {
  let c = nearPt(rnd, [0, 0], 350), prev = R0; const cs = [];
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
  { n: 'city', c: [-780, -780], r: 390, col: '#a3aab3' },
  { n: 'base', c: [820, -820], r: 370, col: '#ab9d68' },
  { n: 'farm', c: [-850, 780], r: 410, col: '#e2c35f' },
  { n: 'market', c: [40, -20], r: 300, col: '#868d96' },
  { n: 'snow', c: [820, 800], r: 420, col: '#eef3f8' },
  { n: 'desert', c: [0, 1080], r: 330, col: '#e6c88e' },
];
// shape: 0 круг, 1 прямоугольник
const OT = {
  tree: { s: 0 }, pine: { s: 0 }, rock: { s: 0 }, hay: { s: 0 }, cactus: { s: 0 }, snowman: { s: 0 },
  house: { s: 0 }, house2: { s: 1 }, bunker: { s: 1 }, barn: { s: 1 }, market: { s: 1 }, car: { s: 1 },
  crate: { s: 0, hp: 45 }, wall: { s: 1 }, igloo: { s: 0 }, tent: { s: 1 },
  bw: { s: 1 }, furn: { s: 1, pass: 1 }, // стена здания; мебель (пули пролетают)
};
// здания: внутри можно ходить, стены — отдельные прямоугольники; крыша скрывает, что внутри
const BKIND = {
  house: { w: 120, h: 96, doors: 1, part: 1 }, house2: { w: 92, h: 84, doors: 1 }, barn: { w: 150, h: 104, doors: 2, door: 64 },
  market: { w: 270, h: 180, doors: 2, door: 56 }, bunker: { w: 112, h: 84, doors: 1 },
};
function genWorld() {
  const rnd = mkRng(424242), objs = [], blds = [];
  const free = (p, m) => { for (const o of objs) if (dist(o.p, p) < m + o.rad) return false; for (const b of blds) if (dist(b.p, p) < m + b.rad) return false; return true; };
  function putA(type, p, w, h, a) {
    const u = [Math.cos(a), Math.sin(a)];
    const o = { id: objs.length, type, p, a, u, v: perp(u), w, h, rad: Math.hypot(w, h) / 2, sh: OT[type].s };
    if (OT[type].hp) o.hp = OT[type].hp; objs.push(o); return o;
  }
  const put = (type, p, w, h) => putA(type, p, w, h, rnd() * 6.2832);
  function many(type, cen, r, w, h, n, gap = 30) {
    for (let i = 0; i < n; i++) { const p = cen ? nearPt(rnd, cen, r) : rndMap(rnd, 80); if (inMap(p, 60) && free(p, Math.max(w, h) / 2 + gap)) put(type, p, w, h); }
  }
  function building(kind, p) {
    const K = BKIND[kind], W2 = K.w / 2, H2 = K.h / 2, t = WALLT, D = K.door || DOOR;
    const a = Math.floor(rnd() * 4) * 1.5708 + (rnd() - .5) * .5, u = [Math.cos(a), Math.sin(a)], v = perp(u);
    const b = { id: blds.length, kind, p, a, u, v, w: K.w, h: K.h, rad: Math.hypot(K.w, K.h) / 2, walls: [], furn: [], doors: [] };
    const L = (x, y) => add(add(p, u, x), v, y);
    const seg = (x0, y0, x1, y1) => { const len_ = Math.hypot(x1 - x0, y1 - y0); if (len_ < 4) return; const hor = Math.abs(y1 - y0) < 1e-6;
      const o = putA('bw', L((x0 + x1) / 2, (y0 + y1) / 2), hor ? len_ : t, hor ? t : len_, a); o.bid = b.id; o.lx = (x0 + x1) / 2; o.ly = (y0 + y1) / 2; o.hor = hor; b.walls.push(o.id); };
    const hwall = (y, gaps) => { let x = -W2; for (const g of gaps.sort((m, n) => m - n)) { seg(x, y, g - D / 2, y); x = g + D / 2; } seg(x, y, W2, y); };
    const fd = (rnd() - .5) * (K.w - D - 40), bd = K.doors > 1 ? (K.door ? fd : (rnd() - .5) * (K.w - D - 40)) : null;
    hwall(H2 - t / 2, [fd]); hwall(-H2 + t / 2, bd === null ? [] : [bd]);
    seg(-W2 + t / 2, -H2 + t, -W2 + t / 2, H2 - t); seg(W2 - t / 2, -H2 + t, W2 - t / 2, H2 - t);
    b.doors.push({ i: L(fd, H2 - 26), o: L(fd, H2 + 26) }); if (bd !== null) b.doors.push({ i: L(bd, -H2 + 26), o: L(bd, -H2 - 26) });
    const fu = (fk, x, y, w, h) => { const o = putA('furn', L(x, y), w, h, a); o.fk = fk; o.bid = b.id; b.furn.push(o.id); };
    if (kind === 'house') { // перегородка с проходом: две комнаты
      const px = fd > 0 ? -W2 * .3 : W2 * .3; seg(px, -H2 + t, px, -D / 2); seg(px, D / 2, px, H2 - t);
      fu('bed', px < 0 ? -W2 + 22 : W2 - 22, -H2 + 30, 22, 38); // кровать — в маленькой комнате
      fu('table', px < 0 ? W2 - 30 : -W2 + 30, -H2 + 24, 26, 18);
    } else if (kind === 'house2') { fu('table', 0, -H2 + 22, 34, 14); fu('shelf', W2 - 12, 0, 10, 34); }
    else if (kind === 'market') { for (const y of [-42, 0]) fu('shelf', -40, y, 130, 10); fu('shelf', 70, -42, 60, 10); fu('table', 90, H2 - 40, 44, 16); }
    else if (kind === 'barn') { for (let i = 0; i < 3; i++) { const o = putA('hay', L(-W2 + 26 + i * 32, -H2 + 26), 30, 30, a); o.bid = b.id; b.furn.push(o.id); } }
    else if (kind === 'bunker') { for (const x of [-W2 + 22, W2 - 22]) { const o = putA('crate', L(x, -H2 + 22), 34, 34, a); o.bid = b.id; } }
    blds.push(b); return b;
  }
  function manyB(kind, cen, r, n) { const K = BKIND[kind], m = Math.hypot(K.w, K.h) / 2 + 26; for (let i = 0; i < n; i++) { const p = nearPt(rnd, cen, r); if (inMap(p, m) && free(p, m)) building(kind, p); } }
  const B = BIOMES;
  building('market', B[3].c);
  manyB('house', B[0].c, 330, 22); manyB('house2', B[0].c, 330, 14); many('car', B[0].c, 330, 46, 26, 10);
  manyB('bunker', B[1].c, 310, 7); many('wall', B[1].c, 310, 90, 18, 14); many('tent', B[1].c, 310, 60, 50, 8);
  manyB('barn', B[2].c, 350, 5); many('hay', B[2].c, 370, 30, 30, 30); manyB('house', B[2].c, 360, 4);
  many('car', B[3].c, 270, 46, 26, 26);
  many('pine', B[4].c, 390, 40, 40, 60); many('igloo', B[4].c, 360, 60, 60, 7); many('snowman', B[4].c, 360, 24, 24, 10);
  many('cactus', B[5].c, 300, 26, 26, 40); many('rock', B[5].c, 300, 40, 40, 22); manyB('house2', B[5].c, 280, 4);
  for (let i = 0; i < 40; i++) { const p = rndMap(rnd, 200); const K = BKIND.house; const m = Math.hypot(K.w, K.h) / 2 + 26; if (free(p, m)) building(rnd() < .5 ? 'house' : 'house2', p); } // одиночные дома по карте
  many('crate', null, 0, 34, 34, 120, 40);
  many('tree', null, 0, 44, 44, 300); many('rock', null, 0, 36, 36, 70);
  objs.blds = blds;
  return objs;
}
// в каком здании точка (индекс или -1)
function bldAt(blds, p) {
  if (!blds) return -1;
  for (const b of blds) { if (Math.abs(p[0] - b.p[0]) > b.rad || Math.abs(p[1] - b.p[1]) > b.rad) continue; const r = sub(p, b.p); if (Math.abs(dot(r, b.u)) < b.w / 2 && Math.abs(dot(r, b.v)) < b.h / 2) return b.id; }
  return -1;
}
// видно ли точку b из точки a: стены зданий загораживают; внутрь чужого здания не видно (крыша)
function canSee(objs, a, b, ba, bb) {
  if (bb >= 0 && bb !== ba) return false;
  const d = dist(a, b); if (d < 1) return true; const dir = norm(sub(b, a));
  for (const B of objs.blds) {
    // отрезок далеко от здания — пропускаем
    const r = sub(B.p, a), t = Math.max(0, Math.min(d, dot(r, dir))), q = add(a, dir, t); if (dist(q, B.p) > B.rad + 4) continue;
    for (const id of B.walls) { const o = objs[id]; if (rayObj(a, dir, o) < d - 2) return false; }
  }
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
  for (const o of objs) {
    if (o.dead) continue; const lim = o.rad + PR + 2;
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
