'use strict';
// ===== СЕКТЫ — клиент =====
let PERF = location.hash.includes('perf'); addEventListener('hashchange', () => { PERF = location.hash.includes('perf'); });
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, CX = 0, CY = 0;
const objs = genWorld(), HQ = sectHQ(objs);
const CAM_F = G3.CAM_F, CAM_R = G3.CAM_R; // «вверх» и «вправо» экрана на карте
const NOZONE = zoneAt(0, null);
// ===== состояние =====
let ws = null, myId = 255, alive = false, worldT = 0;
let priv = null, names = {}, loot = new Map(), score = { n: [0, 0, 0, 0], b: [] };
let ents = {}, lastTick = 0, tickOff = null, snapCount = 0, snapRate = 0;
let pending = [], seq = 0, predP = null, prevP = null, tickAcc = 0, outBuf = [];
let camP = [0, 0];
let tracers = [], fx = [], feed = [], nums = [], marks = [], toasts = [], dead = null;
let started = false, sound = null, menuOpen = false, shopOpen = false, corpseN = 0, says = {}, hitMark = 0;

// ===== рисование =====
function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function gunShape(g, w, len, col) {
  const L = [0, .9, 1.6, 1.45, 2.1, 1.15, 1.9, 1.8, 1.0, 1.4][w] * len, T = w === 3 || w === 7 ? .34 : .26;
  g.fillStyle = '#2b2b2b'; g.fillRect(len * .35, -len * T / 2, L, len * T);
  g.fillStyle = col; g.fillRect(len * .35, -len * T / 2, L * .35, len * T);
  if (w === 4) { g.fillStyle = '#111'; g.fillRect(len * .7, -len * .22, len * .55, len * .14); }
  if (w === 2 || w === 5 || w === 7 || w === 9) { g.fillStyle = '#2b2b2b'; g.fillRect(len * .9, len * .1, len * .2, len * .35); }
}
function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; CX = W / 2; CY = H / 2; }
addEventListener('resize', () => { resize(); layout(); G3.resize(W, H); });
const sectCol = s => s >= 0 ? SECTS[s].col : '#c8c8c8';

// ===== ввод =====
const keys = {}; let mouse = { x: 0, y: 0, down: false, used: false }, sticks = { L: null, R: null, F: null }, touchUI = false, aimT = 0;
const fireOn = () => touchUI && myId !== 255 && alive && predP && !shopOpen;
let wantSlot = -1, wantReload = false, wantHeal = false, wantAct = false, bigMap = false;
addEventListener('keydown', e => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; keys[e.code] = 1;
  if (e.code === 'Escape') { if (shopOpen) shopOpen = false; else menuOpen = started && !menuOpen; return; }
  if (e.code === 'Digit1') wantSlot = 0; if (e.code === 'Digit2') wantSlot = 1; if (e.code === 'KeyR') wantReload = true; if (e.code === 'KeyE' || e.code === 'KeyF') wantAct = true;
  if (e.code === 'KeyQ' || e.code === 'KeyH') wantHeal = true; if (e.code === 'KeyM') bigMap = !bigMap; if (e.code === 'KeyB' && priv && priv.atHQ) shopOpen = !shopOpen; });
addEventListener('keyup', e => { keys[e.code] = 0; });
let mouseMoveT = 0; cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; mouseMoveT = performance.now(); });
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
  const s = Math.max(44, Math.min(64, Math.min(W, H) * .13)), by = H - s * .5 - 30, ms = Math.min(140, Math.min(W, H) * .28);
  UI = [
    { id: 'exit', x: 8, y: 8, w: 44, h: 44 },
    { id: 'fire', cx: W - 84, cy: H - 100, r: Math.max(38, Math.min(52, Math.min(W, H) * .12)), x: -999, y: -999, w: 0, h: 0 },
    { id: 'slot0', x: CX - s * 1.15, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'slot1', x: CX + s * .05, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'heal', x: CX - s * 2.25, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'reload', x: CX + s * 1.35, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'act', x: CX - s * 1.1, y: by - s * 1.95, w: s * 2.2, h: s * .95 },
    { id: 'shop', x: W - 84 - 34, y: H - 100 - 130, w: 68, h: 52 },
    { id: 'map', x: W - ms - 6, y: 6, w: ms, h: ms },
    // меню выхода
    { id: 'mQuit', x: CX - 110, y: CY - 45, w: 100, h: 90, menu: 1 },
    { id: 'mBack', x: CX + 10, y: CY - 45, w: 100, h: 90, menu: 1 },
  ];
}
const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
let actShow = null; // что сейчас сделает кнопка «действие»
function uiHit(x, y) {
  if (menuOpen) {
    for (const b of UI) if (b.menu && inBox(b, x, y)) { if (b.id === 'mQuit') quit(); else if (b.id === 'mBack') menuOpen = false; return true; }
    menuOpen = false; return true;
  }
  if (shopOpen) { for (const b of shopBoxes) if (inBox(b, x, y)) { if (b.i < 0) shopOpen = false; else if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'buy', i: b.i })); return true; } shopOpen = false; return true; }
  for (const b of UI) if (!b.menu && inBox(b, x, y)) {
    if (b.id === 'exit') { menuOpen = true; sticks.L = sticks.R = sticks.F = null; mouse.down = false; return true; }
    if (b.id === 'map') { bigMap = !bigMap; return true; }
    if (bigMap) { bigMap = false; return true; }
    if (!alive || !priv) continue;
    if (b.id === 'shop') { if (!priv.atHQ) continue; shopOpen = true; return true; }
    if (b.id === 'slot0') wantSlot = 0; else if (b.id === 'slot1') wantSlot = 1; else if (b.id === 'heal') wantHeal = true; else if (b.id === 'reload') wantReload = true; else if (b.id === 'act') { if (!actShow) continue; wantAct = true; }
    return true;
  }
  if (bigMap) { bigMap = false; return true; }
  return false;
}
// выход в главное меню
function quit() {
  menuOpen = false; shopOpen = false;
  if (ws) { ws.onclose = null; try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'quit' })); ws.close(); } catch (e) { } ws = null; }
  started = false; myId = 255; ents = {}; marks = []; loot = new Map(); dead = null; predP = null; pending = []; feed = []; fx = []; nums = []; tracers = []; toasts = [];
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
    if (type >= 1 && type <= 9) { // выстрелы
      const s = A.createBufferSource(); s.buffer = sound.noise; const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = [0, 2600, 1700, 900, 3800, 3200, 2000, 1500, 1200, 2400][type];
      s.connect(f); f.connect(g); const d = [0, .09, .1, .22, .35, .06, .2, .09, .18, .08][type]; g.gain.setValueAtTime(.35 * vol, now); g.gain.exponentialRampToValueAtTime(.001, now + d); s.start(now); s.stop(now + d);
      const o = A.createOscillator(), g2 = A.createGain(); o.type = 'sine'; o.connect(g2); g2.connect(A.destination); o.frequency.setValueAtTime(type === 3 || type === 4 ? 110 : 150, now); o.frequency.exponentialRampToValueAtTime(40, now + .12); g2.gain.setValueAtTime(.45 * vol, now); g2.gain.exponentialRampToValueAtTime(.001, now + .14); o.start(now); o.stop(now + .15); // удар
    } else { const o = A.createOscillator(); o.type = type === 'hit' ? 'square' : 'sine'; o.connect(g);
      const [f0, f1, d, v] = { hit: [900, 600, .05, .06], kill: [660, 1320, .25, .15], pick: [520, 880, .1, .08], dead: [400, 80, .6, .15], win: [520, 1560, .8, .15], bad: [300, 200, .25, .1] }[type];
      o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d); g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(.001, now + d); o.start(now); o.stop(now + d); }
  } catch (e) { }
}

