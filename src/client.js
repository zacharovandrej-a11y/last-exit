'use strict';
// ===== LAST EXIT — клиент =====
let PERF = location.hash === '#perf'; addEventListener('hashchange', () => { PERF = location.hash === '#perf'; });
const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ff922b', '#3bc9db', '#f783ac', '#a9e34b', '#e9ecef'];
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, CX = 0, CY = 0;
let objs = genWorld();
const CAM_F = G3.CAM_F, CAM_R = G3.CAM_R; // «вверх» и «вправо» экрана на карте
// ===== состояние сети =====
let ws = null, myId = 255, camId = 255, phase = 0, timer = 0, aliveN = 0, matchT = 0;
let priv = null, names = {}, loot = new Map(), lobbyNames = [];
let plan = null, shipS = [0, 0], shipD = [1, 0], myAir = 0, zone = zoneAt(0, null), ash = [], wantJump = false;
let ents = {}, lastTick = 0, tickOff = null, snapCount = 0, snapRate = 0;
let pending = [], seq = 0, predP = null, prevP = null, tickAcc = 0, outBuf = [];
let camP = [0, 0];
let tracers = [], fx = [], feed = [], nums = [], marks = [], dead = null, endInfo = null;
let started = false, sound = null, menuOpen = false;

// ===== рисование =====
function mk(w, h, f) { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d'); g.scale(2, 2); g.translate(w / 2, h / 2); g.lineJoin = 'round'; f(g, w, h); return c; }
function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
const FLAME = mk(24, 30, g => { const gr = g.createRadialGradient(0, 4, 1, 0, 2, 13); gr.addColorStop(0, '#fff3bf'); gr.addColorStop(.35, '#ffd43b'); gr.addColorStop(.7, '#ff6b1a'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(10, 0, 0, 13); g.quadraticCurveTo(-10, 0, 0, -14); g.fill(); });
function gunShape(g, w, len, col) {
  const L = [0, .9, 1.6, 1.45, 2.1, 1.15][w] * len, T = w === 3 ? .34 : .26;
  g.fillStyle = '#2b2b2b'; g.fillRect(len * .35, -len * T / 2, L, len * T);
  g.fillStyle = col; g.fillRect(len * .35, -len * T / 2, L * .35, len * T);
  if (w === 4) { g.fillStyle = '#111'; g.fillRect(len * .7, -len * .22, len * .55, len * .14); }
  if (w === 2 || w === 5) { g.fillStyle = '#2b2b2b'; g.fillRect(len * .9, len * .1, len * .2, len * .35); }
}
let VIG = null; // затемнение по краям экрана
function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; CX = W / 2; CY = H / 2;
  VIG = document.createElement('canvas'); VIG.width = 256; VIG.height = Math.max(64, Math.round(256 * H / W)); const g = VIG.getContext('2d'), gr = g.createRadialGradient(128, VIG.height / 2, VIG.height * .35, 128, VIG.height / 2, 150);
  gr.addColorStop(0, 'rgba(20,12,4,0)'); gr.addColorStop(1, 'rgba(20,12,4,.42)'); g.fillStyle = gr; g.fillRect(0, 0, 256, VIG.height); }
addEventListener('resize', () => { resize(); layout(); G3.resize(W, H); });

// ===== ввод =====
const keys = {}; let mouse = { x: 0, y: 0, down: false, used: false }, sticks = { L: null, R: null, F: null }, touchUI = false, aimT = 0;
const fireOn = () => touchUI && phase === 1 && myId !== 255 && !dead && !myAir && predP;
let wantSlot = -1, wantReload = false, wantHeal = false, wantPick = false, bigMap = false;
addEventListener('keydown', e => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; keys[e.code] = 1; if (e.code === 'Escape') { menuOpen = started && !menuOpen; return; } if (e.code === 'Digit1') wantSlot = 0; if (e.code === 'Digit2') wantSlot = 1; if (e.code === 'KeyR') wantReload = true; if (e.code === 'KeyE' || e.code === 'KeyF') wantPick = true; if (e.code === 'Space') wantJump = true; if (e.code === 'KeyQ' || e.code === 'KeyH') wantHeal = true; if (e.code === 'KeyM') bigMap = !bigMap; if (e.code === 'Tab') { e.preventDefault(); specNext(); } });
addEventListener('keyup', e => { keys[e.code] = 0; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; });
cv.addEventListener('mousedown', e => { if (uiHit(e.clientX, e.clientY)) return; mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('wheel', () => { wantSlot = priv ? 1 - priv.cur : -1; });
cv.addEventListener('touchstart', e => { touchUI = true; initSound();
  for (const t of e.changedTouches) {
    const fb = ui('fire'); if (!menuOpen && !bigMap && fb && fireOn() && Math.hypot(t.clientX - fb.cx, t.clientY - fb.cy) < fb.r * 1.25) { if (!sticks.F) sticks.F = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }; continue; }
    if (uiHit(t.clientX, t.clientY)) continue; const s = t.clientX < W / 2 ? 'L' : 'R'; if (!sticks[s]) sticks[s] = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }; }
  e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) for (const s of ['L', 'R', 'F']) if (sticks[s] && sticks[s].id === t.identifier) { sticks[s].x = t.clientX; sticks[s].y = t.clientY; } e.preventDefault(); }, { passive: false });
