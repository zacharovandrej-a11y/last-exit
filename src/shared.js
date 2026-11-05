// ===== LAST EXIT — общий код сервера и клиента =====
const R = 900;              // радиус планеты
const TICK = 20, DT = 1 / TICK; // 20 обновлений в секунду
const SPEED = 175;          // скорость бега (ед/с)
const PR = 14;              // радиус персонажа
const MAXP = 10;            // игроков в матче
const VIEW = 0.95;          // угол обзора (рад) — кого присылать игроку

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const tang = (p, v) => norm(add(v, p, -dot(p, v)));
const anyTang = p => tang(p, Math.abs(p[0]) < .9 ? [1, 0, 0] : [0, 1, 0]);
const angDist = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
const slerpN = (a, b, t) => norm(add(mul(a, 1 - t), b, t));
// движение по большому кругу; заодно переносим касательный вектор f
function moveOn(p, d, s, f) {
  const w = s / R, c = Math.cos(w), sn = Math.sin(w);
  const np = norm(add(mul(p, c), d, sn));
  let nf = null;
  if (f) { const fd = dot(f, d); const nd = add(mul(d, c), p, -sn); nf = tang(np, add(add(f, d, -fd), nd, fd)); }
  return [np, nf];
}
function mkRng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const rndSphere = rnd => { const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(t), s * Math.sin(t), z]; };
function nearPt(rnd, c, r) { const u = anyTang(c), v = cross(c, u); const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r; return norm(add(add(mul(c, Math.cos(d)), u, Math.sin(d) * Math.cos(a)), v, Math.sin(d) * Math.sin(a))); }

// ===== Оружие =====
// ammo: 0 лёгкие, 1 тяжёлые, 2 дробь, 3 снайперские
const WEAPONS = [
  null,
  { n: 'Пистолет', dmg: 17, rate: 3.2, mag: 12, rel: 1.1, range: 480, spread: .035, ammo: 0, pel: 1, auto: false },
  { n: 'Автомат', dmg: 12, rate: 9, mag: 30, rel: 1.9, range: 560, spread: .075, ammo: 1, pel: 1, auto: true },
  { n: 'Дробовик', dmg: 9, rate: 1.1, mag: 5, rel: 2.3, range: 270, spread: .30, ammo: 2, pel: 8, auto: false },
  { n: 'Снайперка', dmg: 82, rate: .75, mag: 4, rel: 2.6, range: 1150, spread: .004, ammo: 3, pel: 1, auto: false },
  { n: 'ПП', dmg: 9, rate: 13, mag: 35, rel: 1.6, range: 400, spread: .11, ammo: 0, pel: 1, auto: true },
];
const RARITY = ['#b8bcc4', '#51cf66', '#4dabf7', '#cc5de8', '#ffc61a']; // серое → золотое
const RMULT = [1, 1.08, 1.16, 1.25, 1.35];
const AMMO_COL = ['#ffd43b', '#ff922b', '#ff6b6b', '#74c0fc'];
const AMMO_PACK = [24, 30, 10, 6];
const AMMO_MAX = [200, 200, 60, 40];

// ===== Волна кометы =====
const COMET_T0 = 25; // секунд спокойствия до удара
const WAVE = [[.5, 18, 14], [1.0, 18, 14], [1.57, 18, 14], [2.1, 18, 12], [2.55, 16, 12], [2.88, 14, 10], [3.06, 12, 8], [Math.PI, 12, 0]];
function waveTheta(t) {
  t -= COMET_T0; if (t < 0) return 0; let th = 0;
  for (const [to, dur, pause] of WAVE) { if (t < dur) return th + (to - th) * t / dur; t -= dur; th = to; if (t < pause) return th; t -= pause; }
  return Math.PI;
}
const waveDps = th => 4 + th * 5;