// ===== сеть =====
function connect() {
  const u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const s = ws = new WebSocket(u); ws.binaryType = 'arraybuffer';
  ws.onopen = () => s.send(JSON.stringify({ t: 'join', name: myName, sect: mySect }));
  ws.onmessage = e => { if (ws !== s) return; typeof e.data === 'string' ? onJson(JSON.parse(e.data)) : onSnap(e.data); };
  ws.onclose = () => { if (ws === s && started) setTimeout(() => { if (started && ws === s) connect(); }, 1500); };
}
function toast(s, c) { toasts.unshift({ s, c: c || '#fff', t: 0 }); toasts.length = Math.min(toasts.length, 4); }
function setNames(a) { for (const [id, n, ch, k] of a) { names[id] = { n, ch, k }; delete ents[id]; } }
function onJson(m) {
  if (m.t === 'w') { myId = m.me; names = {}; setNames(m.ents); loot = new Map(); for (const a of m.loot) addLootArr(a); for (const id of m.dead) if (objs[id]) { objs[id].dead = true; G3.killObj(id); } ents = {}; pending = []; predP = null; dead = null; }
  else if (m.t === 'e') setNames(m.a);
  else if (m.t === 'x') { delete names[m.id]; delete ents[m.id]; }
  else if (m.t === 'rs') { if (m.id === myId) { dead = null; predP = null; pending = []; } }
  else if (m.t === 'sc') { score = m; }
  else if (m.t === 'm') { toast(m.s, m.c); if (m.s.startsWith('✔')) sfx('win', .6); else if (m.s.startsWith('⚠') || m.s.startsWith('🚪') || m.s.startsWith('✖')) sfx('bad'); else sfx('pick', .6); }
  else if (m.t === 'l') { if (m.a) for (const a of m.a) addLootArr(a); if (m.d) for (const id of m.d) loot.delete(id); }
  else if (m.t === 'cr') { const o = objs[m.id]; if (o) { o.dead = true; G3.killObj(m.id); sfx(3, vol(o.p) * .7); } }
  else if (m.t === 'k') {
    feed.unshift({ t: performance.now(), k: m.k, v: m.v, w: m.w }); feed.length = Math.min(feed.length, 4);
    const e = ents[m.v]; const p = e ? e.disp || e.h[e.h.length - 1].p : null;
    if (p) { fx.push({ type: 'death', p, v: m.v, aim: e && e.h.length ? e.h[e.h.length - 1].aim : null, t: 0, ch: names[m.v] ? names[m.v].ch : 0, sect: e ? e.sect : -1, wb: e && e.h.length ? e.h[e.h.length - 1].wb & 127 : 0 }); G3.bloodAt(p, 10, true); }
    if (m.k === myId && myId !== 255) sfx('kill');
    delete ents[m.v];
  } else if (m.t === 'say') { says[m.id] = { s: m.s, t: performance.now() }; }
  else if (m.t === 'rit') { sfx('kill', vol(m.p)); for (let i = 0; i < 3; i++) G3.bloodAt(m.p, 30); }
  else if (m.t === 'dead') { dead = { by: m.by, t: performance.now() }; sfx('dead'); }
}
function addLootArr(a) { loot.set(a[0], { id: a[0], k: a[1], x: a[2], r: a[3], n: a[4], p: [a[5], a[6]] }); }
const rdPos = (dv, o) => [dv.getInt16(o, true) / 10, dv.getInt16(o + 2, true) / 10];
function onSnap(buf) {
  const dv = new DataView(buf); let o = 0; const u8 = () => dv.getUint8(o++), u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  if (u8() !== 1) return;
  const tick = dv.getUint32(o, true); o += 4; const ph = u8(); worldT = u16() / 10; const ack = u16(); const mid = u8(); u8(); const n = u8();
  const pv = { hp: u8(), armor: u8(), cur: u8(), s: [[u8(), u8()], [u8(), u8()]], ammo: [u8(), u8(), u8(), u8()], meds: u8(), st: u8(), prog: u8(), kills: u8(), bl: u8() / 1000, mv: u8(),
    money: u16(), xp: u16(), trust: u8(), res: u8(), foll: u8(), sect: u8(), atHQ: u8() };
  alive = ph === 1; myId = mid; priv = pv; if (!pv.atHQ) shopOpen = false;
  const now = performance.now(), est = tick - now / 50;
  if (tickOff === null || est > tickOff || tick < lastTick - 100) tickOff = est; else tickOff += (est - tickOff) * .02;
  lastTick = tick; snapCount++;
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const id = u8(), p = rdPos(dv, o); o += 4; const aim = [dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127]; o += 2;
    const hp = u8(), fl = u8(), wb = u8(); seen.add(id);
    let e = ents[id]; if (!e) e = ents[id] = { id, h: [], walk: 0 };
    e.h.push({ tick, p, aim, hp, fl, wb }); if (e.h.length > 12) e.h.shift(); e.seen = tick; e.sect = ((fl >> 4) & 7) - 1; e.talk = !!(fl & 128);
    if (id === myId && alive) reconcile(p, ack);
  }
  for (const id in ents) if (!seen.has(+id)) ents[id].seen = -1;
  const ns = u8();
  for (let i = 0; i < ns; i++) { const sid = u8(), wb = u8(), end = rdPos(dv, o); o += 4; tracers.push({ sid, wb, end, t: 0, from: null }); if (sid !== myId) sfx(wb & 15, vol(end) * .8); }
  const nh = u8();
  for (let i = 0; i < nh; i++) { const tid = u8(), d = u8(); const e = ents[tid]; nums.push({ p: e && e.disp ? e.disp : null, tid, d, t: 0, crate: tid === 255 }); if (tid !== myId && tid !== 255) { sfx('hit', .9); hitMark = performance.now(); } }
  if (o < dv.byteLength) { const nn = u8(); for (let i = 0; i < nn; i++) { const k = u8(), p = rdPos(dv, o); o += 4; const d = [dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127]; o += 2;
    marks.push({ k: k & 15, side: k >> 4, p, d, t: 0 }); if ((k & 15) === 2) sfx(2, vol(p) * .6); } }
}
function vol(p) { const d = dist(predP || camP, p); return Math.max(0, 1 - d / 900); }
const seqAfter = (a, b) => ((a - b) & 0xffff) > 0 && ((a - b) & 0xffff) < 32768;
function reconcile(sp, ack) {
  pending = pending.filter(x => seqAfter(x.seq, ack));
  let p = sp; for (const x of pending) p = stepMove(objs, p, x.mv, x.slow);
  if (!predP || dist(p, predP) > 80) { predP = p; prevP = p; return; }
  const d = dist(p, predP); predP = d > 2 ? lerp(predP, p, .35) : p;
}