const tend = e => { for (const t of e.changedTouches) for (const s of ['L', 'R', 'F']) if (sticks[s] && sticks[s].id === t.identifier) sticks[s] = null; };
cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
const stickVec = s => { if (!s) return [0, 0, 0]; let dx = s.x - s.x0, dy = s.y - s.y0; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } return [dx / m, -dy / m, Math.min(1, l / m)]; };
const scr2map = (x, y) => add(mul(CAM_R, x), CAM_F, y); // экранное направление → направление на карте
// кнопки интерфейса
let UI = [];
function layout() {
  const s = Math.max(44, Math.min(64, Math.min(W, H) * .13)), by = H - s * .5 - 30, ms = Math.min(150, Math.min(W, H) * .3);
  UI = [
    { id: 'exit', x: 8, y: 8, w: 44, h: 44 },
    { id: 'fire', cx: W - 84, cy: H - 100, r: Math.max(38, Math.min(52, Math.min(W, H) * .12)), x: -999, y: -999, w: 0, h: 0 },
    { id: 'slot0', x: CX - s * 1.15, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'slot1', x: CX + s * .05, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'heal', x: CX - s * 2.25, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'reload', x: CX + s * 1.35, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'pick', x: CX - s * .7, y: by - s * 1.85, w: s * 1.4, h: s * .95 },
    { id: 'map', x: W - ms - 6, y: 6, w: ms, h: ms },
    { id: 'spec', x: CX + 90, y: H - 64, w: 56, h: 44 },
    { id: 'restart', x: CX - 146, y: H - 64, w: 56, h: 44 },
    { id: 'jump', x: CX - 50, y: H - 110, w: 100, h: 80 },
    // меню выхода
    { id: 'mQuit', x: CX - 160, y: CY - 45, w: 100, h: 90, menu: 1 },
    { id: 'mRestart', x: CX - 50, y: CY - 45, w: 100, h: 90, menu: 1 },
    { id: 'mBack', x: CX + 60, y: CY - 45, w: 100, h: 90, menu: 1 },
  ];
}
const canRestart = () => phase >= 1 && lobbyNames.length === 1; // кроме меня в игре только боты
let pickShow = null;
const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
function uiHit(x, y) {
  if (menuOpen) {
    for (const b of UI) if (b.menu && inBox(b, x, y)) {
      if (b.id === 'mQuit') quit();
      else if (b.id === 'mRestart' && canRestart()) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'restart' })); menuOpen = false; }
      else if (b.id === 'mBack') menuOpen = false;
      return true;
    }
    menuOpen = false; return true;
  }
  for (const b of UI) if (!b.menu && inBox(b, x, y)) {
    if (b.id === 'exit') { menuOpen = true; sticks.L = sticks.R = sticks.F = null; mouse.down = false; return true; }
    if (b.id === 'map') { bigMap = !bigMap; return true; }
    if (bigMap) { bigMap = false; return true; }
    if (b.id === 'jump' && myAir === 1 && phase === 1 && !dead) { wantJump = true; return true; }
    const alive = myId !== 255 && ents[myId] && phase === 1 && !dead && !myAir;
    if (b.id === 'spec' && !alive && phase === 1) { specNext(); return true; }
    if (b.id === 'restart' && !alive && canRestart()) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'restart' })); return true; }
    if (!alive) continue;
    if (b.id === 'slot0') wantSlot = 0; else if (b.id === 'slot1') wantSlot = 1; else if (b.id === 'heal') wantHeal = true; else if (b.id === 'reload') wantReload = true; else if (b.id === 'pick') { if (!pickShow) continue; wantPick = true; }
    return true;
  }
  if (bigMap) { bigMap = false; return true; }
  return false;
}
function specNext() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'spec' })); }
// выход в главное меню
function quit() {
  menuOpen = false;
  if (ws) { ws.onclose = null; try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'quit' })); ws.close(); } catch (e) { } ws = null; }
  started = false; phase = 0; myId = 255; camId = 255; ents = {}; marks = []; loot = new Map(); dead = null; endInfo = null; predP = null; pending = []; lobbyNames = []; feed = []; fx = []; nums = []; tracers = []; myAir = 0; plan = null;
  sticks.L = sticks.R = sticks.F = null; mouse.down = false; bigMap = false;
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { }
  document.getElementById('start').style.display = 'flex';
}

// ===== звук (синтез, без файлов) =====
function initSound() { if (sound) return; try { const A = new (window.AudioContext || window.webkitAudioContext)(); const len = A.sampleRate * .4, b = A.createBuffer(1, len, A.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; sound = { A, noise: b, last: {} }; } catch (e) { } }
function sfx(type, vol = 1) {
  if (!sound || vol < .03) return; const { A } = sound, now = A.currentTime;
  if (sound.last[type] && now - sound.last[type] < .03) return; sound.last[type] = now;
  try {
    const g = A.createGain(); g.connect(A.destination);
    if (type >= 1 && type <= 5) { // выстрелы
      const s = A.createBufferSource(); s.buffer = sound.noise; const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = [0, 2600, 1700, 900, 3800, 3200][type];
      s.connect(f); f.connect(g); const d = [0, .09, .1, .22, .35, .06][type]; g.gain.setValueAtTime(.35 * vol, now); g.gain.exponentialRampToValueAtTime(.001, now + d); s.start(now); s.stop(now + d);
    } else { const o = A.createOscillator(); o.type = type === 'hit' ? 'square' : 'sine'; o.connect(g);
      const [f0, f1, d, v] = { hit: [900, 600, .05, .06], kill: [660, 1320, .25, .15], pick: [520, 880, .1, .08], dead: [400, 80, .6, .15], win: [520, 1560, .8, .15] }[type];
      o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d); g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(.001, now + d); o.start(now); o.stop(now + d); }
  } catch (e) { }
}