// ===== Мир (одинаковый у сервера и клиента) =====
const BIOMES = [
  { n: 'city', c: norm([1, .2, .3]), r: .42, col: '#a3aab3' },
  { n: 'base', c: norm([-1, -.2, .3]), r: .40, col: '#ab9d68' },
  { n: 'farm', c: norm([.2, 1, -.3]), r: .45, col: '#e2c35f' },
  { n: 'market', c: norm([-.2, -1, -.3]), r: .34, col: '#868d96' },
  { n: 'snow', c: norm([.3, -.3, 1]), r: .48, col: '#eef3f8' },
  { n: 'desert', c: norm([-.3, .3, -1]), r: .48, col: '#e6c88e' },
];
// shape: 0 круг, 1 прямоугольник. bl — блокирует пули
const OT = {
  tree: { s: 0, col: '#2f9e44', c2: '#237a33' }, pine: { s: 0, col: '#2b8a3e', c2: '#1b5e2a' },
  rock: { s: 0, col: '#8d8f96', c2: '#6e7078' }, hay: { s: 0, col: '#e7c14a', c2: '#c79f2c' },
  cactus: { s: 0, col: '#5c940d', c2: '#3f6b08' }, snowman: { s: 0, col: '#ffffff', c2: '#ced4da' },
  house: { s: 1, col: '#e8e2d0', c2: '#d9534f' }, house2: { s: 1, col: '#f2d7a0', c2: '#3d7ec7' },
  bunker: { s: 1, col: '#6b7048', c2: '#4e5334' }, barn: { s: 1, col: '#b5442e', c2: '#7a2b1c' },
  market: { s: 1, col: '#d6dbe0', c2: '#e94e77' }, car: { s: 1, col: '#3d8bd9', c2: '#2a6ab0' },
  crate: { s: 1, col: '#c08a45', c2: '#7b5528', hp: 45 }, wall: { s: 1, col: '#868e96', c2: '#5c636a' },
  igloo: { s: 0, col: '#e7f5ff', c2: '#a5d8ff' }, tent: { s: 1, col: '#c9a26b', c2: '#8f6d3e' },
};
function genWorld() {
  const rnd = mkRng(424242), objs = [];
  const free = (p, m) => { for (const o of objs) if (angDist(o.p, p) * R < m + o.rad) return false; return true; };
  function put(type, p, w, h) {
    const u = anyTang(p), v = cross(p, u), a = rnd() * 6.283;
    const o = { id: objs.length, type, p, u: norm(add(mul(u, Math.cos(a)), v, Math.sin(a))), w, h, rad: Math.hypot(w, h) / 2, sh: OT[type].s };
    o.v = cross(o.p, o.u); if (OT[type].hp) o.hp = OT[type].hp; objs.push(o); return o;
  }
  function many(type, cen, r, w, h, n, gap = 30) {
    for (let i = 0; i < n; i++) { const p = cen ? nearPt(rnd, cen, r) : rndSphere(rnd); if (free(p, Math.max(w, h) / 2 + gap)) put(type, p, w, h); }
  }
  const B = BIOMES;
  put('market', B[3].c, 260, 170);
  many('house', B[0].c, .36, 110, 90, 26); many('house2', B[0].c, .36, 72, 72, 18); many('car', B[0].c, .36, 46, 26, 10);
  many('bunker', B[1].c, .34, 120, 70, 9); many('wall', B[1].c, .34, 90, 18, 14); many('tent', B[1].c, .34, 60, 50, 8);
  many('barn', B[2].c, .38, 120, 80, 7); many('hay', B[2].c, .40, 30, 30, 30);
  many('car', B[3].c, .30, 46, 26, 26);
  many('pine', B[4].c, .44, 40, 40, 60); many('igloo', B[4].c, .40, 60, 60, 7); many('snowman', B[4].c, .40, 24, 24, 10);
  many('cactus', B[5].c, .44, 26, 26, 45); many('rock', B[5].c, .44, 40, 40, 25);
  many('crate', null, 0, 34, 34, 120, 40);
  many('tree', null, 0, 44, 44, 300); many('rock', null, 0, 36, 36, 70);
  return objs;
}
// столкновение точки p (радиус rr) с объектом; возвращает вектор выталкивания в ед. или null
function objPush(o, p, rr) {
  const rel = add(p, o.p, -1); const lx = dot(rel, o.u) * R, ly = dot(rel, o.v) * R;
  if (o.sh === 0) { const d = Math.hypot(lx, ly), m = o.w / 2 + rr; if (d < m) { if (d < 1e-6) return mul(o.u, m); return add(mul(o.u, lx / d * (m - d)), o.v, ly / d * (m - d)); } return null; }
  const hx = o.w / 2 + rr, hy = o.h / 2 + rr;
  if (Math.abs(lx) < hx && Math.abs(ly) < hy) { const px = hx - Math.abs(lx), py = hy - Math.abs(ly); return px < py ? mul(o.u, (Math.sign(lx) || 1) * px) : mul(o.v, (Math.sign(ly) || 1) * py); }
  return null;
}
function collide(objs, p) {
  for (const o of objs) {
    if (o.dead || dot(o.p, p) < .96) continue;
    const pu = objPush(o, p, PR); if (pu) p = norm(add(p, tang(p, pu), Math.hypot(...pu) / R));
  }
  return p;
}
// шаг движения (одинаковый на сервере и в предсказании клиента)
function stepMove(objs, p, mv, mul_ = 1) {
  const k = Math.min(1, Math.hypot(mv[0], mv[1], mv[2]));
  if (k < .05) return p;
  const d = tang(p, mv); const [np] = moveOn(p, d, SPEED * mul_ * k * DT); return collide(objs, np);
}
const i16 = v => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
const i8 = v => Math.max(-127, Math.min(127, Math.round(v * 127)));