// ===== локальный тик (ввод + предсказание) =====
let myAim = null;
// помощь в прицеливании: ближайший враг в зоне выстрела (свои и нейтральные жители — не цель)
function autoAim(cone) {
  const s = priv && priv.s[priv.cur], w = s ? s[0] & 15 : 0; if (!w || !predP) return null; const rng = WEAPONS[w].range;
  let best = null, bd = 1e9;
  for (const id in ents) { if (+id === myId) continue; const e = ents[id]; if (e.seen < 0 || !e.disp || e.sect === priv.sect || e.sect < 0) continue; const d = dist(e.disp, predP); if (d > rng || d >= bd) continue;
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
  if (menuOpen || !alive || myId === 255 || !predP) return;
  const mv = shopOpen ? [0, 0] : readMove();
  let aim = null, fire = false;
  if (sticks.R) { const v = stickVec(sticks.R); if (v[2] > .15) { aim = scr2map(v[0], v[1]); aimT = performance.now(); } }
  if (sticks.F) { fire = true; const v = stickVec(sticks.F); if (v[2] > .3) { aim = scr2map(v[0], v[1]); aimT = performance.now(); }
    else if (!sticks.R) { const a = autoAim(performance.now() - aimT < 1500); if (a) aim = a; } }
  else if (mouse.used && !touchUI) { const g = G3.screenToGround(mouse.x, mouse.y, 24); if (g && dist(g, predP) > 2) aim = sub(g, predP); fire = mouse.down || !!keys.Space; }
  if (shopOpen) fire = false;
  if (fire) aimT = performance.now();
  const manual = aim && (touchUI ? (sticks.R || sticks.F) : (mouse.down || keys.Space || performance.now() - mouseMoveT < 1200));
  if (manual) myAim = norm(aim);
  else if (len(mv) > .15 && performance.now() - aimT > 600) myAim = norm(mv); // идёт — смотрит по ходу
  else if (aim && !touchUI && !myAim) myAim = norm(aim);
  let fl = (fire ? 1 : 0) | (wantReload ? 2 : 0) | (wantAct ? 4 : 0) | (wantHeal ? 8 : 0);
  if (wantSlot >= 0) fl |= 16 | (wantSlot << 5);
  wantReload = wantAct = wantHeal = false; wantSlot = -1;
  const slow = priv && (priv.st & 6) ? .4 : 1;
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
  if (started) { tickAcc += dt; let k = 0; while (tickAcc >= DT && k < 3) { tickAcc -= DT; k++; localTick(); } if (tickAcc > .2) tickAcc = 0; }
  if (!started) G3.preview(pv, CH_SECT + mySect); else render(dt, now);
  requestAnimationFrame(frame);
}
function render(dt, now) {
  const rt = renderTick();
  const meAlive = alive && predP && myId !== 255;
  let target = null;
  if (meAlive) target = prevP ? lerp(prevP, predP, Math.min(1, tickAcc / DT)) : predP;
  else if (ents[myId]) { const q = interp(ents[myId], rt); if (q) target = q.p; }
  if (target) camP = dist(target, camP) > 300 ? target : lerp(camP, target, meAlive ? 1 : Math.min(1, dt * 6));
  // люди для 3D
  const list = [], labels = [];
  for (const id in ents) {
    const e = ents[id]; if (e.seen < 0 && +id !== myId) continue; const lst = e.h[e.h.length - 1];
    let q;
    if (+id === myId && meAlive) q = { p: target, aim: myAim || lst.aim, s: lst };
    else q = interp(e, rt);
    if (!q) continue;
    const prev = e.disp; e.disp = q.p; const step = prev ? dist(prev, q.p) : 0; e.walk += step * .16; e.mvT = step > .2 ? .15 : (e.mvT || 0) - dt;
    const s = q.s, hurt = e.lastHp !== undefined && s.hp < e.lastHp; e.lastHp = s.hp; if (hurt) e.hitT = .1; e.hitT = (e.hitT || 0) - dt; e.fireT = (e.fireT || 0) - dt;
    const aim = len(q.aim) > .05 ? norm(q.aim) : [0, 1];
    const ch = names[id] ? names[id].ch : 100;
    list.push({ id: +id, ch, p: q.p, aim, wb: s.wb, walk: e.walk, moving: e.mvT > 0, hit: e.hitT > 0, armor: s.fl & 2, fire: e.fireT > .04, sect: e.sect });
    labels.push({ id: +id, p: q.p, hp: s.hp, heal: s.fl & 8, sect: e.sect, talk: e.talk, k: names[id] ? names[id].k : 2 });
  }
  for (const f of fx) { f.t += dt; if (f.type === 'death' && f.t < 12) list.push({ id: 300 + (f.n || (f.n = ++corpseN % 200)), ch: f.ch, p: f.p, aim: f.aim && len(f.aim) > .05 ? norm(f.aim) : [0, 1], wb: f.wb, walk: 0, dead: true, deadT: f.t, sect: f.sect }); }
  fx = fx.filter(f => f.t < 12);
  for (const t of tracers) { t.t += dt; if (!t.from) { const e = t.sid === myId && predP ? predP : ents[t.sid] && ents[t.sid].disp; t.from = e || t.end; if (ents[t.sid]) ents[t.sid].fireT = .1; } }
  const inB = target ? bldAt(objs.blds, target) : -1;
  const cw = meAlive && priv ? priv.s[priv.cur][0] & 15 : 0, zoom = cw && WEAPONS[cw].zoom || 1;
  G3.frame({ now, dt, objs, zone: NOZONE, plan: null, matchT: 0, phase: 0, loot, list, tracers, shipS: [0, 0], shipD: [1, 0], camP, inB, me: meAlive ? target : null, zoom });
  tracers = tracers.filter(t => t.t < .12);
  // ===== 2D поверх 3D =====
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  // следы шагов и выстрелы за стеной
  for (const m of marks) { m.t += dt; const [x, y] = G3.project(m.p, 0);
    if (m.k === 1) { const life = 3; if (m.t > life) continue; const [x2, y2] = G3.project(add(m.p, m.d, 10), 0), a = Math.atan2(y2 - y, x2 - x), sd = m.side ? 1 : -1;
      ctx.save(); ctx.translate(x - Math.sin(a) * sd * 4, y + Math.cos(a) * sd * 4); ctx.rotate(a); ctx.globalAlpha = Math.min(1, (life - m.t) / 1.2) * .9;
      ctx.fillStyle = 'rgba(245,235,210,.95)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(2, 0, 5, 2.6, 0, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(-4.5, 0, 2.2, 2, 0, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.restore(); }
    else if (m.k === 2 && m.t < 1.4) { const k = m.t / 1.4; ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8 + k * 34, 0, 6.2832); ctx.stroke();
      if (x < 0 || x > W || y < 0 || y > H) { const a = Math.atan2(y - CY, x - CX), r = Math.min(W, H) * .44; txt('💥', CX + Math.cos(a) * r, CY + Math.sin(a) * r + 6, 18); } else txt('💥', x, y + 6, 16); ctx.globalAlpha = 1; } }
  marks = marks.filter(m => m.t < 3);
  // подписи: секта цветом, имя рядом, полоска здоровья у раненых
  const mp = target || camP;
  for (const l of labels) {
    if (l.id === myId) continue;
    const [x, y, v] = G3.project(l.p, 76); if (!v) continue;
    const d = dist(l.p, mp), col = sectCol(l.sect);
    if (l.k !== 2 || d < 220) { const nm = names[l.id] ? names[l.id].n : ''; txt(nm, x, y - 10, l.k === 2 ? 11 : 12, l.k === 2 ? '#fff' : col, 'center', 800); }
    blob(ctx, x, y - 1, l.sect >= 0 ? 4.5 : 3, col); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y - 1, l.sect >= 0 ? 4.5 : 3, 0, 6.2832); ctx.stroke();
    if (l.hp < 100) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 16, y + 5, 32, 4); ctx.fillStyle = l.hp > 40 ? '#51cf66' : '#ff6b6b'; ctx.fillRect(x - 16, y + 5, 32 * l.hp / 100, 4); }
    if (l.talk) txt('💬', x + 14, y - 6, 14);
    const sy = says[l.id]; if (sy) { const age = (now - sy.t) / 1000; if (age > 2.8) delete says[l.id]; else { ctx.globalAlpha = Math.min(1, (2.8 - age) * 2); ctx.font = '800 12px system-ui'; const w = ctx.measureText(sy.s).width + 14; ctx.fillStyle = 'rgba(255,255,255,.92)'; rr(ctx, x - w / 2, y - 44, w, 20, 8); ctx.fill(); ctx.fillStyle = sectCol(l.sect); ctx.fillRect(x - 4, y - 25, 8, 5); txt(sy.s, x, y - 30, 12, '#222', 'center', 800); ctx.globalAlpha = 1; } }
    if (l.heal) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + 20, 10, -1.57, -1.57 + 6.2832 * ((now / 1000) % 1)); ctx.stroke(); }
  }
  for (const n of nums) { n.t += dt; if (!n.p && ents[n.tid] && ents[n.tid].disp) n.p = ents[n.tid].disp; if (!n.p) continue; const [x, y, v] = G3.project(n.p, 60 + n.t * 50); if (!v) continue; ctx.globalAlpha = Math.max(0, 1 - n.t / .8); txt(String(n.d), x + 16, y, n.crate ? 13 : 18, n.tid === myId ? '#ff6b6b' : n.crate ? '#ffd8a8' : n.d >= 50 ? '#ffd43b' : '#fff'); ctx.globalAlpha = 1; }
  nums = nums.filter(n => n.t < .8);
  if (meAlive && sticks.F && stickVec(sticks.F)[2] > .3 && myAim && priv) { const s = priv.s[priv.cur]; const w = s[0] & 15; if (w) { const a = G3.project(target, 24), b = G3.project(add(target, myAim, WEAPONS[w].range), 24); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); } }
  hud(now, dt, meAlive, target);
}
// ===== HUD =====
function edgeIcon(to, from, icon, col) { // значок у края экрана в сторону цели
  const a0 = G3.project(from, 0), b0 = G3.project(to, 0); if (b0[0] > 30 && b0[0] < W - 30 && b0[1] > 60 && b0[1] < H - 60) return;
  const a = Math.atan2(b0[1] - a0[1], b0[0] - a0[0]), r = Math.min(W, H) * .42, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.2832); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); txt(icon, x, y + 6, 16);
  ctx.save(); ctx.translate(x + Math.cos(a) * 21, y + Math.sin(a) * 21); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.fill(); ctx.restore();
}
function txt(s, x, y, size, col = '#fff', al = 'center', weight = 900) { ctx.font = `${weight} ${size}px system-ui`; ctx.textAlign = al; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function btn(b, col, alpha = .55) { ctx.fillStyle = `rgba(0,0,0,${alpha})`; rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill(); if (col) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); } }
const ui = id => UI.find(b => b.id === id);
let shopBoxes = [];
function hud(now, dt, meAlive, mePos) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const from = mePos || camP, P = priv, ms = P ? P.sect : mySect;
  // счёт сект: полоска из 4 цветов
  { const tot = Math.max(1, score.n.reduce((a, b) => a + b, 0)), bw = Math.min(300, W * .36), bx = CX - bw / 2; let x = bx;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(ctx, bx - 3, 7, bw + 6, 16, 6); ctx.fill();
    for (let s = 0; s < 4; s++) { const w = bw * score.n[s] / tot; ctx.fillStyle = SECTS[s].col; ctx.fillRect(x, 10, w, 10); if (w > 22) txt(String(score.n[s]), x + w / 2, 20, 10, '#fff', 'center', 800); x += w; }
    txt(SECTS[ms].s, CX, 38, 13, SECTS[ms].col, 'center', 800); }
  minimap(now, from);
  // мои показатели под миникартой
  if (P) { const mb = ui('map'), x = mb.x + 4; let y = mb.y + mb.h + 18; const lv = lvlOf(P.xp), x0 = 40 * lv * lv, x1 = 40 * (lv + 1) * (lv + 1);
    txt('💵 ' + P.money, x, y, 15, '#8ce99a', 'left', 800); y += 19;
    txt('⭐ ' + lv, x, y, 15, '#ffd43b', 'left', 800); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x + 42, y - 9, 60, 6); ctx.fillStyle = '#ffd43b'; ctx.fillRect(x + 42, y - 9, 60 * Math.min(1, (P.xp - x0) / (x1 - x0)), 6); y += 19;
    txt('🤝 ' + P.trust, x, y, 15, P.trust > 70 ? '#8ce99a' : P.trust > 40 ? '#ffd43b' : '#ff6b6b', 'left', 800); y += 19;
    txt(SECTS[ms].ri + ' ' + P.res + '   👥 ' + P.foll + '/' + (2 + lv), x, y, 15, '#fff', 'left', 800); }
  // лента событий (убийства)
  feed.forEach((f, i) => { const age = (now - f.t) / 1000; if (age > 6) return; ctx.globalAlpha = Math.min(1, 6 - age); const y = 74 + i * 19; const a = f.k >= 0 ? (names[f.k] ? names[f.k].n : '?') : '☠', b = names[f.v] ? names[f.v].n : '?';
    txt(a + ' ✖ ' + b, 10, y, 12, '#ddd', 'left', 700); ctx.globalAlpha = 1; });
  // всплывающие сообщения
  toasts.forEach((t, i) => { t.t += dt; const a = Math.min(1, (3.5 - t.t) * 2); if (a <= 0) return; ctx.globalAlpha = a; const y = 62 + i * 24; ctx.font = '800 15px system-ui'; const w = ctx.measureText(t.s).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, CX - w / 2, y - 16, w, 22, 8); ctx.fill(); txt(t.s, CX, y, 15, t.c, 'center', 800); ctx.globalAlpha = 1; });
  toasts = toasts.filter(t => t.t < 3.5);
  if (meAlive && P) {
    // штаб — значок у края экрана
    const hb = objs.blds[HQ[ms]]; edgeIcon(hb.doors[0].o, from, '🏠', SECTS[ms].col);
    const bw = Math.min(260, W * .42), bx = CX - bw / 2, by = H - 24;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, bx - 2, by - 2, bw + 4, 16, 6); ctx.fill();
    ctx.fillStyle = P.hp > 40 ? '#51cf66' : '#ff6b6b'; rr(ctx, bx, by, bw * P.hp / 100, 12, 5); ctx.fill();
    if (P.armor > 0) { ctx.fillStyle = '#4dabf7'; rr(ctx, bx, by - 8, bw * P.armor / 100, 5, 2); ctx.fill(); }
    txt(Math.ceil(P.hp), bx - 18, by + 11, 14, '#fff', 'center', 800);
    for (let i = 0; i < 2; i++) {
      const b = ui('slot' + i), s = P.s[i], w = s[0] & 15, r = s[0] >> 4;
      btn(b, i === P.cur ? (w ? RARITY[r] : '#fff') : null, i === P.cur ? .7 : .4);
      if (w) { ctx.save(); ctx.translate(b.x + b.w * .12, b.y + b.h * .38); gunShape(ctx, w, b.h * .36, RARITY[r]); ctx.restore(); txt(s[1] + ' / ' + P.ammo[WEAPONS[w].ammo], b.x + b.w / 2, b.y + b.h - 6, 12, s[1] ? '#fff' : '#ff6b6b', 'center', 800); }
    }
    if (!touchUI) for (let i = 0; i < 2; i++) { const b = ui('slot' + i); txt(String(i + 1), b.x + 9, b.y + 15, 12, '#ffd43b', 'center', 800); }
    const hb2 = ui('heal'); btn(hb2, P.meds ? '#ff6b6b' : null); txt('✚' + P.meds, hb2.x + hb2.w / 2, hb2.y + hb2.h * .66, 18, P.meds ? '#ff8787' : '#666');
    const rb = ui('reload'); btn(rb, null); txt('⟳', rb.x + rb.w / 2, rb.y + rb.h * .7, 24, '#fff');
    if (P.st) { const k = P.prog / 255, c = P.st & 4 ? SECTS[ms].col : P.st & 2 ? '#ff6b6b' : '#fff'; const [mx, my] = G3.project(mePos, 30); ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(mx, my, 30, -1.57, -1.57 + 6.2832 * k); ctx.stroke(); if (P.st & 4) txt('🗣', mx, my - 38, 20); }
    // кнопка действия: вербовать / подобрать
    actShow = null; let bd = 1e9;
    for (const id in ents) { const e = ents[id]; if (+id === myId || e.seen < 0 || !e.disp || !names[id] || names[id].k !== 2 || e.sect === ms) continue; const d = dist(e.disp, mePos); if (d < 50 && d < bd) { bd = d; actShow = { r: +id }; } }
    if (ms === 1 && P.res > 0) { let crowd = 0; for (const id in ents) { const e = ents[id]; if (e.seen >= 0 && e.disp && names[id] && names[id].k === 2 && e.sect !== 1 && dist(e.disp, mePos) < 140) crowd++; } actShow = crowd ? { rit: crowd } : null; }
    if (!actShow) for (const it of loot.values()) { const d = dist(it.p, mePos); if (d < PR + 30 && d < bd && it.k === 0) { bd = d; actShow = { it }; } }
    if (actShow && !(P.st & 4)) { const b = ui('act');
      if (actShow.rit) { btn(b, SECTS[1].col, .75); txt('🕊 Ритуал', b.x + b.w / 2, b.y + b.h * .48, 16, '#fff', 'center', 900); txt('съесть голубя при ' + actShow.rit + ' зрителях' + (touchUI ? '' : '  [E]'), b.x + b.w / 2, b.y + b.h * .82, 11, '#d0b0ff', 'center', 700); }
      else if (actShow.r !== undefined) { const e = ents[actShow.r], nm = names[actShow.r].n, other = e.sect >= 0; btn(b, SECTS[ms].col, .75); txt('🗣 ' + nm, b.x + b.w / 2, b.y + b.h * .48, 15, '#fff', 'center', 800); txt((other ? 'переманить у «' + SECTS[e.sect].s + '»' : 'завербовать') + (touchUI ? '' : '  [E]'), b.x + b.w / 2, b.y + b.h * .82, 11, other ? sectCol(e.sect) : '#ccc', 'center', 700); }
      else { const it = actShow.it; btn(b, RARITY[it.r], .7); ctx.save(); ctx.translate(b.x + b.w * .25, b.y + b.h * .5); gunShape(ctx, it.x, b.h * .3, RARITY[it.r]); ctx.restore(); txt(touchUI ? '✋' : 'E', b.x + b.w - 18, b.y + b.h * .65, 18); } }
    // магазин в штабе
    if (P.atHQ) { const b = ui('shop'); btn(b, '#ffd43b', .7); txt('🛒', b.x + b.w / 2, b.y + 30, 22); txt(touchUI ? 'магазин' : 'магазин [B]', b.x + b.w / 2, b.y + 46, 10, '#ffd43b', 'center', 800); }
    drawStick(sticks.L, 'rgba(255,255,255,.65)'); drawStick(sticks.R, 'rgba(120,200,255,.7)');
    if (touchUI) { if (!sticks.L) ghostStick(W * .16, H * .68); if (!sticks.R) ghostStick(W * .66, H * .62, '👁');
      const fb = ui('fire'), fs = sticks.F, v = fs ? stickVec(fs) : [0, 0, 0], fx_ = fb.cx + v[0] * 26, fy_ = fb.cy - v[1] * 26;
      ctx.fillStyle = fs ? 'rgba(255,80,60,.75)' : 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(fx_, fy_, fb.r, 0, 6.2832); ctx.fill(); ctx.strokeStyle = fs ? '#fff' : 'rgba(255,107,107,.9)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(fx_, fy_, fb.r * .38, 0, 6.2832); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(fx_ + a * fb.r * .18, fy_ + b * fb.r * .18); ctx.lineTo(fx_ + a * fb.r * .62, fy_ + b * fb.r * .62); } ctx.stroke(); }
    { const hk = (now - hitMark) / 1000; if (hk < .18) { const tp = mouse.used && !touchUI ? [mouse.x, mouse.y] : (myAim ? G3.project(add(mePos, myAim, 120), 24) : [CX, CY]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.globalAlpha = 1 - hk / .18; ctx.beginPath(); for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(tp[0] + a * 6, tp[1] + b * 6); ctx.lineTo(tp[0] + a * 14, tp[1] + b * 14); } ctx.stroke(); ctx.globalAlpha = 1; } } // отметка попадания
    if (mouse.used && !touchUI) { const cw = P.s[P.cur][0] & 15, me2 = G3.project(mePos, 24), dpx = Math.hypot(mouse.x - me2[0], mouse.y - me2[1]), cr = cw ? Math.max(7, Math.min(70, Math.tan(curSpread(WEAPONS[cw], P.bl, P.mv)) * dpx)) : 9;
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, cr, 0, 6.2832); ctx.stroke(); blob(ctx, mouse.x, mouse.y, 2, '#fff'); }
  }
  if (!alive && started && myId !== 255) { ctx.fillStyle = 'rgba(30,0,0,.45)'; ctx.fillRect(0, 0, W, H); const left = dead ? Math.max(0, 5 - (now - dead.t) / 1000) : 0; txt('💀', CX, H * .42, 56); txt('снова в штабе через ' + Math.ceil(left), CX, H * .42 + 40, 18); }
  if (shopOpen && P) drawShop(P);
  // кнопка выхода
  if (started) { const eb = ui('exit'); btn(eb, 'rgba(255,255,255,.7)', .5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(eb.x + 15, eb.y + 15); ctx.lineTo(eb.x + 29, eb.y + 29); ctx.moveTo(eb.x + 29, eb.y + 15); ctx.lineTo(eb.x + 15, eb.y + 29); ctx.stroke(); ctx.lineCap = 'butt'; }
  if (menuOpen) {
    ctx.fillStyle = 'rgba(8,4,24,.72)'; ctx.fillRect(0, 0, W, H);
    const q = ui('mQuit'), b = ui('mBack');
    btn(q, '#ff6b6b', .8); txt('🚪', q.x + q.w / 2, q.y + 52, 36); txt('выйти', q.x + q.w / 2, q.y + 78, 13, '#ff8787', 'center', 800);
    btn(b, '#69db7c', .8); txt('▶', b.x + b.w / 2, b.y + 54, 36, '#69db7c'); txt('играть', b.x + b.w / 2, b.y + 78, 13, '#69db7c', 'center', 800);
  }
  if (!ws || ws.readyState !== 1) { if (started) txt('📡 …', CX, H / 2, 30); }
  if (('ontouchstart' in window) && H > W * 1.1) {
    ctx.fillStyle = 'rgba(8,4,24,.88)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(CX, CY - 20); ctx.rotate(Math.sin(now / 400) * .8 - .8); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 5; rr(ctx, -28, -48, 56, 96, 10); ctx.stroke(); ctx.fillStyle = '#ffd43b'; ctx.fillRect(-6, 36, 12, 4); ctx.restore();
    txt('↻', CX, CY + 80, 44, '#ffd43b'); }
  const fpsCol = fps >= 45 ? '#69db7c' : fps >= 28 ? '#ffd43b' : '#ff6b6b';
  if (PERF && started) { txt(fps + ' FPS', 12, H - 40, 18, fpsCol, 'left'); txt(snapRate + ' snap/s', 12, H - 22, 11, '#ccc', 'left', 700); }
  if (menuOpen) txt(fps + ' FPS', CX, CY + 80, 26, fpsCol);
}
function drawShop(P) {
  ctx.fillStyle = 'rgba(8,4,24,.8)'; ctx.fillRect(0, 0, W, H);
  txt('🛒 Штаб «' + SECTS[P.sect].s + '»   💵 ' + P.money, CX, 40, 20, '#ffd43b');
  const cols = W > 700 ? 5 : 4, bw = Math.min(130, (W - 40) / cols - 10), bh = 70, gx = (W - cols * (bw + 10)) / 2;
  shopBoxes = [];
  SHOP.forEach((it, i) => { const x = gx + (i % cols) * (bw + 10), y = 60 + Math.floor(i / cols) * (bh + 10), b = { x, y, w: bw, h: bh, i };
    const can = P.money >= it.p; btn(b, can ? '#ffd43b' : '#555', .75);
    if (it.noOrden && P.sect === 1) { btn(b, '#555', .6); txt('🕊', x + 22, y + 30, 20); txt('голуби', x + bw / 2 + 10, y + 26, 12, '#aaa', 'center', 800); txt('лови на улице', x + bw / 2, y + 54, 11, '#a259ff', 'center', 700); shopBoxes.push(b); return; }
    const nm = it.n === 'res' ? SECTS[P.sect].res + ' ×10' : it.n, ic = it.n === 'res' ? SECTS[P.sect].ri : it.i;
    txt(ic, x + 22, y + 30, 20); txt(nm, x + bw / 2 + 10, y + 26, 12, '#fff', 'center', 800); txt('$' + it.p, x + bw / 2, y + 56, 16, can ? '#8ce99a' : '#888');
    shopBoxes.push(b); });
  const cb = { x: W - 60, y: 14, w: 46, h: 40, i: -1 }; btn(cb, '#fff'); txt('✕', cb.x + 23, cb.y + 28, 20); shopBoxes.push(cb);
}
function ghostStick(x, y, icon) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.2832); ctx.stroke(); if (icon) { ctx.globalAlpha = .35; txt(icon, x, y + 7, 20); ctx.globalAlpha = 1; } }
function drawStick(s, col) { if (!s) return; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x0, s.y0, 55, 0, 6.2832); ctx.stroke(); const v = stickVec(s); blob(ctx, s.x0 + v[0] * 55, s.y0 - v[1] * 55, 24, col); }
// миникарта — ромб, как камера; дома окрашены в цвет секты, которой принадлежат
function minimap(now, from) {
  const mb = ui('map'), big = bigMap, r = big ? Math.min(W, H) * .45 : mb.w / 2, cx = big ? CX : mb.x + mb.w / 2, cy = big ? CY : mb.y + mb.h / 2;
  const k = r / (HALF * Math.SQRT2);
  const mm = p => [cx + k * dot(p, CAM_R), cy - k * dot(p, CAM_F)];
  ctx.save();
  ctx.setTransform(dpr * k * CAM_R[0], -dpr * k * CAM_F[0], dpr * k * CAM_R[1], -dpr * k * CAM_F[1], dpr * cx, dpr * cy);
  ctx.globalAlpha = .92; ctx.fillStyle = '#5fb83f'; ctx.fillRect(-HALF, -HALF, HALF * 2, HALF * 2); ctx.globalAlpha = 1;
  for (const b of BIOMES) { ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.c[0], b.c[1], b.r, 0, 6.2832); ctx.fill(); }
  objs.blds.forEach((b, i) => { const o = score.b[i]; ctx.fillStyle = o >= 0 ? SECTS[o].col : '#4a4540'; ctx.save(); ctx.translate(b.p[0], b.p[1]); ctx.rotate(b.a); ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); if (HQ.includes(i)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 / k; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); } ctx.restore(); });
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2 / k; ctx.strokeRect(-HALF, -HALF, HALF * 2, HALF * 2);
  ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  HQ.forEach((bi, s) => { const [x, y] = mm(objs.blds[bi].p); txt('★', x, y + 4, big ? 18 : 11, SECTS[s].col); });
  for (const id in ents) { const e = ents[id]; if (e.seen < 0 || +id === myId || !e.disp) continue; const [x, y] = mm(e.disp); blob(ctx, x, y, big ? 4 : 2.2, sectCol(e.sect)); }
  const [mx, my] = mm(from); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, my - 7); ctx.lineTo(mx + 5, my + 5); ctx.lineTo(mx - 5, my + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ===== стартовый экран =====
let myName = '', mySect = Math.floor(Math.random() * 4);
try { myName = localStorage.getItem('le_name') || ''; const c = localStorage.getItem('sect'); if (c !== null) mySect = +c % 4; } catch (e) { }
const nameIn = document.getElementById('name'), pv = document.getElementById('pv'), sbox = document.getElementById('sects'), sdesc = document.getElementById('sdesc');
nameIn.value = myName;
const SDESC = ['Ходят по домам с листовками и обещают счастливую жизнь. Вербуют быстрее всех.', 'Ловят голубей на улицах и съедают их при людях — ритуал вербует сразу нескольких (а остальных пугает).', 'Ищут улики и «открывают глаза». Улики лежат в домах.', 'Плакаты, мероприятия и борьба за улицы.'];
const SICON = ['🩴', '🕯', '👁', '🪧'];
function drawSects() { sbox.innerHTML = ''; SECTS.forEach((s, i) => { const b = document.createElement('button'); b.style.setProperty('--c', s.col); b.className = i === mySect ? 'on' : ''; b.textContent = SICON[i] + ' ' + s.s; b.onclick = () => { mySect = i; drawSects(); }; sbox.appendChild(b); }); sdesc.innerHTML = '<b style="color:' + SECTS[mySect].col + '">' + SECTS[mySect].n + '</b><br>' + SDESC[mySect]; }
drawSects();
document.getElementById('play').onclick = () => {
  myName = (nameIn.value || '').trim().slice(0, 12) || 'Игрок' + Math.floor(Math.random() * 100);
  try { localStorage.setItem('le_name', myName); localStorage.setItem('sect', mySect); } catch (e) { }
  nameIn.blur(); initSound(); document.getElementById('start').style.display = 'none'; started = true; tickOff = null; connect();
  try { if ('ontouchstart' in window) { const d = document.documentElement, fs = d.requestFullscreen || d.webkitRequestFullscreen; const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } };
    if (fs) { const r = fs.call(d); r && r.then ? r.then(lock).catch(lock) : lock(); } else lock(); } } catch (e) { }
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
resize(); layout(); G3.resize(W, H); requestAnimationFrame(frame);