// ===== сеть =====
function connect() {
  const u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const s = ws = new WebSocket(u); ws.binaryType = 'arraybuffer';
  ws.onopen = () => s.send(JSON.stringify({ t: 'join', name: myName, char: myChar }));
  ws.onmessage = e => { if (ws !== s) return; typeof e.data === 'string' ? onJson(JSON.parse(e.data)) : onSnap(e.data); };
  ws.onclose = () => { if (ws === s && started) setTimeout(() => { if (started && ws === s) connect(); }, 1500); };
}
function onJson(m) {
  if (m.t === 'match') {
    objs = genWorld(); for (const id of m.dead) if (objs[id]) objs[id].dead = true;
    loot = new Map(); for (const a of m.loot) addLootArr(a);
    names = {}; for (const [id, n, ch, bot] of m.pl) names[id] = { n, ch, bot };
    plan = m.plan; shipS = m.ship[0]; shipD = m.ship[1]; myAir = 1; ents = {}; pending = []; predP = null; dead = null; endInfo = null; feed = []; fx = [];
  } else if (m.t === 'l') { if (m.a) for (const a of m.a) addLootArr(a); if (m.d) for (const id of m.d) loot.delete(id); }
  else if (m.t === 'cr') { const o = objs[m.id]; if (o) { o.dead = true; G3.killObj(m.id); sfx(3, vol(o.p) * .7); } }
  else if (m.t === 'k') {
    feed.unshift({ t: performance.now(), k: m.k, v: m.v, w: m.w }); feed.length = Math.min(feed.length, 5);
    const e = ents[m.v]; const p = e ? e.disp || e.h[e.h.length - 1].p : null;
    if (p) fx.push({ type: 'death', p, v: m.v, aim: e && e.h.length ? e.h[e.h.length - 1].aim : null, t: 0, ch: names[m.v] ? names[m.v].ch : 0, spin: Math.random() < .5 ? 1 : -1 });
    if (m.k === myId && myId !== 255) sfx('kill');
    delete ents[m.v];
  } else if (m.t === 'dead') { dead = { place: m.place, by: m.by, t: performance.now() }; sfx('dead'); }
  else if (m.t === 'end') { endInfo = { w: m.w, t: performance.now() }; sfx('win'); }
  else if (m.t === 'lobby') { phase = 0; dead = null; endInfo = null; ents = {}; loot = new Map(); objs = genWorld(); plan = null; }
  else if (m.t === 'lb') { lobbyNames = m.n; }
}
function addLootArr(a) { loot.set(a[0], { id: a[0], k: a[1], x: a[2], r: a[3], n: a[4], p: [a[5], a[6]] }); }
const rdPos = (dv, o) => [dv.getInt16(o, true) / 10, dv.getInt16(o + 2, true) / 10];
function onSnap(buf) {
  const dv = new DataView(buf); let o = 0; const u8 = () => dv.getUint8(o++);
  if (u8() !== 1) return;
  const tick = dv.getUint32(o, true); o += 4; const ph = u8(); const tm = dv.getUint16(o, true); o += 2;
  const ack = dv.getUint16(o, true); o += 2;
  const mid = u8(), cid = u8(), an = u8();
  const pv = { hp: u8(), armor: u8(), cur: u8(), s: [[u8(), u8()], [u8(), u8()]], ammo: [u8(), u8(), u8(), u8()], meds: u8(), st: u8(), prog: u8(), kills: u8() };
  phase = ph; timer = tm; aliveN = an; myId = mid; camId = cid; priv = pv;
  if (ph === 1) { const st = tm / 10; if (Math.abs(st - matchT) > .6) matchT = st; else matchT += (st - matchT) * .08; } // плавно, без рывков
  // часы сервера
  const now = performance.now(), est = tick - now / 50;
  if (tickOff === null || est > tickOff || tick < lastTick - 100) tickOff = est; else tickOff += (est - tickOff) * .02;
  lastTick = tick; snapCount++;
  const n = u8(); const seen = new Set();
  for (let i = 0; i < n; i++) {
    const id = u8(), p = rdPos(dv, o); o += 4; const aim = [dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127]; o += 2;
    const hp = u8(), fl = u8(), wb = u8(); seen.add(id);
    let e = ents[id]; if (!e) e = ents[id] = { id, h: [], walk: 0 };
    e.h.push({ tick, p, aim, hp, fl, wb }); if (e.h.length > 12) e.h.shift(); e.seen = tick;
    if (id === myId && ph === 1) { myAir = (fl >> 4) & 3; if (myAir) { predP = null; pending = []; } else reconcile(p, ack); }
  }
  for (const id in ents) if (!seen.has(+id)) ents[id].seen = -1;
  const ns = u8();
  for (let i = 0; i < ns; i++) { const sid = u8(), wb = u8(), end = rdPos(dv, o); o += 4; tracers.push({ sid, wb, end, t: 0, from: null }); if (sid !== myId) sfx(wb & 15, vol(end) * .8); }
  const nh = u8();
  for (let i = 0; i < nh; i++) { const tid = u8(), d = u8(); const e = ents[tid]; nums.push({ p: e && e.disp ? e.disp : null, tid, d, t: 0, crate: tid === 255 }); if (tid !== myId) sfx('hit', .7); }
  // слышно, но не видно: шаги за стеной и выстрелы
  if (o < dv.byteLength) { const nn = u8(); for (let i = 0; i < nn; i++) { const k = u8(), p = rdPos(dv, o); o += 4; const d = [dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127]; o += 2;
    marks.push({ k: k & 15, side: k >> 4, p, d, t: 0 }); if ((k & 15) === 2) sfx(2, vol(p) * .6); } }
}
function vol(p) { const d = dist(predP || camP, p); return Math.max(0, 1 - d / 900); }
const seqAfter = (a, b) => ((a - b) & 0xffff) > 0 && ((a - b) & 0xffff) < 32768;
function reconcile(sp, ack) {
  pending = pending.filter(x => seqAfter(x.seq, ack));
  let p = sp; for (const x of pending) p = stepMove(objs, p, x.mv, x.slow);
  if (!predP || dist(p, predP) > 80) { predP = p; prevP = p; return; }
  const d = dist(p, predP); predP = d > 2 ? lerp(predP, p, .35) : p; // мягкая поправка
}

