// ===== LAST EXIT — общий код сервера и клиента (плоская карта) =====
const HALF = 1500;          // карта 3000×3000, центр в (0,0), по краю вода
const TICK = 20, DT = 1 / TICK; // 20 обновлений в секунду
const SPEED = 175;          // скорость бега (ед/с)
const PR = 14;              // радиус персонажа
const MAXP = 10;            // игроков в матче
const VIEWD = 1150;         // кого присылать игроку (расстояние от камеры)

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
  { n: 'Пистолет', dmg: 14, rate: 2.6, mag: 12, rel: 1.1, range: 480, spread: .035, ammo: 0, pel: 1, auto: false },
  { n: 'Автомат', dmg: 9, rate: 7, mag: 30, rel: 1.9, range: 560, spread: .075, ammo: 1, pel: 1, auto: true },
  { n: 'Дробовик', dmg: 7, rate: 1, mag: 5, rel: 2.3, range: 270, spread: .30, ammo: 2, pel: 8, auto: false },
  { n: 'Снайперка', dmg: 66, rate: .6, mag: 4, rel: 2.6, range: 1150, spread: .004, ammo: 3, pel: 1, auto: false },
  { n: 'ПП', dmg: 7, rate: 10, mag: 35, rel: 1.6, range: 400, spread: .12, ammo: 0, pel: 1, auto: true },
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
};
function genWorld() {
  const rnd = mkRng(424242), objs = [];
  const free = (p, m) => { for (const o of objs) if (dist(o.p, p) < m + o.rad) return false; return true; };
  function put(type, p, w, h) {
    const a = rnd() * 6.2832, u = [Math.cos(a), Math.sin(a)];
    const o = { id: objs.length, type, p, a, u, v: perp(u), w, h, rad: Math.hypot(w, h) / 2, sh: OT[type].s };
    if (OT[type].hp) o.hp = OT[type].hp; objs.push(o); return o;
  }
  function many(type, cen, r, w, h, n, gap = 30) {
    for (let i = 0; i < n; i++) { const p = cen ? nearPt(rnd, cen, r) : rndMap(rnd, 80); if (inMap(p, 60) && free(p, Math.max(w, h) / 2 + gap)) put(type, p, w, h); }
  }
  const B = BIOMES;
  put('market', B[3].c, 260, 170);
  many('house', B[0].c, 330, 110, 90, 26); many('house2', B[0].c, 330, 72, 72, 18); many('car', B[0].c, 330, 46, 26, 10);
  many('bunker', B[1].c, 310, 120, 70, 9); many('wall', B[1].c, 310, 90, 18, 14); many('tent', B[1].c, 310, 60, 50, 8);
  many('barn', B[2].c, 350, 120, 80, 7); many('hay', B[2].c, 370, 30, 30, 30);
  many('car', B[3].c, 270, 46, 26, 26);
  many('pine', B[4].c, 390, 40, 40, 60); many('igloo', B[4].c, 360, 60, 60, 7); many('snowman', B[4].c, 360, 24, 24, 10);
  many('cactus', B[5].c, 300, 26, 26, 40); many('rock', B[5].c, 300, 40, 40, 22);
  many('crate', null, 0, 34, 34, 120, 40);
  many('tree', null, 0, 44, 44, 300); many('rock', null, 0, 36, 36, 70);
  return objs;
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