// ===== локальный тик (ввод + предсказание) =====
let myAim = null;
// помощь в прицеливании на телефоне: ближайший видимый враг в зоне выстрела (cone — только впереди)
function autoAim(cone) {
  const s = priv && priv.s[priv.cur], w = s ? s[0] & 15 : 0; if (!w || !predP) return null; const rng = WEAPONS[w].range;
  let best = null, bd = 1e9;
  for (const id in ents) { if (+id === myId) continue; const e = ents[id]; if (e.seen < 0 || !e.disp) continue; const d = dist(e.disp, predP); if (d > rng || d >= bd) continue;
    if (cone && myAim && dot(norm(sub(e.disp, predP)), myAim) < .88) continue; bd = d; best = e.disp; }
  return best ? sub(best, predP) : null;
}
function readMove() {
  let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my++; if (keys.KeyS || keys.ArrowDown) my--; if (keys.KeyD || keys.ArrowRight) mx++; if (keys.KeyA || keys.ArrowLeft) mx--;
  if (sticks.L) { const v = stickVec(sticks.L); mx = v[0]; my = v[1]; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  return scr2map(mx, my);
}
function localTick() {
  if (menuOpen) return;
  const inAir = phase === 1 && myId !== 255 && !dead && myAir;
  if (inAir) {
    const mv = readMove();
    const fl = (wantJump || keys.Space || mouse.down || wantPick) ? 64 : 0; wantJump = wantPick = false;
    seq = (seq + 1) & 0xffff; outBuf.push([seq, mv, [0, 0], fl, renderTick()]); if (outBuf.length >= 2 || fl) flushInput();
    return;
  }
  const alive = phase === 1 && myId !== 255 && !dead && predP;
  if (!alive) return;
  const mv = readMove();
  let aim = null, fire = false;
  if (sticks.R) { const v = stickVec(sticks.R); if (v[2] > .15) { aim = scr2map(v[0], v[1]); aimT = performance.now(); } } // правый стик — только смотреть
  if (sticks.F) { fire = true; const v = stickVec(sticks.F); if (v[2] > .3) { aim = scr2map(v[0], v[1]); aimT = performance.now(); } // кнопку огня можно тянуть — целится
    else if (!sticks.R) { const a = autoAim(performance.now() - aimT < 1500); if (a) aim = a; } } // помощь в прицеливании
  else if (mouse.used && !touchUI) { const g = G3.screenToGround(mouse.x, mouse.y, 24); if (g && dist(g, predP) > 2) aim = sub(g, predP); fire = mouse.down || !!keys.Space; }
  if (aim) myAim = norm(aim);
  let fl = (fire ? 1 : 0) | (wantReload ? 2 : 0) | (wantPick ? 4 : 0) | (wantHeal ? 8 : 0);
  if (wantSlot >= 0) fl |= 16 | (wantSlot << 5);
  wantReload = wantPick = wantHeal = false; wantSlot = -1;
  const slow = priv && (priv.st & 2) ? .5 : 1;
  seq = (seq + 1) & 0xffff;
  prevP = predP; predP = stepMove(objs, predP, mv, slow);
  pending.push({ seq, mv, slow });
  outBuf.push([seq, mv, myAim || [0, 0], fl, renderTick()]);
  if (outBuf.length >= 2 || (fl & 0x3e)) flushInput();
}
function flushInput() {
  if (!outBuf.length || !ws || ws.readyState !== 1) { outBuf = []; return; }
  const b = new ArrayBuffer(2 + outBuf.length * 10), dv = new DataView(b); dv.setUint8(0, 1); dv.setUint8(1, outBuf.length);
  let o = 2;
  for (const [s, mv, aim, fl, rt] of outBuf) {
    dv.setUint16(o, s, true); dv.setInt8(o + 2, i8(mv[0])); dv.setInt8(o + 3, i8(mv[1]));
    dv.setInt8(o + 4, i8(aim[0])); dv.setInt8(o + 5, i8(aim[1])); dv.setUint8(o + 6, fl);
    const t = Math.max(0, rt); dv.setUint16(o + 7, Math.floor(t) & 0xffff, true); dv.setUint8(o + 9, Math.floor((t % 1) * 256)); o += 10;
  }
  ws.send(b); outBuf = [];
}
const renderTick = () => (tickOff === null ? 0 : performance.now() / 50 + tickOff) - 2.2;

// ===== интерполяция =====
function interp(e, rt) {
  const h = e.h; if (!h.length) return null;
  let a = h[0], b = h[h.length - 1];
  if (rt >= b.tick) return { p: b.p, aim: b.aim, s: b };
  for (let i = h.length - 1; i > 0; i--) if (h[i - 1].tick <= rt) { a = h[i - 1]; b = h[i]; break; }
  const f = b.tick > a.tick ? Math.max(0, Math.min(1, (rt - a.tick) / (b.tick - a.tick))) : 1;
  return { p: lerp(a.p, b.p, f), aim: lerp(a.aim, b.aim, f), s: b };
}

// ===== кадр =====
let fps = 0, fc = 0, ft = 0, last = performance.now();
function frame(now) {
  const rdt = (now - last) / 1000, dt = Math.min(.05, rdt); last = now; fc++; ft += rdt; if (ft >= .5) { fps = Math.round(fc / ft); snapRate = Math.round(snapCount / ft); fc = 0; ft = 0; snapCount = 0; }
  if (started) {
    tickAcc += dt; let k = 0; while (tickAcc >= DT && k < 3) { tickAcc -= DT; k++; localTick(); } if (tickAcc > .2) tickAcc = 0;
    if (phase === 1) matchT += dt;
  }
  if (!started) G3.preview(pv, myChar); else render(dt, now);
  requestAnimationFrame(frame);
}
function render(dt, now) {
  const rt = renderTick();
  zone = phase >= 1 ? zoneAt(matchT, plan) : zoneAt(0, null);
  const meIn = phase === 1 && myId !== 255 && !dead;
  const meAlive = meIn && !myAir && predP;
  let target = null;
  if (meAlive) target = prevP ? lerp(prevP, predP, Math.min(1, tickAcc / DT)) : predP;
  else if (meIn && myAir === 1) target = shipPos(shipS, shipD, matchT);
  else if (meIn && myAir === 2 && ents[myId]) { const q = interp(ents[myId], rt); if (q) target = q.p; }
  else if (phase >= 1 && ents[camId]) { const q = interp(ents[camId], rt); if (q) target = q.p; }
  if (target) camP = dist(target, camP) > 300 ? target : lerp(camP, target, meAlive || (meIn && myAir) ? 1 : Math.min(1, dt * 8));
  else camP = [Math.cos(now / 9000) * 500, Math.sin(now / 9000) * 500]; // в лобби камера медленно плывёт
  // персонажи для 3D
  const list = [], labels = [];
  for (const id in ents) {
    const e = ents[id]; if (e.seen < 0 && +id !== myId) continue; const lst = e.h[e.h.length - 1], air = (lst.fl >> 4) & 3; if (air === 1) continue;
    let q;
    if (+id === myId && meAlive && !air) q = { p: target, aim: myAim || lst.aim, s: lst };
    else q = interp(e, rt);
    if (!q) continue;
    const prev = e.disp; e.disp = q.p; const step = prev ? dist(prev, q.p) : 0; e.walk += step * .16; e.mvT = step > .2 ? .15 : (e.mvT || 0) - dt;
    const s = q.s, hurt = e.lastHp !== undefined && s.hp < e.lastHp; e.lastHp = s.hp; if (hurt) e.hitT = .1; e.hitT = (e.hitT || 0) - dt; e.fireT = (e.fireT || 0) - dt;
    let alt = 0; if (air === 2) { if (!e.airT0) e.airT0 = now; alt = Math.max(0, 230 * (1 - (now - e.airT0) / 1000 / FALL_T)); } else e.airT0 = 0;
    const aim = len(q.aim) > .05 ? norm(q.aim) : [0, 1];
    const ch = names[id] ? names[id].ch : +id;
    list.push({ id: +id, ch, p: q.p, aim, wb: s.wb, walk: e.walk, moving: e.mvT > 0, hit: e.hitT > 0, armor: s.fl & 2, alt, fire: e.fireT > .04 });
    labels.push({ id: +id, p: q.p, alt, hp: s.hp, heal: s.fl & 8 });
  }
  for (const f of fx) { f.t += dt; if (f.type === 'death' && f.t < 1.3) list.push({ id: 100 + f.v, ch: f.ch, p: f.p, aim: f.aim && len(f.aim) > .05 ? norm(f.aim) : [0, 1], wb: 0, walk: 0, dead: true, deadT: f.t }); }
  fx = fx.filter(f => f.t < 3);
  for (const t of tracers) { t.t += dt; if (!t.from) { const e = t.sid === myId && predP ? predP : ents[t.sid] && ents[t.sid].disp; t.from = e || t.end; if (ents[t.sid]) ents[t.sid].fireT = .1; } }
  const inB = phase >= 1 && target && !(meIn && myAir) ? bldAt(objs.blds, target) : -1;
  G3.frame({ now, dt, objs, zone, plan, matchT, phase, loot, list, tracers, shipS, shipD, camP, inB });
  tracers = tracers.filter(t => t.t < .12);
  // ===== 2D поверх 3D =====
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (VIG) ctx.drawImage(VIG, 0, 0, W, H);
  ctx.textAlign = 'center';
  for (const l of labels) {
    const [x, y, v] = G3.project(l.p, 66 + l.alt); if (!v) continue;
    if (l.id !== myId || !meAlive) { const nm = names[l.id] ? names[l.id].n : ''; txt(nm, x, y - 8, 12, '#fff', 'center', 800);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 18, y - 4, 36, 5); ctx.fillStyle = l.hp > 40 ? '#51cf66' : '#ff6b6b'; ctx.fillRect(x - 18, y - 4, 36 * l.hp / 100, 5); }
    if (l.heal) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + 12, 10, -1.57, -1.57 + 6.2832 * ((now / 1000) % 1)); ctx.stroke(); }
  }
  // призраки погибших
  for (const f of fx) { if (f.type !== 'death') continue; const [x, y, v] = G3.project(f.p, 40 + f.t * 70); if (!v) continue; const r = 13;
    ctx.globalAlpha = Math.max(0, .85 - f.t / 3); const gx = x + Math.sin(f.t * 5) * 10; ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.arc(gx, y, r * .8, 3.14, 0); ctx.lineTo(gx + r * .8, y + r * .9); for (let i = 3; i >= -3; i--) ctx.lineTo(gx + i * r * .27, y + r * (i % 2 ? .65 : .9)); ctx.fill();
    blob(ctx, gx - r * .28, y - r * .1, r * .13, '#000'); blob(ctx, gx + r * .28, y - r * .1, r * .13, '#000'); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(gx, y - r * 1.05, r * .5, r * .18, 0, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
    if (f.t < .6) { const [cx, cy] = G3.project(f.p, 20); for (let i = 0; i < 12; i++) { const a = i * .52 + f.spin, d = f.t * 160; ctx.fillStyle = COLORS[(i + f.ch) % 10]; ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d - f.t * 40 + f.t * f.t * 200, 4, 7); } } }
  // следы шагов и выстрелы, которые слышно, но не видно
  for (const m of marks) { m.t += dt; const [x, y] = G3.project(m.p, 0);
    if (m.k === 1) { const life = 3; if (m.t > life) continue; const [x2, y2] = G3.project(add(m.p, m.d, 10), 0), a = Math.atan2(y2 - y, x2 - x), sd = m.side ? 1 : -1;
      ctx.save(); ctx.translate(x - Math.sin(a) * sd * 4, y + Math.cos(a) * sd * 4); ctx.rotate(a); ctx.globalAlpha = Math.min(1, (life - m.t) / 1.2) * .9;
      ctx.fillStyle = 'rgba(245,235,210,.95)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(2, 0, 5, 2.6, 0, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(-4.5, 0, 2.2, 2, 0, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.restore(); }
    else if (m.k === 2 && m.t < 1.4) { const k = m.t / 1.4; ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8 + k * 34, 0, 6.2832); ctx.stroke();
      if (x < 0 || x > W || y < 0 || y > H) { const a = Math.atan2(y - CY, x - CX), r = Math.min(W, H) * .44; txt('💥', CX + Math.cos(a) * r, CY + Math.sin(a) * r + 6, 18); } else txt('💥', x, y + 6, 16); ctx.globalAlpha = 1; } }
  marks = marks.filter(m => m.t < 3);
  // метка «я» под ногами — видно даже за стеной
  if (meAlive) { const [x, y] = G3.project(target, 0); ctx.strokeStyle = 'rgba(105,219,124,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 16, 9, 0, 0, 6.2832); ctx.stroke(); }
  // цифры урона
  for (const n of nums) { n.t += dt; if (!n.p && ents[n.tid] && ents[n.tid].disp) n.p = ents[n.tid].disp; if (!n.p) continue; const [x, y, v] = G3.project(n.p, 60 + n.t * 50); if (!v) continue; ctx.globalAlpha = Math.max(0, 1 - n.t / .8); txt(String(n.d), x + 16, y, n.crate ? 13 : 18, n.tid === myId ? '#ff6b6b' : n.crate ? '#ffd8a8' : n.d >= 50 ? '#ffd43b' : '#fff'); ctx.globalAlpha = 1; }
  nums = nums.filter(n => n.t < .8);
  // прицельная линия (сенсор)
  if (meAlive && (sticks.R || sticks.F) && myAim && priv) { const s = priv.s[priv.cur]; const w = s[0] & 15; if (w) { const a = G3.project(target, 24), b = G3.project(add(target, myAim, WEAPONS[w].range), 24); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); } }
  // пепел рядом с огнём
  if (phase >= 1 && !zone.pre && dist(camP, zone.c) > zone.rho - 220) { while (ash.length < 40) ash.push({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2.5, v: 20 + Math.random() * 30 });
    for (const a of ash) { a.y += a.v * dt; a.x += Math.sin(now / 700 + a.s * 5) * 15 * dt; if (a.y > H) { a.y = -5; a.x = Math.random() * W; } ctx.fillStyle = a.s > 2.5 ? 'rgba(255,140,60,.8)' : 'rgba(200,200,200,.55)'; ctx.fillRect(a.x, a.y, a.s, a.s); } } else ash = [];
  hud(now, meIn && !myAir ? meAlive : false, target);
}
// ===== HUD =====
function arrowTo(to, col, from) {
  const a0 = G3.project(from, 0), b0 = G3.project(to, 0), a = Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
  const r = Math.min(W, H) * .4, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-7, -11); ctx.lineTo(-3, 0); ctx.lineTo(-7, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function txt(s, x, y, size, col = '#fff', al = 'center', weight = 900) { ctx.font = `${weight} ${size}px system-ui`; ctx.textAlign = al; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function btn(b, col, alpha = .55) { ctx.fillStyle = `rgba(0,0,0,${alpha})`; rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill(); if (col) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); } }
const ui = id => UI.find(b => b.id === id);
function hud(now, meAlive, mePos) {
  const meIn = phase === 1 && myId !== 255 && !dead;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const from = mePos || camP;
  if (phase === 1) {
    // стрелка к безопасному кругу (следующему, если он уже показан); внутри — не нужна
    if (meAlive) { const T = nextZone(zone, plan) || zone; if (dist(from, T.c) > T.rho) arrowTo(T.c, outZone(from, zone) ? '#ff8787' : '#69db7c', from); }
    const s = (zone.mv ? '🔥 ' : '⚠️ ') + Math.ceil(zone.left);
    const col = zone.pre ? '#ffa94d' : zone.mv ? '#ff6b6b' : (zone.left < 5 ? (Math.floor(now / 250) % 2 ? '#ffd43b' : '#fff') : '#fff');
    txt(s, CX, 30, 22, col);
    const burnt = Math.round((1 - Math.min(1, zone.rho / R0)) * 100); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(CX - 50, 38, 100, 6); ctx.fillStyle = '#ff6b3d'; ctx.fillRect(CX - 50, 38, burnt, 6);
  }
  minimap(now, from);
  if (phase >= 1) { const mb = ui('map'); txt('👤 ' + aliveN + (myId !== 255 ? '   💀 ' + (priv ? priv.kills : 0) : ''), mb.x + mb.w / 2, mb.y + mb.h + 18, 16, '#fff', 'center', 800); }
  // лента убийств
  feed.forEach((f, i) => { const age = (now - f.t) / 1000; if (age > 7) return; ctx.globalAlpha = Math.min(1, 7 - age); const y = 74 + i * 21; const a = f.k >= 0 ? (names[f.k] ? names[f.k].n : '?') : '🔥', b = names[f.v] ? names[f.v].n : '?';
    let x = 10; const seg = (s, c) => { txt(s, x, y, 14, c, 'left', 800); x += ctx.measureText(s).width + 4; };
    seg(a, f.k >= 0 ? COLORS[names[f.k] ? names[f.k].ch : 0] : '#ffa94d'); seg(f.w ? ['', '🔫', '🔫', '💥', '🎯', '🔫'][f.w] : '🔥', '#fff'); seg(b, COLORS[names[f.v] ? names[f.v].ch : 0]); ctx.globalAlpha = 1; });
  // свой интерфейс
  if (meAlive && priv) {
    const bw = Math.min(260, W * .42), bx = CX - bw / 2, by = H - 24;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, bx - 2, by - 2, bw + 4, 16, 6); ctx.fill();
    ctx.fillStyle = priv.hp > 40 ? '#51cf66' : '#ff6b6b'; rr(ctx, bx, by, bw * priv.hp / 100, 12, 5); ctx.fill();
    if (priv.armor > 0) { ctx.fillStyle = '#4dabf7'; rr(ctx, bx, by - 8, bw * priv.armor / 100, 5, 2); ctx.fill(); }
    txt(Math.ceil(priv.hp), bx - 18, by + 11, 14, '#fff', 'center', 800);
    for (let i = 0; i < 2; i++) {
      const b = ui('slot' + i), s = priv.s[i], w = s[0] & 15, r = s[0] >> 4;
      btn(b, i === priv.cur ? (w ? RARITY[r] : '#fff') : null, i === priv.cur ? .7 : .4);
      if (w) { ctx.save(); ctx.translate(b.x + b.w * .12, b.y + b.h * .38); gunShape(ctx, w, b.h * .36, RARITY[r]); ctx.restore();
        const Wp = WEAPONS[w]; txt(s[1] + ' / ' + priv.ammo[Wp.ammo], b.x + b.w / 2, b.y + b.h - 6, 12, s[1] ? '#fff' : '#ff6b6b', 'center', 800); }
    }
    if (!touchUI) { for (let i = 0; i < 2; i++) { const b = ui('slot' + i); txt(String(i + 1), b.x + 9, b.y + 15, 12, '#ffd43b', 'center', 800); } }
    const hb = ui('heal'); btn(hb, priv.meds ? '#ff6b6b' : null); txt('✚' + priv.meds, hb.x + hb.w / 2, hb.y + hb.h * .66, 18, priv.meds ? '#ff8787' : '#666');
    const rb = ui('reload'); btn(rb, null); txt('⟳', rb.x + rb.w / 2, rb.y + rb.h * .7, 24, '#fff');
    if (!touchUI) { txt('Q', hb.x + 9, hb.y + 15, 12, '#ffd43b', 'center', 800); txt('R', rb.x + 9, rb.y + 15, 12, '#ffd43b', 'center', 800); }
    if (priv.st) { const k = priv.prog / 255; ctx.strokeStyle = priv.st & 2 ? '#ff6b6b' : '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(CX, CY, 30, -1.57, -1.57 + 6.2832 * k); ctx.stroke(); }
    // кнопка подобрать
    pickShow = null; let bd = 1e9; for (const it of loot.values()) { const d = dist(it.p, mePos); if (d < PR + 30 && d < bd && it.k === 0) { bd = d; pickShow = it; } }
    if (pickShow) { const b = ui('pick'); btn(b, RARITY[pickShow.r], .7); ctx.save(); ctx.translate(b.x + b.w * .3, b.y + b.h * .5); gunShape(ctx, pickShow.x, b.h * .32, RARITY[pickShow.r]); ctx.restore(); txt(touchUI ? '✋' : 'E', b.x + b.w - 16, b.y + b.h * .65, 18); }
    // в огне
    if (outZone(mePos, zone)) { const g = ctx.createRadialGradient(CX, CY, Math.min(W, H) * .32, CX, CY, Math.max(W, H) * .7); g.addColorStop(0, 'rgba(255,40,0,0)'); g.addColorStop(1, `rgba(255,40,0,${.4 + .2 * Math.sin(now / 120)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; const n = Math.ceil((W + H) / 45);
      for (let i = 0; i < n * 2; i++) { const t = i / (n * 2), per = 2 * (W + H), d = t * per; let x, y, a; if (d < W) { x = d; y = H; a = 0; } else if (d < W + H) { x = W; y = H - (d - W); a = -1.57; } else if (d < 2 * W + H) { x = W - (d - W - H); y = 0; a = 3.14; } else { x = 0; y = d - 2 * W - H; a = 1.57; }
        const f = .6 + .5 * Math.sin(now / 70 + i * 2.3) + .3 * Math.sin(now / 31 + i * 5.1); if (f < .4) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(FLAME, -18 * f, -50 * f, 36 * f, 50 * f); ctx.restore(); }
      ctx.globalCompositeOperation = 'source-over'; }
    // джойстики
    drawStick(sticks.L, 'rgba(255,255,255,.65)'); drawStick(sticks.R, 'rgba(120,200,255,.7)');
    if (touchUI) { if (!sticks.L) ghostStick(W * .16, H * .68); if (!sticks.R) ghostStick(W * .66, H * .62, '👁');
      const fb = ui('fire'), fs = sticks.F, v = fs ? stickVec(fs) : [0, 0, 0], fx_ = fb.cx + v[0] * 26, fy_ = fb.cy - v[1] * 26;
      ctx.fillStyle = fs ? 'rgba(255,80,60,.75)' : 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(fx_, fy_, fb.r, 0, 6.2832); ctx.fill(); ctx.strokeStyle = fs ? '#fff' : 'rgba(255,107,107,.9)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(fx_, fy_, fb.r * .38, 0, 6.2832); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(fx_ + a * fb.r * .18, fy_ + b * fb.r * .18); ctx.lineTo(fx_ + a * fb.r * .62, fy_ + b * fb.r * .62); } ctx.stroke(); }
    if (mouse.used && !touchUI) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, 6.2832); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke(); }
  }
  // экраны
  if (phase === 0 && started) {
    ctx.fillStyle = 'rgba(8,4,24,.45)'; ctx.fillRect(0, 0, W, H);
    txt('LAST EXIT', CX, H * .3, Math.min(64, W * .1), '#ffd43b');
    const n = lobbyNames.length; let x = CX - (MAXP - 1) * 14;
    for (let i = 0; i < MAXP; i++) { ctx.fillStyle = i < n ? '#69db7c' : 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x + i * 28, H * .42, 9, 0, 6.2832); ctx.fill(); }
    txt(lobbyNames.slice(0, 10).join(' · '), CX, H * .5, 14, '#fff', 'center', 600);
    if (timer !== 65535) txt(String(Math.ceil(timer / TICK)), CX, H * .66, 54, '#fff');
  }
  if (meIn && myAir === 1) { const b = ui('jump'); btn(b, '#ffd43b', .7); txt('⬇', b.x + b.w / 2, b.y + b.h * .72, 34, '#ffd43b'); drawStick(sticks.L, 'rgba(255,255,255,.65)'); }
  if (meIn && myAir === 2) { drawStick(sticks.L, 'rgba(255,255,255,.65)'); if (touchUI && !sticks.L) ghostStick(W * .16, H * .68); }
  if (phase >= 1 && !meAlive && !(meIn && myAir)) {
    if (dead && (now - dead.t) < 2600) { const k = Math.min(1, (now - dead.t) / 300); ctx.fillStyle = `rgba(30,0,0,${.45 * k})`; ctx.fillRect(0, 0, W, H); txt('💀 #' + dead.place, CX, H * .42, 56 * k); }
    else if (!endInfo) { txt('👁 ' + (names[camId] ? names[camId].n : ''), CX, H - 34, 18); const b = ui('spec'); btn(b, '#fff'); txt('⏭', b.x + b.w / 2, b.y + b.h * .7, 22); if (canRestart()) { const rb = ui('restart'); btn(rb, '#ffd43b'); txt('↻', rb.x + rb.w / 2, rb.y + rb.h * .72, 26, '#ffd43b'); } if (dead) txt('#' + dead.place, 40, H - 30, 22, '#ffd43b'); }
  }
  if (endInfo) {
    const t = (now - endInfo.t) / 1000, k = Math.min(1, t / .5);
    ctx.fillStyle = `rgba(8,4,24,${.35 * k})`; ctx.fillRect(0, 0, W, H);
    const win = endInfo.w === myId && myId !== 255;
    txt(win ? '🏆 ПОБЕДА!' : '🏆 ' + (names[endInfo.w] ? names[endInfo.w].n : ''), CX, H * .35, (win ? 58 : 40) * k, win ? '#ffd43b' : '#fff');
    if (!win && dead) txt('#' + dead.place, CX, H * .35 + 50, 30 * k);
    if (canRestart()) { const rb = ui('restart'); btn(rb, '#ffd43b'); txt('↻', rb.x + rb.w / 2, rb.y + rb.h * .72, 26, '#ffd43b'); }
  }
  // кнопка выхода (всегда)
  if (started) { const eb = ui('exit'); btn(eb, 'rgba(255,255,255,.7)', .5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(eb.x + 15, eb.y + 15); ctx.lineTo(eb.x + 29, eb.y + 29); ctx.moveTo(eb.x + 29, eb.y + 15); ctx.lineTo(eb.x + 15, eb.y + 29); ctx.stroke(); ctx.lineCap = 'butt'; }
  if (menuOpen) {
    ctx.fillStyle = 'rgba(8,4,24,.72)'; ctx.fillRect(0, 0, W, H);
    const q = ui('mQuit'), r = ui('mRestart'), b = ui('mBack');
    btn(q, '#ff6b6b', .8); txt('🚪', q.x + q.w / 2, q.y + 52, 36); txt('выйти', q.x + q.w / 2, q.y + 78, 13, '#ff8787', 'center', 800);
    if (canRestart()) { btn(r, '#ffd43b', .8); txt('↻', r.x + r.w / 2, r.y + 54, 40, '#ffd43b'); txt('заново', r.x + r.w / 2, r.y + 78, 13, '#ffd43b', 'center', 800); }
    else { ctx.globalAlpha = .35; btn(r, null, .6); txt('↻', r.x + r.w / 2, r.y + 54, 40, '#888'); ctx.globalAlpha = 1; }
    btn(b, '#69db7c', .8); txt('▶', b.x + b.w / 2, b.y + 54, 36, '#69db7c'); txt('играть', b.x + b.w / 2, b.y + 78, 13, '#69db7c', 'center', 800);
  }
  if (!ws || ws.readyState !== 1) { if (started) txt('📡 …', CX, H / 2, 30); }
  if (('ontouchstart' in window) && H > W * 1.1) { // вертикально играть неудобно — просим повернуть
    ctx.fillStyle = 'rgba(8,4,24,.88)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(CX, CY - 20); ctx.rotate(Math.sin(now / 400) * .8 - .8); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 5; rr(ctx, -28, -48, 56, 96, 10); ctx.stroke(); ctx.fillStyle = '#ffd43b'; ctx.fillRect(-6, 36, 12, 4); ctx.restore();
    txt('↻', CX, CY + 80, 44, '#ffd43b'); }
  // FPS: крупно слева сверху (под ✕), если #perf; в меню ✕ — всегда
  const fpsCol = fps >= 45 ? '#69db7c' : fps >= 28 ? '#ffd43b' : '#ff6b6b';
  if (PERF && started) { txt(fps + ' FPS', 12, 78, 20, fpsCol, 'left'); txt(snapRate + ' snap/s', 12, 98, 12, '#ccc', 'left', 700); }
  if (menuOpen) txt(fps + ' FPS', CX, CY + 80, 26, fpsCol);
}
function ghostStick(x, y, icon) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.2832); ctx.stroke(); if (icon) { ctx.globalAlpha = .35; txt(icon, x, y + 7, 20); ctx.globalAlpha = 1; } }
function drawStick(s, col) { if (!s) return; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x0, s.y0, 55, 0, 6.2832); ctx.stroke(); const v = stickVec(s); blob(ctx, s.x0 + v[0] * 55, s.y0 - v[1] * 55, 24, col); }
// миникарта — ромб, повёрнутый так же, как камера (вверх на карте = вверх на экране)
function minimap(now, from) {
  const mb = ui('map'), big = bigMap, r = big ? Math.min(W, H) * .45 : mb.w / 2, cx = big ? CX : mb.x + mb.w / 2, cy = big ? CY : mb.y + mb.h / 2;
  const k = r / (HALF * Math.SQRT2);
  const mm = p => [cx + k * dot(p, CAM_R), cy - k * dot(p, CAM_F)];
  ctx.save();
  ctx.setTransform(dpr * k * CAM_R[0], -dpr * k * CAM_F[0], dpr * k * CAM_R[1], -dpr * k * CAM_F[1], dpr * cx, dpr * cy);
  ctx.globalAlpha = .92; ctx.fillStyle = '#5fb83f'; ctx.fillRect(-HALF, -HALF, HALF * 2, HALF * 2); ctx.globalAlpha = 1;
  for (const b of BIOMES) { ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.c[0], b.c[1], b.r, 0, 6.2832); ctx.fill(); }
  ctx.fillStyle = '#4a4540'; for (const b of objs.blds || []) { ctx.save(); ctx.translate(b.p[0], b.p[1]); ctx.rotate(b.a); ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore(); } // здания
  if (phase >= 1) {
    if (!zone.pre) { ctx.fillStyle = 'rgba(45,16,10,.88)'; ctx.beginPath(); ctx.rect(-HALF, -HALF, HALF * 2, HALF * 2); ctx.arc(zone.c[0], zone.c[1], Math.max(0, zone.rho), 0, 6.2832); ctx.fill('evenodd');
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2 / k; ctx.beginPath(); ctx.arc(zone.c[0], zone.c[1], Math.max(0, zone.rho), 0, 6.2832); ctx.stroke(); }
    const nz = nextZone(zone, plan); if (nz) { ctx.setLineDash([5 / k, 5 / k]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / k; ctx.beginPath(); ctx.arc(nz.c[0], nz.c[1], nz.rho, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2 / k; ctx.strokeRect(-HALF, -HALF, HALF * 2, HALF * 2);
  ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (phase === 1 && matchT < DROP_T) { const [sx, sy] = mm(shipPos(shipS, shipD, matchT)); txt('✈️', sx, sy + 5, big ? 22 : 13); }
  if (phase >= 1) for (const id in ents) { const e = ents[id]; if (e.seen < 0 || +id === myId || !e.disp) continue; const [x, y] = mm(e.disp); blob(ctx, x, y, big ? 5 : 3, '#ff6b6b'); }
  const [mx, my] = mm(from); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, my - 7); ctx.lineTo(mx + 5, my + 5); ctx.lineTo(mx - 5, my + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ===== стартовый экран =====
let myName = '', myChar = Math.floor(Math.random() * 10);
try { myName = localStorage.getItem('le_name') || ''; const c = localStorage.getItem('le_char'); if (c !== null) myChar = +c; } catch (e) { }
const nameIn = document.getElementById('name'), pv = document.getElementById('pv');
nameIn.value = myName;
document.getElementById('prev').onclick = () => { myChar = (myChar + 9) % 10; };
document.getElementById('next').onclick = () => { myChar = (myChar + 1) % 10; };
document.getElementById('play').onclick = () => {
  myName = (nameIn.value || '').trim().slice(0, 12) || 'Игрок' + Math.floor(Math.random() * 100);
  try { localStorage.setItem('le_name', myName); localStorage.setItem('le_char', myChar); } catch (e) { }
  nameIn.blur(); initSound(); document.getElementById('start').style.display = 'none'; started = true; tickOff = null; connect();
  // на телефоне: во весь экран и сразу горизонтально (Android); на iPhone — подсказка повернуть
  try { if ('ontouchstart' in window) { const d = document.documentElement, fs = d.requestFullscreen || d.webkitRequestFullscreen; const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } };
    if (fs) { const r = fs.call(d); r && r.then ? r.then(lock).catch(lock) : lock(); } else lock(); } } catch (e) { }
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
resize(); layout(); G3.resize(W, H); requestAnimationFrame(frame);
