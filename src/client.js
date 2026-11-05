'use strict';
// ===== LAST EXIT — клиент =====
const PERF = location.hash === '#perf';
const K = 1.5, COSH = K / (K + 1), AH = Math.acos(COSH);
const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ff922b', '#3bc9db', '#f783ac', '#a9e34b', '#e9ecef'];
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, Z = 1, dpr = 1, CX = 0, CY = 0, HR = 0;
let objs = genWorld();
const deco = genDeco();
// ===== состояние сети =====
let ws = null, myId = 255, camId = 255, phase = 0, timer = 0, theta = 0, aliveN = 0, matchT = 0;
let priv = null, names = {}, loot = new Map(), comet = [0, 0, 1], antip = [0, 0, -1], lobbyNames = [];
let plan = null, shipS = [0, 0, 1], shipD = [1, 0, 0], myAir = 0, zone = zoneAt(0, [0, 0, 1], null), smoke = [], ash = [], wantJump = false;
let ents = {}, lastTick = 0, tickOff = null, snapCount = 0, snapRate = 0;
let pending = [], seq = 0, predP = null, prevP = null, tickAcc = 0, outBuf = [];
let camP = norm([.3, .5, .8]), camF = anyTang(camP);
let tracers = [], fx = [], feed = [], nums = [], dead = null, endInfo = null, flash = 0, shake = 0, localCd = 0, myKills = 0;
let started = false, sound = null;

// ===== проекция «маленькая планета» =====
const rhoA = a => R * Math.sin(a) / (1 + K * (1 - Math.cos(a)));
let CP = camP, CF = camF, CR = cross(camF, camP);
function P(q, clamp) {
  const x = dot(q, CR), y = dot(q, CF), z = dot(q, CP);
  let a = Math.acos(Math.max(-1, Math.min(1, z)));
  const vis = a < AH; if (!vis && !clamp) return null; if (!vis) a = AH;
  const l = Math.hypot(x, y), r = rhoA(a) * Z;
  const D = 1 + K * (1 - Math.cos(a)), sc = Z * Math.sqrt(Math.max(.02, (Math.cos(a) * (1 + K) - K) / (D * D * D)));
  if (l < 1e-9) return [CX, CY, vis, sc];
  return [CX + x / l * r, CY - y / l * r, vis, sc];
}
function capPath(c, th, n = 72) {
  const u = anyTang(c), v = cross(c, u), pts = [];
  for (let i = 0; i < n; i++) { const t = i / n * 6.2832; const q = add(mul(c, Math.cos(th)), add(mul(u, Math.cos(t)), v, Math.sin(t)), Math.sin(th)); pts.push(P(q, true)); }
  return pts;
}
function poly(pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// заливка «шапки» сферы (центр c, угловой радиус th): контур прижат к горизонту, сторону выбираем по пробной точке
function fillRegion(pts, cx, cy, r, tp, style) {
  ctx.beginPath();
  if (inPoly(pts, tp[0], tp[1])) poly(pts); else { ctx.arc(cx, cy, r + 2, 0, 6.2832); poly(pts); }
  ctx.fillStyle = style; ctx.fill('evenodd');
}
function capTest(c, th, from, reach) { // видимая точка внутри шапки или null
  const d = angDist(from, c); if (d < th) return from; if (d > th + reach) return null;
  const [q] = moveOn(from, tang(from, c), Math.min(d, reach * .97) * R); return angDist(q, c) < th ? q : null;
}
function fillCap(c, th, style) {
  if (th <= 0) return;
  if (th >= Math.PI - 1e-3) { ctx.beginPath(); ctx.arc(CX, CY, HR + 2, 0, 6.2832); ctx.fillStyle = style; ctx.fill(); return; }
  const t = capTest(c, th, CP, AH); if (!t) return;
  const tp = P(t, true); fillRegion(capPath(c, th), CX, CY, HR, tp, style);
}
const scrDir = (p, d) => { const a = P(p, true), b = P(norm(add(p, d, .01)), true); return Math.atan2(b[1] - a[1], b[0] - a[0]); };

// ===== спрайты =====
const SPR = {}, SS = 2; // 2 пикселя на единицу
function mk(w, h, f) { const c = document.createElement('canvas'); c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS); const g = c.getContext('2d'); g.scale(SS, SS); g.translate(w / 2, h / 2); g.lineJoin = 'round'; f(g, w, h); return c; }
function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function sprite(o) {
  const key = o.type + o.w + 'x' + o.h; if (SPR[key]) return SPR[key];
  const t = OT[o.type], w = o.w, h = o.h, pad = 8;
  const s = mk(w + pad * 2, h + pad * 2, (g) => {
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.6;
    switch (o.type) {
      case 'tree': { const r = w / 2; blob(g, 0, 0, r, '#1f7a34'); g.stroke(); for (const [a, d, k] of [[0, .45, .55], [2.1, .45, .5], [4.2, .45, .52], [1, .1, .6]]) blob(g, Math.cos(a) * r * d, Math.sin(a) * r * d, r * k, '#2f9e44'); blob(g, -r * .3, -r * .3, r * .32, '#51cf66'); blob(g, -r * .38, -r * .4, r * .12, '#8ce99a'); break; }
      case 'pine': { const r = w / 2; for (let k = 0; k < 3; k++) { g.fillStyle = ['#1b5e2a', '#2b8a3e', '#37b24d'][k]; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832, d = (i % 2 ? .62 : 1) * r * (1 - k * .28); g.lineTo(Math.cos(a) * d, Math.sin(a) * d); } g.closePath(); g.fill(); if (!k) g.stroke(); } blob(g, -r * .15, -r * .15, r * .18, '#f1f3f5'); blob(g, r * .3, r * .1, r * .1, '#f1f3f5'); break; }
      case 'rock': { const r = w / 2; g.fillStyle = '#6e7078'; g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.2832, d = r * (.8 + ((i * 37) % 5) / 20); g.lineTo(Math.cos(a) * d, Math.sin(a) * d); } g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#9a9ca5'; g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.2832, d = r * .62; g.lineTo(Math.cos(a) * d - r * .12, Math.sin(a) * d - r * .12); } g.fill(); blob(g, -r * .35, -r * .3, r * .15, '#c1c3cb'); break; }
      case 'hay': { const r = w / 2; blob(g, 0, 0, r, '#c79f2c'); g.stroke(); blob(g, 0, 0, r * .8, '#e7c14a'); g.strokeStyle = '#b08a22'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 40; i++) { const a = i * .5, d = r * .75 * (1 - i / 40); g.lineTo(Math.cos(a) * d, Math.sin(a) * d); } g.stroke(); break; }
      case 'cactus': { const r = w / 2; blob(g, 0, 0, r * .7, '#3f6b08'); g.stroke(); blob(g, r * .55, 0, r * .35, '#4f8a0b'); blob(g, -r * .45, r * .2, r * .3, '#4f8a0b'); blob(g, 0, 0, r * .55, '#5c940d'); blob(g, -r * .15, -r * .15, r * .2, '#82c91e'); g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { const a = i * .785; g.fillRect(Math.cos(a) * r * .5, Math.sin(a) * r * .5, .8, .8); } blob(g, 0, -r * .1, r * .12, '#f783ac'); break; }
      case 'snowman': { const r = w / 2; blob(g, 0, r * .2, r, '#dee2e6'); blob(g, 0, r * .15, r * .9, '#fff'); blob(g, 0, -r * .2, r * .6, '#fff'); g.stroke(); g.fillStyle = '#fd7e14'; g.beginPath(); g.moveTo(0, -r * .2); g.lineTo(r * .9, -r * .1); g.lineTo(0, -r * .05); g.fill(); blob(g, -r * .2, -r * .35, r * .08, '#222'); blob(g, r * .15, -r * .4, r * .08, '#222'); break; }
      case 'igloo': { const r = w / 2; blob(g, 0, 0, r, '#a5d8ff'); g.stroke(); blob(g, 0, 0, r * .9, '#e7f5ff'); g.strokeStyle = '#a5d8ff'; g.lineWidth = 1; for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(0, 0, r * k / 4.2, 0, 6.2832); g.stroke(); } g.fillStyle = '#4d7ea8'; g.fillRect(r * .7, -r * .18, r * .4, r * .36); break; }
      case 'crate': { g.fillStyle = '#7b5528'; rr(g, -w / 2, -h / 2, w, h, 3); g.fill(); g.stroke(); g.fillStyle = '#c08a45'; rr(g, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 2); g.fill(); g.strokeStyle = '#8f6430'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-w / 2 + 4, -h / 2 + 4); g.lineTo(w / 2 - 4, h / 2 - 4); g.moveTo(w / 2 - 4, -h / 2 + 4); g.lineTo(-w / 2 + 4, h / 2 - 4); g.stroke(); g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(0, 0, 4, 0, 6.2832); g.fill(); break; }
      case 'car': { const col = ['#3d8bd9', '#e03131', '#f59f00', '#f1f3f5', '#37b24d'][(w + h) % 5]; g.fillStyle = '#222'; for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.fillRect(sx * w * .3 - 4, sy * h / 2 - 2, 8, 4); g.fillStyle = col; rr(g, -w / 2, -h / 2 + 2, w, h - 4, 6); g.fill(); g.stroke(); g.fillStyle = '#a5d8ff'; rr(g, w * .05, -h / 2 + 5, w * .2, h - 10, 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; rr(g, -w * .25, -h / 2 + 5, w * .28, h - 10, 3); g.fill(); break; }
      case 'house': case 'house2': case 'barn': case 'bunker': case 'market': case 'tent': case 'wall': {
        g.fillStyle = t.c2; rr(g, -w / 2, -h / 2, w, h, o.type === 'wall' ? 2 : 4); g.fill(); g.stroke();
        if (o.type === 'house' || o.type === 'barn' || o.type === 'tent') { // двускатная крыша
          g.fillStyle = shade(t.c2, .18); g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 2 - 2);
          g.strokeStyle = shade(t.c2, -.25); g.lineWidth = 2.5; g.beginPath(); g.moveTo(-w / 2 + 3, 0); g.lineTo(w / 2 - 3, 0); g.stroke();
          g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.15)'; for (let x = -w / 2 + 8; x < w / 2; x += 8) { g.beginPath(); g.moveTo(x, -h / 2 + 3); g.lineTo(x, h / 2 - 3); g.stroke(); }
          if (o.type === 'house') { g.fillStyle = '#6c757d'; g.fillRect(w * .22, -h * .36, 12, 12); g.fillStyle = '#495057'; g.fillRect(w * .22 + 2, -h * .36 + 2, 8, 8); }
          if (o.type === 'barn') { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-w / 2 + 6, -h / 2 + 6); g.lineTo(w / 2 - 6, h / 2 - 6); g.moveTo(w / 2 - 6, -h / 2 + 6); g.lineTo(-w / 2 + 6, h / 2 - 6); g.stroke(); }
        } else if (o.type === 'house2') { g.fillStyle = t.col; rr(g, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 3); g.fill(); g.fillStyle = '#adb5bd'; g.fillRect(-w * .25, -h * .2, 16, 12); g.fillStyle = '#868e96'; blob(g, -w * .25 + 8, -h * .2 + 6, 4, '#868e96'); g.fillStyle = '#3d7ec7'; g.fillRect(w * .1, h * .05, 14, 14); }
        else if (o.type === 'bunker') { g.fillStyle = t.col; rr(g, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 8); g.fill(); g.fillStyle = '#c9b77c'; for (let x = -w / 2 + 2; x < w / 2; x += 10) { blob(g, x + 4, -h / 2 + 2, 4.5, '#c9b77c'); blob(g, x + 4, h / 2 - 2, 4.5, '#c9b77c'); } g.fillStyle = '#222'; g.fillRect(-w * .2, -3, w * .4, 6); }
        else if (o.type === 'market') { g.fillStyle = t.col; g.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8); g.fillStyle = '#e94e77'; g.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, 14); g.fillStyle = '#fff'; for (let x = -w / 2 + 10; x < w / 2 - 10; x += 22) g.fillRect(x, -h / 2 + 8, 11, 6); g.fillStyle = '#a5d8ff'; for (let x = -w / 2 + 24; x < w / 2 - 20; x += 46) for (let y = -h / 2 + 34; y < h / 2 - 20; y += 44) { g.fillRect(x, y, 26, 20); } }
        else if (o.type === 'wall') { g.fillStyle = t.col; g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4); g.strokeStyle = 'rgba(0,0,0,.2)'; for (let x = -w / 2 + 15; x < w / 2; x += 15) { g.beginPath(); g.moveTo(x, -h / 2); g.lineTo(x, h / 2); g.stroke(); } }
        break; }
    }
  });
  const sh = mk(w + pad * 2, h + pad * 2, () => { }); const sg = sh.getContext('2d'); sg.globalAlpha = .28; sg.drawImage(s, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, sh.width, sh.height);
  return SPR[key] = { s, sh, round: OT[o.type].s === 0 };
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = c => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)))); return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
// мелкий декор (трава, цветы, камушки) — без столкновений
function genDeco() {
  const rnd = mkRng(99), out = [];
  for (let i = 0; i < 2600; i++) {
    const p = rndSphere(rnd); let b = -1; for (let k = 0; k < BIOMES.length; k++) if (angDist(p, BIOMES[k].c) < BIOMES[k].r) { b = k; break; }
    const n = BIOMES[b] ? BIOMES[b].n : 'grass';
    const t = n === 'snow' ? (rnd() < .6 ? 'snowt' : 'ice') : n === 'desert' ? (rnd() < .6 ? 'dry' : 'peb') : n === 'city' || n === 'market' ? (rnd() < .5 ? 'crack' : 'peb') : n === 'farm' ? (rnd() < .6 ? 'wheat' : 'flw') : (rnd() < .62 ? 'tuft' : rnd() < .7 ? 'flw' : 'peb');
    out.push({ p, t, v: Math.floor(rnd() * 3), a: rnd() * 6.28 });
  }
  return out;
}
const DECO = {};
function decoSpr(t, v) {
  const k = t + v; if (DECO[k]) return DECO[k];
  const fl = ['#ff8787', '#ffe066', '#e599f7'][v];
  return DECO[k] = mk(16, 16, g => {
    if (t === 'tuft' || t === 'dry' || t === 'wheat' || t === 'snowt') { g.strokeStyle = t === 'tuft' ? ['#4c9a2a', '#5fb137', '#3f8a24'][v] : t === 'dry' ? '#b08d57' : t === 'wheat' ? '#c9a227' : '#cfd8e0'; g.lineWidth = 1.4; g.lineCap = 'round'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 1.6, 4); g.lineTo(i * 2.6, -3 - Math.abs(2 - Math.abs(i))); g.stroke(); } }
    else if (t === 'flw') { for (let i = 0; i < 5; i++) blob(g, Math.cos(i * 1.26) * 2.4, Math.sin(i * 1.26) * 2.4, 1.8, fl); blob(g, 0, 0, 1.4, '#fff3bf'); }
    else if (t === 'peb' || t === 'ice') { blob(g, 0, 0, 2.6 + v, t === 'ice' ? '#d0ebff' : '#a19b8f'); blob(g, -.8, -.8, 1.1, 'rgba(255,255,255,.5)'); }
    else if (t === 'crack') { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -2); g.lineTo(-1, 1); g.lineTo(2, -3); g.lineTo(6, 2); g.stroke(); }
  });
}
const EMBER = mk(16, 16, g => { g.strokeStyle = '#ff6b1a'; g.lineWidth = 1.6; g.shadowColor = '#ff922b'; g.shadowBlur = 4; g.beginPath(); g.moveTo(-6, -2); g.lineTo(-1, 1); g.lineTo(2, -4); g.lineTo(6, 1); g.moveTo(-1, 1); g.lineTo(0, 6); g.stroke(); });
const FLAME = mk(24, 30, g => { const gr = g.createRadialGradient(0, 4, 1, 0, 2, 13); gr.addColorStop(0, '#fff3bf'); gr.addColorStop(.35, '#ffd43b'); gr.addColorStop(.7, '#ff6b1a'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(10, 0, 0, 13); g.quadraticCurveTo(-10, 0, 0, -14); g.fill(); });
// оружие / лут
function gunShape(g, w, len, col) {
  const L = [0, .9, 1.6, 1.45, 2.1, 1.15][w] * len, T = w === 3 ? .34 : .26;
  g.fillStyle = '#2b2b2b'; g.fillRect(len * .35, -len * T / 2, L, len * T);
  g.fillStyle = col; g.fillRect(len * .35, -len * T / 2, L * .35, len * T);
  if (w === 4) { g.fillStyle = '#111'; g.fillRect(len * .7, -len * .22, len * .55, len * .14); }
  if (w === 2 || w === 5) { g.fillStyle = '#2b2b2b'; g.fillRect(len * .9, len * .1, len * .2, len * .35); }
}
function lootSpr(k, x, r) {
  const key = 'L' + k + '_' + x + '_' + r; if (SPR[key]) return SPR[key];
  return SPR[key] = mk(44, 44, g => {
    const col = k === 0 ? RARITY[r] : k === 1 ? AMMO_COL[x] : k === 2 ? '#ff6b6b' : '#4dabf7';
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 20); gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 20, 0, 6.2832); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.5;
    if (k === 0) { g.save(); g.translate(-15, 0); gunShape(g, x, 12, col); g.restore(); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 15, 0, 6.2832); g.stroke(); }
    else if (k === 1) { g.fillStyle = '#495057'; rr(g, -8, -6, 16, 12, 2); g.fill(); g.stroke(); g.fillStyle = col; for (let i = -1; i <= 1; i++) { rr(g, i * 4.5 - 1.6, -9, 3.2, 8, 1.5); g.fill(); } }
    else if (k === 2) { g.fillStyle = '#fff'; rr(g, -9, -7, 18, 14, 3); g.fill(); g.stroke(); g.fillStyle = '#e03131'; g.fillRect(-2, -5, 4, 10); g.fillRect(-5, -2, 10, 4); }
    else { g.fillStyle = '#1c7ed6'; g.beginPath(); g.moveTo(-8, -9); g.lineTo(-3, -9); g.lineTo(0, -5); g.lineTo(3, -9); g.lineTo(8, -9); g.lineTo(9, 9); g.lineTo(-9, 9); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#74c0fc'; g.fillRect(-6, 0, 12, 3); }
  });
}
// ===== персонажи =====
function drawChar(g, x, y, r, ang, ch, wb, o = {}) {
  const col = COLORS[ch % COLORS.length];
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(r * .25, r * .4, r * 1.02, r * .8, 0, 0, 6.2832); g.fill();
  if (o.scale) g.scale(o.scale, o.scale);
  g.rotate(ang);
  g.lineWidth = Math.max(1.5, r * .14); g.strokeStyle = '#1a1a1a';
  const w = wb & 15, rar = wb >> 4;
  if (w) gunShape(g, w, r, RARITY[rar]);
  const bob = o.walk ? Math.sin(o.walk) * r * .12 : 0;
  g.fillStyle = col;
  if (w) { g.beginPath(); g.arc(r * .9, r * .42 + bob * .3, r * .3, 0, 6.2832); g.fill(); g.stroke(); g.beginPath(); g.arc(r * .62, -r * .48 - bob * .3, r * .3, 0, 6.2832); g.fill(); g.stroke(); }
  else { g.beginPath(); g.arc(r * .55, r * .78 + bob, r * .3, 0, 6.2832); g.fill(); g.stroke(); g.beginPath(); g.arc(r * .55, -r * .78 - bob, r * .3, 0, 6.2832); g.fill(); g.stroke(); }
  if (o.armor) { g.fillStyle = '#1c7ed6'; g.beginPath(); g.arc(0, 0, r * 1.12, 0, 6.2832); g.fill(); g.stroke(); }
  g.fillStyle = o.hit ? '#fff' : col; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(-r * .3, -r * .3, r * .45, 0, 6.2832); g.fill();
  // аксессуар
  g.lineWidth = Math.max(1.2, r * .1);
  switch (ch % 10) {
    case 0: g.fillStyle = '#e03131'; g.beginPath(); g.arc(-r * .1, 0, r * .78, 1.3, 4.98); g.fill(); g.stroke(); g.fillRect(r * .2, -r * .55, r * .5, r * 1.1); break; // кепка
    case 1: g.fillStyle = '#8b5a2b'; g.beginPath(); g.ellipse(-r * .1, 0, r * 1.25, r * 1.05, 0, 0, 6.2832); g.fill(); g.stroke(); blob(g, -r * .1, 0, r * .62, '#a0522d'); break; // ковбой
    case 2: g.fillStyle = '#5c6b3c'; g.beginPath(); g.arc(-r * .12, 0, r * .86, 0, 6.2832); g.fill(); g.stroke(); blob(g, -r * .3, -r * .25, r * .2, '#7a8a52'); break; // каска
    case 3: g.fillStyle = '#ffd43b'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832, d = i % 2 ? r * .35 : r * .62; g.lineTo(Math.cos(a) * d - r * .15, Math.sin(a) * d); } g.closePath(); g.fill(); g.stroke(); break; // корона
    case 4: g.strokeStyle = '#e03131'; g.lineWidth = r * .25; g.beginPath(); g.arc(0, 0, r * .82, 1.7, 4.6); g.stroke(); g.lineWidth = r * .16; g.beginPath(); g.moveTo(-r * .8, 0); g.lineTo(-r * 1.4, r * .3); g.stroke(); break; // повязка
    case 5: g.fillStyle = col; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-r * .2, s * r * .45); g.lineTo(-r * .95, s * r * .95); g.lineTo(-r * .55, s * r * .1); g.fill(); g.stroke(); } break; // ушки
    case 6: g.fillStyle = '#7048e8'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-r * .6 + i * r * .25, -r * .12); g.lineTo(-r * 1.05 + i * r * .25, 0); g.lineTo(-r * .6 + i * r * .25, r * .12); g.fill(); } break; // ирокез
    case 7: g.fillStyle = '#f59f00'; g.beginPath(); g.arc(-r * .1, 0, r * 1.4, 0, 6.2832); g.fill(); g.stroke(); blob(g, -r * .1, 0, r * .6, '#e8590c'); g.strokeStyle = '#e03131'; g.beginPath(); g.arc(-r * .1, 0, r * 1.1, 0, 6.2832); g.stroke(); break; // сомбреро
    case 8: g.fillStyle = '#f8f9fa'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-r * .1, s * r * .7); g.quadraticCurveTo(-r * .2, s * r * 1.5, -r * .9, s * r * 1.3); g.quadraticCurveTo(-r * .4, s * r * 1.05, -r * .4, s * r * .6); g.fill(); g.stroke(); } g.fillStyle = '#868e96'; g.beginPath(); g.arc(-r * .1, 0, r * .7, 1.3, 4.98); g.fill(); break; // викинг
    case 9: g.fillStyle = '#fff'; blob(g, -r * .25, 0, r * .62, '#fff'); g.stroke(); blob(g, -r * .55, -r * .3, r * .3, '#fff'); blob(g, -r * .55, r * .3, r * .3, '#fff'); break; // повар
  }
  // глаза
  const blink = o.blink ? .15 : 1;
  for (const s of [-1, 1]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(r * .48, s * r * .32, r * .24, r * .24 * blink, 0, 0, 6.2832); g.fill();
    if (o.dead) { g.strokeStyle = '#000'; g.lineWidth = r * .1; g.beginPath(); g.moveTo(r * .36, s * r * .32 - r * .12); g.lineTo(r * .6, s * r * .32 + r * .12); g.moveTo(r * .6, s * r * .32 - r * .12); g.lineTo(r * .36, s * r * .32 + r * .12); g.stroke(); }
    else if (blink > .5) blob(g, r * .58, s * r * .3, r * .12, '#000');
  }
  if (ch % 10 === 1 || ch % 10 === 6) { g.strokeStyle = '#3b2a1a'; g.lineWidth = r * .12; g.beginPath(); g.moveTo(r * .78, -r * .3); g.quadraticCurveTo(r * .95, 0, r * .78, r * .3); g.stroke(); } // усы
  g.restore();
}
// ===== фон =====
let bg = null, rim = null;
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
  Z = Math.min(W, H) / 470; CX = W / 2; CY = H / 2; HR = rhoA(AH) * Z;
  bg = document.createElement('canvas'); bg.width = W * dpr; bg.height = H * dpr; const g = bg.getContext('2d'); g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, W, H); sky.addColorStop(0, '#120a35'); sky.addColorStop(.6, '#0b0820'); sky.addColorStop(1, '#1d0b2e'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const neb = g.createRadialGradient(W * .85, H * .15, 0, W * .85, H * .15, W * .4); neb.addColorStop(0, 'rgba(204,93,232,.25)'); neb.addColorStop(1, 'rgba(204,93,232,0)'); g.fillStyle = neb; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${.3 + Math.random() * .7})`; const s = Math.random() * 1.7 + .3; g.fillRect(Math.random() * W, Math.random() * H, s, s); }
  const at = g.createRadialGradient(CX, CY, HR * .97, CX, CY, HR * 1.14); at.addColorStop(0, 'rgba(130,210,255,.75)'); at.addColorStop(1, 'rgba(130,210,255,0)'); g.fillStyle = at; g.beginPath(); g.arc(CX, CY, HR * 1.14, 0, 6.2832); g.fill();
  rim = ctx.createRadialGradient(CX, CY, HR * .55, CX, CY, HR); rim.addColorStop(0, 'rgba(0,10,30,0)'); rim.addColorStop(1, 'rgba(0,10,40,.42)');
}
addEventListener('resize', () => { resize(); layout(); });

// ===== ввод =====
const keys = {}; let mouse = { x: 0, y: 0, down: false, used: false }, sticks = { L: null, R: null }, touchUI = false;
let wantSlot = -1, wantReload = false, wantHeal = false, wantPick = false, bigMap = false;
addEventListener('keydown', e => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; keys[e.code] = 1; if (e.code === 'Digit1') wantSlot = 0; if (e.code === 'Digit2') wantSlot = 1; if (e.code === 'KeyR') wantReload = true; if (e.code === 'KeyE' || e.code === 'KeyF') wantPick = true; if (e.code === 'Space') wantJump = true; if (e.code === 'KeyQ' || e.code === 'KeyH') wantHeal = true; if (e.code === 'KeyM') bigMap = !bigMap; if (e.code === 'Tab') { e.preventDefault(); specNext(); } });
addEventListener('keyup', e => { keys[e.code] = 0; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; });
cv.addEventListener('mousedown', e => { if (uiHit(e.clientX, e.clientY)) return; mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('wheel', e => { wantSlot = priv ? 1 - priv.cur : -1; });
cv.addEventListener('touchstart', e => { touchUI = true; initSound();
  for (const t of e.changedTouches) { if (uiHit(t.clientX, t.clientY)) continue; const s = t.clientX < W / 2 ? 'L' : 'R'; if (!sticks[s]) sticks[s] = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }; }
  e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === t.identifier) { sticks[s].x = t.clientX; sticks[s].y = t.clientY; } e.preventDefault(); }, { passive: false });
const tend = e => { for (const t of e.changedTouches) for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === t.identifier) sticks[s] = null; };
cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
const stickVec = s => { if (!s) return [0, 0, 0]; let dx = s.x - s.x0, dy = s.y - s.y0; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } return [dx / m, -dy / m, Math.min(1, l / m)]; };
// кнопки интерфейса
let UI = [];
function layout() {
  const s = Math.max(44, Math.min(64, Math.min(W, H) * .13)), by = H - s * .5 - 30;
  UI = [
    { id: 'slot0', x: CX - s * 1.15, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'slot1', x: CX + s * .05, y: by - s * .65, w: s * 1.1, h: s * .8 },
    { id: 'heal', x: CX - s * 2.25, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'reload', x: CX + s * 1.35, y: by - s * .6, w: s * .9, h: s * .75 },
    { id: 'pick', x: CX - s * .7, y: by - s * 1.85, w: s * 1.4, h: s * .95 },
    { id: 'map', x: W - 130, y: 6, w: 124, h: 124 },
    { id: 'spec', x: CX + 90, y: H - 64, w: 56, h: 44 },
    { id: 'jump', x: CX - 50, y: H - 110, w: 100, h: 80 },
  ];
}
let pickShow = null;
function uiHit(x, y) {
  for (const b of UI) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
    if (b.id === 'map') { bigMap = !bigMap; return true; }
    if (bigMap) { bigMap = false; return true; }
    if (b.id === 'jump' && myAir === 1 && phase === 1 && !dead) { wantJump = true; return true; }
    const alive = myId !== 255 && ents[myId] && phase === 1 && !dead && !myAir;
    if (b.id === 'spec' && !alive && phase === 1) { specNext(); return true; }
    if (!alive) continue;
    if (b.id === 'slot0') wantSlot = 0; else if (b.id === 'slot1') wantSlot = 1; else if (b.id === 'heal') wantHeal = true; else if (b.id === 'reload') wantReload = true; else if (b.id === 'pick') { if (!pickShow) continue; wantPick = true; }
    return true;
  }
  if (bigMap) { bigMap = false; return true; }
  return false;
}
function specNext() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'spec' })); }

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
      const [f0, f1, d, v] = { hit: [900, 600, .05, .06], kill: [660, 1320, .25, .15], pick: [520, 880, .1, .08], boom: [90, 30, 1.2, .5], dead: [400, 80, .6, .15], win: [520, 1560, .8, .15] }[type];
      o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d); g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(.001, now + d); o.start(now); o.stop(now + d); }
  } catch (e) { }
}

// ===== сеть =====
function connect() {
  const u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  ws = new WebSocket(u); ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: myName, char: myChar }));
  ws.onmessage = e => typeof e.data === 'string' ? onJson(JSON.parse(e.data)) : onSnap(e.data);
  ws.onclose = () => { setTimeout(connect, 1500); };
}
function onJson(m) {
  if (m.t === 'match') {
    objs = genWorld(); for (const id of m.dead) if (objs[id]) objs[id].dead = true;
    loot = new Map(); for (const a of m.loot) addLootArr(a);
    names = {}; for (const [id, n, ch, bot] of m.pl) names[id] = { n, ch, bot };
    comet = m.comet; antip = mul(comet, -1); plan = m.plan; shipS = m.ship[0]; shipD = m.ship[1]; myAir = 1; smoke = []; ents = {}; pending = []; predP = null; dead = null; endInfo = null; feed = []; fx = []; myKills = 0;
    if (m.mt < 1) { flash = 0; }
  } else if (m.t === 'l') { if (m.a) for (const a of m.a) addLootArr(a); if (m.d) for (const id of m.d) loot.delete(id); }
  else if (m.t === 'cr') { const o = objs[m.id]; if (o) { o.dead = true; fx.push({ type: 'crate', p: o.p, t: 0 }); sfx(3, vol(o.p) * .7); } }
  else if (m.t === 'k') {
    feed.unshift({ t: performance.now(), k: m.k, v: m.v, w: m.w }); feed.length = Math.min(feed.length, 5);
    const e = ents[m.v]; const p = e ? e.disp || e.h[e.h.length - 1].p : null;
    if (p) fx.push({ type: 'death', p, t: 0, ch: names[m.v] ? names[m.v].ch : 0, spin: Math.random() < .5 ? 1 : -1 });
    if (m.k === myId && myId !== 255) { myKills++; sfx('kill'); }
    delete ents[m.v];
  } else if (m.t === 'dead') { dead = { place: m.place, by: m.by, t: performance.now() }; sfx('dead'); }
  else if (m.t === 'end') { endInfo = { w: m.w, t: performance.now() }; sfx('win'); }
  else if (m.t === 'lobby') { phase = 0; dead = null; endInfo = null; ents = {}; loot = new Map(); objs = genWorld(); theta = 0; }
  else if (m.t === 'lb') { lobbyNames = m.n; }
}
function addLootArr(a) { loot.set(a[0], { id: a[0], k: a[1], x: a[2], r: a[3], n: a[4], p: [a[5], a[6], a[7]] }); }
const rd16 = (dv, o) => norm([dv.getInt16(o, true) / 32767, dv.getInt16(o + 2, true) / 32767, dv.getInt16(o + 4, true) / 32767]);
function onSnap(buf) {
  const dv = new DataView(buf); let o = 0; const u8 = () => dv.getUint8(o++);
  if (u8() !== 1) return;
  const tick = dv.getUint32(o, true); o += 4; const ph = u8(); const tm = dv.getUint16(o, true); o += 2;
  const th = dv.getUint16(o, true) / 65535 * Math.PI; o += 2; const ack = dv.getUint16(o, true); o += 2;
  const mid = u8(), cid = u8(), an = u8();
  const pv = { hp: u8(), armor: u8(), cur: u8(), s: [[u8(), u8()], [u8(), u8()]], ammo: [u8(), u8(), u8(), u8()], meds: u8(), st: u8(), prog: u8(), kills: u8() };
  if (ph === 1 && phase !== 1) { flash = 0; }
  phase = ph; timer = tm; theta = th; aliveN = an; myId = mid; camId = cid; priv = pv; if (ph === 1) matchT = tm / 10;
  // часы сервера
  const now = performance.now(), est = tick - now / 50;
  if (tickOff === null || est > tickOff || tick < lastTick - 100) tickOff = est; else tickOff += (est - tickOff) * .02;
  lastTick = tick; snapCount++;
  const n = u8(); const seen = new Set();
  for (let i = 0; i < n; i++) {
    const id = u8(), p = rd16(dv, o); o += 6; const aim = [dv.getInt8(o) / 127, dv.getInt8(o + 1) / 127, dv.getInt8(o + 2) / 127]; o += 3;
    const hp = u8(), fl = u8(), wb = u8(); seen.add(id);
    let e = ents[id]; if (!e) e = ents[id] = { id, h: [], walk: 0 };
    e.h.push({ tick, p, aim, hp, fl, wb }); if (e.h.length > 12) e.h.shift(); e.seen = tick;
    if (id === myId && ph === 1) { myAir = (fl >> 4) & 3; if (myAir) { predP = null; pending = []; } else reconcile(p, ack); }
  }
  for (const id in ents) if (!seen.has(+id)) ents[id].seen = -1;
  const ns = u8();
  for (let i = 0; i < ns; i++) { const sid = u8(), wb = u8(), end = rd16(dv, o); o += 6; tracers.push({ sid, wb, end, t: 0, from: null }); if (sid !== myId) sfx(wb & 15, vol(end) * .8); }
  const nh = u8();
  for (let i = 0; i < nh; i++) { const tid = u8(), d = u8(); const e = ents[tid]; nums.push({ p: e && e.disp ? e.disp : null, tid, d, t: 0, crate: tid === 255 }); if (tid !== myId) sfx('hit', .7); }
}
function vol(p) { const c = predP || camP; const d = angDist(c, p) * R; return Math.max(0, 1 - d / 900); }
const seqAfter = (a, b) => ((a - b) & 0xffff) > 0 && ((a - b) & 0xffff) < 32768;
function reconcile(sp, ack) {
  pending = pending.filter(x => seqAfter(x.seq, ack));
  let p = sp; for (const x of pending) p = stepMove(objs, p, x.mv, x.slow);
  if (!predP || angDist(p, predP) * R > 80) { predP = p; prevP = p; return; }
  // мягкая поправка
  const d = angDist(p, predP) * R; predP = d > 2 ? slerpN(predP, p, .35) : p;
}

// ===== локальный тик (ввод + предсказание) =====
let fireHeld = false;
function localTick() {
  const inAir = phase === 1 && myId !== 255 && !dead && myAir;
  if (inAir) {
    let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my++; if (keys.KeyS || keys.ArrowDown) my--; if (keys.KeyD || keys.ArrowRight) mx++; if (keys.KeyA || keys.ArrowLeft) mx--;
    if (sticks.L) { const v = stickVec(sticks.L); mx = v[0]; my = v[1]; }
    const mv = add(mul(cross(camF, camP), mx), camF, my);
    const fl = (wantJump || keys.Space || mouse.down || wantPick) ? 64 : 0; wantJump = wantPick = false;
    seq = (seq + 1) & 0xffff; outBuf.push([seq, mv, [0, 0, 0], fl, renderTick()]); if (outBuf.length >= 2 || fl) flushInput();
    return;
  }
  const alive = phase === 1 && myId !== 255 && !dead && predP;
  if (!alive) return;
  const CRm = cross(camF, predP);
  let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my++; if (keys.KeyS || keys.ArrowDown) my--; if (keys.KeyD || keys.ArrowRight) mx++; if (keys.KeyA || keys.ArrowLeft) mx--;
  if (sticks.L) { const v = stickVec(sticks.L); mx = v[0]; my = v[1]; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  const mv = add(mul(CRm, mx), camF, my);
  let aim = null, fire = false;
  if (sticks.R) { const v = stickVec(sticks.R); if (v[2] > .2) aim = add(mul(CRm, v[0]), camF, v[1]); fire = v[2] > .6; }
  else if (mouse.used && !touchUI) { const ax = mouse.x - CX, ay = -(mouse.y - CY); if (ax || ay) aim = add(mul(CRm, ax), camF, ay); fire = mouse.down || !!keys.Space; }
  if (aim) myAim = tang(predP, aim);
  let fl = (fire ? 1 : 0) | (wantReload ? 2 : 0) | (wantPick ? 4 : 0) | (wantHeal ? 8 : 0);
  if (wantSlot >= 0) fl |= 16 | (wantSlot << 5);
  wantReload = wantPick = wantHeal = false; wantSlot = -1;
  fireHeld = fire;
  const slow = priv && (priv.st & 2) ? .5 : 1;
  seq = (seq + 1) & 0xffff;
  prevP = predP; predP = stepMove(objs, predP, mv, slow);
  pending.push({ seq, mv, slow });
  const rt = renderTick();
  outBuf.push([seq, mv, myAim || [0, 0, 0], fl, rt]);
  if (outBuf.length >= 2 || (fl & 0x3e)) flushInput();
}
let myAim = null;
function flushInput() {
  if (!outBuf.length || !ws || ws.readyState !== 1) { outBuf = []; return; }
  const b = new ArrayBuffer(2 + outBuf.length * 12), dv = new DataView(b); dv.setUint8(0, 1); dv.setUint8(1, outBuf.length);
  let o = 2;
  for (const [s, mv, aim, fl, rt] of outBuf) {
    dv.setUint16(o, s, true); dv.setInt8(o + 2, i8(mv[0])); dv.setInt8(o + 3, i8(mv[1])); dv.setInt8(o + 4, i8(mv[2]));
    dv.setInt8(o + 5, i8(aim[0])); dv.setInt8(o + 6, i8(aim[1])); dv.setInt8(o + 7, i8(aim[2])); dv.setUint8(o + 8, fl);
    const t = Math.max(0, rt); dv.setUint16(o + 9, Math.floor(t) & 0xffff, true); dv.setUint8(o + 11, Math.floor((t % 1) * 256)); o += 12;
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
  return { p: slerpN(a.p, b.p, f), aim: slerpN(a.aim, b.aim, f), s: b };
}

// ===== кадр =====
let fps = 0, fc = 0, ft = 0, last = performance.now(), blinkT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; fc++; ft += dt; if (ft >= .5) { fps = Math.round(fc / ft); snapRate = Math.round(snapCount / ft); fc = 0; ft = 0; snapCount = 0; }
  if (started) {
    tickAcc += dt; let k = 0; while (tickAcc >= DT && k < 3) { tickAcc -= DT; k++; localTick(); } if (tickAcc > .2) tickAcc = 0;
    if (phase === 1) matchT += dt;
    localCd -= dt;
  }
  render(dt, now);
  requestAnimationFrame(frame);
}
function render(dt, now) {
  const rt = renderTick();
  // камера
  zone = phase >= 1 ? zoneAt(matchT, comet, plan) : zoneAt(0, comet, null);
  const meIn = phase === 1 && myId !== 255 && !dead;
  const meAlive = meIn && !myAir && predP;
  let target = null;
  if (meAlive) target = prevP ? slerpN(prevP, predP, Math.min(1, tickAcc / DT)) : predP;
  else if (meIn && myAir === 1) target = shipPos(shipS, shipD, matchT)[0];
  else if (meIn && myAir === 2 && ents[myId]) { const q = interp(ents[myId], rt + 1.2); if (q) target = q.p; }
  else if (phase >= 1 && ents[camId]) { const q = interp(ents[camId], rt); if (q) target = q.p; }
  if (target) camP = angDist(target, camP) * R > 300 ? target : slerpN(camP, target, meAlive || (meIn && myAir) ? 1 : Math.min(1, dt * 8));
  else { const [np, nf] = moveOn(camP, camF, 25 * dt, camF); camP = np; camF = nf; }
  camF = tang(camP, camF); CP = camP; CF = camF; CR = cross(CF, CP);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (shake > 0) { shake -= dt; ctx.translate((Math.random() - .5) * 14 * shake, (Math.random() - .5) * 14 * shake); }
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, HR, 0, 6.2832); ctx.fillStyle = '#6cc24a'; ctx.fill(); ctx.clip();
  const visCos = Math.cos(AH) - .03;
  for (const b of BIOMES) if (dot(b.c, CP) > Math.cos(AH + b.r)) { fillCap(b.c, b.r, b.col); ctx.strokeStyle = b.col; ctx.globalAlpha = .5; ctx.lineWidth = 14 * Z; ctx.beginPath(); poly(capPath(b.c, b.r)); ctx.stroke(); ctx.globalAlpha = 1; }
  // декор
  for (const d of deco) { if (dot(d.p, CP) < visCos) continue; const q = P(d.p); if (!q) continue; const s = q[3] / SS; const sp = decoSpr(d.t, d.v); ctx.drawImage(sp, q[0] - sp.width * s / 2, q[1] - sp.height * s / 2, sp.width * s, sp.height * s); }
  // лут
  const bob = Math.sin(now / 300) * 2;
  for (const it of loot.values()) { if (dot(it.p, CP) < visCos) continue; const q = P(it.p); if (!q) continue; const sp = lootSpr(it.k, it.x, it.r), s = q[3] / SS; ctx.drawImage(sp, q[0] - sp.width * s / 2, q[1] - sp.height * s / 2 + bob * q[3] * .5, sp.width * s, sp.height * s); }
  // объекты: тени, потом сами
  const vis = [];
  for (const o of objs) { if (o.dead || dot(o.p, CP) < visCos - o.rad / R) continue; const q = P(o.p, true); if (!q[2] && dot(o.p, CP) < visCos) continue; vis.push([o, q]); }
  for (let pass = 0; pass < 2; pass++) for (const [o, q] of vis) {
    let sp = sprite(o); if (pass && outZone(o.p, zone)) sp = charred(o, sp); const k = q[3] / SS, ang = sp.round ? 0 : scrDir(o.p, o.u);
    const c = Math.cos(ang) * k * dpr, s = Math.sin(ang) * k * dpr;
    const ox = pass ? 0 : 4 * q[3], oy = pass ? 0 : 6 * q[3];
    ctx.setTransform(c, s, -s, c, (q[0] + ox) * dpr, (q[1] + oy) * dpr);
    ctx.drawImage(pass ? sp.s : sp.sh, -sp.s.width / 2, -sp.s.height / 2);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = rim; ctx.fillRect(0, 0, W, H);
  // ===== огонь кометы =====
  if (zone.rho < Math.PI) {
    fillCap(mul(zone.c, -1), Math.PI - zone.rho, 'rgba(28,10,8,.8)');
    ctx.globalCompositeOperation = 'lighter';
    for (const d of deco) { if (d.v === 1 || dot(d.p, CP) < visCos || !outZone(d.p, zone)) continue; const q = P(d.p); if (!q) continue; const s = q[3] / SS * 1.4, ew = EMBER.width * s; ctx.globalAlpha = .5 + .5 * Math.sin(now / 400 + d.a * 9); ctx.drawImage(EMBER, q[0] - ew / 2, q[1] - ew / 2, ew, ew); }
    ctx.globalAlpha = 1;
    // фронт: свечение + языки пламени
    const pts = capPath(zone.c, zone.rho, 150); ctx.lineCap = 'round';
    for (const [w, c] of [[60, 'rgba(255,70,10,.10)'], [34, 'rgba(255,90,20,.2)'], [18, 'rgba(255,130,30,.5)'], [7, 'rgba(255,230,120,.95)']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w * Z; ctx.beginPath(); let on = false;
      for (const p of pts) { if (p[2]) { on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; } else on = false; } ctx.stroke();
    }
    let i = 0; for (const p of pts) { i++; if (!p[2]) continue; const f = .75 + .45 * Math.sin(now / 80 + i * 1.7) + .25 * Math.sin(now / 37 + i * 3.1), s = p[3] * (i % 3 ? 1.2 : 1.9) * f; ctx.drawImage(FLAME, p[0] - 12 * s, p[1] - 26 * s, 24 * s, 30 * s);
      if (smoke.length < 70 && Math.random() < .035) smoke.push({ x: p[0], y: p[1], t: 0, r: 6 + Math.random() * 8, vx: (Math.random() - .5) * 14, cp: camP }); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // дым (экранные частицы, сдвигаем вместе с камерой грубо)
  for (const m of smoke) { m.t += dt; m.y -= 22 * dt; m.x += m.vx * dt; const a = Math.max(0, .35 * (1 - m.t / 2.6)); ctx.fillStyle = `rgba(60,55,55,${a})`; ctx.beginPath(); ctx.arc(m.x, m.y, (m.r + m.t * 14) * Z, 0, 6.2832); ctx.fill(); }
  smoke = smoke.filter(m => m.t < 2.6 && angDist(m.cp, camP) * R < 25);
  // следующая зона — белый пунктир
  if (phase === 1 && plan && !zone.pre && !zone.mv && zone.k < ZONE.length) {
    const pts = capPath(plan[zone.k], ZONE[zone.k][0], 120); ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); let on = false;
    for (const p of pts) { if (p[2]) { on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; } else on = false; } ctx.stroke(); ctx.setLineDash([]);
  }
  if (phase === 1 && matchT < COMET_T0) { // комета летит
    const q = P(comet, true), k = matchT / COMET_T0; const tx = q[0], ty = q[1];
    const sx = tx - 600 * (1 - k), sy = ty - 400 * (1 - k);
    if (k > .6) { const g = ctx.createLinearGradient(sx, sy, sx - 160, sy - 110); g.addColorStop(0, 'rgba(255,200,80,.9)'); g.addColorStop(1, 'rgba(255,100,20,0)'); ctx.strokeStyle = g; ctx.lineWidth = 14 * Z; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 160, sy - 110); ctx.stroke(); blob(ctx, sx, sy, 10 * Z * (1 + k), '#ffe8a3'); }
    if (q[2]) { ctx.strokeStyle = `rgba(255,80,40,${.5 + .5 * Math.sin(now / 120)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 30 * Z, 0, 6.2832); ctx.stroke(); }
  }
  // корабль эвакуации садится в финальной точке
  if (phase >= 1 && plan && zone.k >= 5) {
    const q = P(plan[ZONE.length - 1]);
    if (q) { const s = q[3]; const t = endInfo ? (now - endInfo.t) / 1000 : 0; const lift = endInfo ? Math.max(0, t - 1.5) : 0;
      ctx.strokeStyle = `rgba(105,219,124,${.4 + .3 * Math.sin(now / 200)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q[0], q[1], (40 + 8 * Math.sin(now / 300)) * s, 0, 6.2832); ctx.stroke();
      drawShip(q[0], q[1] - lift * lift * 260, s * (1 + lift * .8), now); }
  }
  // транспорт высадки
  if (phase === 1 && matchT < DROP_T + 4) {
    const [sp, sd] = moveOn(shipS, shipD, SHIP_V * matchT, shipD); const q = P(sp);
    if (q) drawTransport(q[0], q[1], scrDir(sp, sd), q[3] * 1.4, now);
  }
  // трассеры
  for (const t of tracers) {
    t.t += dt; if (!t.from) { const e = t.sid === myId && predP ? predP : ents[t.sid] && ents[t.sid].disp; t.from = e || t.end; }
    const a = P(t.from, true), b = P(t.end, true); const w = t.wb & 15;
    ctx.globalAlpha = Math.max(0, 1 - t.t / .12); ctx.strokeStyle = w === 4 ? '#fff' : '#ffe066'; ctx.lineWidth = (w === 4 ? 3 : 1.8) * Z;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1;
    if (t.t < .05) blob(ctx, b[0], b[1], 3 * Z, '#fff');
  }
  tracers = tracers.filter(t => t.t < .12);
  // игроки
  blinkT += dt;
  for (const id in ents) {
    const e = ents[id]; if (e.seen < 0 && +id !== myId) continue; const air = (e.h[e.h.length - 1].fl >> 4) & 3; if (air === 1) continue;
    let q;
    if (+id === myId && meAlive && !air) q = { p: target, aim: myAim || e.h[e.h.length - 1].aim, s: e.h[e.h.length - 1] };
    else q = interp(e, rt);
    if (!q) continue;
    const prev = e.disp; e.disp = q.p; if (prev) e.walk += angDist(prev, q.p) * R * .25;
    const sp = P(q.p); if (!sp) continue;
    const ang = scrDir(q.p, tang(q.p, q.aim)), r = PR * sp[3], s = q.s;
    const hurt = e.lastHp !== undefined && s.hp < e.lastHp; e.lastHp = s.hp; if (hurt) e.hitT = .1; e.hitT = (e.hitT || 0) - dt;
    if (air === 2) { drawChute(sp[0], sp[1], r, ang, names[id] ? names[id].ch : +id, now); continue; }
    if (+id === myId) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sp[0], sp[1] + r * .2, r * 1.55, r * 1.35, 0, 0, 6.2832); ctx.stroke(); }
    drawChar(ctx, sp[0], sp[1], r, ang, names[id] ? names[id].ch : +id, s.wb, { walk: e.walk, hit: e.hitT > 0, armor: s.fl & 2, blink: ((blinkT + +id * 1.3) % 3.2) < .12 });
    if (s.fl & 8) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sp[0], sp[1], r * 1.6, -1.57, -1.57 + 6.2832 * ((now / 1000) % 1)); ctx.stroke(); }
    if (+id !== myId || !meAlive) { const nm = names[id] ? names[id].n : ''; ctx.font = `bold ${Math.round(11 * Math.max(.8, sp[3]))}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(nm, sp[0] + 1, sp[1] - r - 11); ctx.fillStyle = '#fff'; ctx.fillText(nm, sp[0], sp[1] - r - 12);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sp[0] - r, sp[1] - r - 8, r * 2, 4); ctx.fillStyle = s.hp > 40 ? '#51cf66' : '#ff6b6b'; ctx.fillRect(sp[0] - r, sp[1] - r - 8, r * 2 * s.hp / 100, 4); }
  }
  // прицельная линия (сенсор)
  if (meAlive && sticks.R && myAim && priv) { const s = priv.s[priv.cur]; const w = s[0] & 15; if (w) { const Wp = WEAPONS[w]; let p = target, d = myAim; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); const a = P(p, true); ctx.moveTo(a[0], a[1]); for (let i = 0; i < 12; i++) { [p, d] = moveOn(p, d, Wp.range / 12, d); const b = P(p, true); ctx.lineTo(b[0], b[1]); } ctx.stroke(); ctx.setLineDash([]); } }
  // эффекты
  for (const f of fx) {
    f.t += dt; const q = P(f.p); if (!q) continue;
    if (f.type === 'death') { // смешная смерть: крутится, сплющивается, улетает призрак
      const k = Math.min(1, f.t / .6), r = PR * q[3];
      if (f.t < 1.6) { ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 1.1) / .5); drawChar(ctx, q[0], q[1], r, f.spin * f.t * 12, f.ch, 0, { dead: true, scale: 1 + .4 * Math.sin(k * 3.14) - k * .3 }); ctx.globalAlpha = 1; }
      const gy = q[1] - f.t * 45 * q[3], gx = q[0] + Math.sin(f.t * 5) * 10 * q[3];
      ctx.globalAlpha = Math.max(0, .85 - f.t / 3); ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.arc(gx, gy, r * .8, 3.14, 0); ctx.lineTo(gx + r * .8, gy + r * .9); for (let i = 3; i >= -3; i--) ctx.lineTo(gx + i * r * .27, gy + r * (i % 2 ? .65 : .9)); ctx.fill();
      blob(ctx, gx - r * .28, gy - r * .1, r * .13, '#000'); blob(ctx, gx + r * .28, gy - r * .1, r * .13, '#000'); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(gx, gy - r * 1.05, r * .5, r * .18, 0, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
      if (f.t < .5) for (let i = 0; i < 10; i++) { const a = i * .628 + f.spin, d = f.t * 140 * q[3]; ctx.fillStyle = COLORS[(i + f.ch) % 10]; ctx.fillRect(q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d - f.t * 30, 4, 7); }
    } else if (f.type === 'crate') { for (let i = 0; i < 8; i++) { const a = i * .785, d = f.t * 120 * q[3]; ctx.fillStyle = '#c08a45'; ctx.save(); ctx.translate(q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d); ctx.rotate(f.t * 10 + i); ctx.fillRect(-4, -2, 8, 4); ctx.restore(); } }
  }
  fx = fx.filter(f => f.t < 3);
  // цифры урона
  ctx.textAlign = 'center';
  for (const n of nums) { n.t += dt; if (!n.p && ents[n.tid] && ents[n.tid].disp) n.p = ents[n.tid].disp; if (!n.p) continue; const q = P(n.p); if (!q) continue; ctx.globalAlpha = Math.max(0, 1 - n.t / .8); ctx.font = `900 ${n.crate ? 13 : 18}px system-ui`; ctx.fillStyle = '#000'; ctx.fillText(n.d, q[0] + 13 + 1, q[1] - 18 - n.t * 40 + 2); ctx.fillStyle = n.tid === myId ? '#ff6b6b' : n.crate ? '#ffd8a8' : n.d >= 50 ? '#ffd43b' : '#fff'; ctx.fillText(n.d, q[0] + 13, q[1] - 18 - n.t * 40); ctx.globalAlpha = 1; }
  nums = nums.filter(n => n.t < .8);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX, CY, HR, 0, 6.2832); ctx.stroke();
  // вспышка удара кометы
  if (phase === 1 && matchT >= COMET_T0 && matchT < COMET_T0 + .8 && flash === 0) { flash = 1; shake = .8; sfx('boom'); }
  if (flash > 0 && phase === 1 && matchT < COMET_T0 + 1) { ctx.fillStyle = `rgba(255,240,210,${Math.max(0, 1 - (matchT - COMET_T0) / .8)})`; ctx.fillRect(0, 0, W, H); }
  if (zone.rho < Math.PI && angDist(camP, zone.c) > zone.rho - .25) { while (ash.length < 40) ash.push({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2.5, v: 20 + Math.random() * 30 });
    for (const a of ash) { a.y += a.v * dt; a.x += Math.sin(now / 700 + a.s * 5) * 15 * dt; if (a.y > H) { a.y = -5; a.x = Math.random() * W; } ctx.fillStyle = a.s > 2.5 ? 'rgba(255,140,60,.8)' : 'rgba(200,200,200,.55)'; ctx.fillRect(a.x, a.y, a.s, a.s); } } else ash = [];
  hud(now, meIn && !myAir ? meAlive : false, target);
}
const CHAR = {};
function charred(o, sp) {
  const key = o.type + o.w + 'x' + o.h; if (CHAR[key]) return CHAR[key];
  const c = document.createElement('canvas'); c.width = sp.s.width; c.height = sp.s.height; const g = c.getContext('2d');
  g.drawImage(sp.s, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,18,14,.86)'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ff7a1a'; const rnd = mkRng(o.w * 31 + o.h); for (let i = 0; i < 6; i++) { g.globalAlpha = .7; g.beginPath(); g.arc(c.width * (.2 + rnd() * .6), c.height * (.2 + rnd() * .6), 2 + rnd() * 3, 0, 6.2832); g.fill(); }
  return CHAR[key] = { s: c, sh: sp.sh, round: sp.round };
}
function drawTransport(x, y, ang, s, now) {
  ctx.save(); ctx.translate(x + 30 * s, y + 40 * s); ctx.rotate(ang); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 60 * s, 22 * s, 0, 0, 6.2832); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s); ctx.strokeStyle = '#212529'; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(-38, -62); ctx.lineTo(-22, -62); ctx.lineTo(18, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(-38, 62); ctx.lineTo(-22, 62); ctx.lineTo(18, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#dee2e6'; ctx.beginPath(); ctx.ellipse(0, 0, 62, 20, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e03131'; ctx.fillRect(-40, -4, 70, 8); ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.ellipse(44, 0, 11, 9, 0, 0, 6.2832); ctx.fill();
  for (const sy of [-12, 12]) { const f = 8 + 5 * Math.sin(now / 40 + sy); const g = ctx.createLinearGradient(-62, 0, -62 - f * 3, 0); g.addColorStop(0, '#fff3bf'); g.addColorStop(.4, '#ff922b'); g.addColorStop(1, 'rgba(255,80,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-62 - f, sy, f * 1.6, 5, 0, 0, 6.2832); ctx.fill(); }
  ctx.restore();
}
function drawChute(x, y, r, ang, ch, now) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + r * 2.5, y + r * 3, r * 1.4, r, 0, 0, 6.2832); ctx.fill();
  drawChar(ctx, x, y, r * 1.2, ang, ch, 0, {});
  const sw = Math.sin(now / 300) * .15; ctx.save(); ctx.translate(x, y - r * 1.2); ctx.rotate(sw);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : COLORS[ch % 10]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 2.6, Math.PI + i * Math.PI / 6, Math.PI + (i + 1) * Math.PI / 6); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, Math.PI, 0); ctx.stroke(); ctx.restore();
}
function drawShip(x, y, s, now) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(6, 8, 30, 22, 0, 0, 6.2832); ctx.fill();
  for (const a of [0, 2.09, 4.19]) { ctx.save(); ctx.rotate(a); ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.moveTo(14, -7); ctx.lineTo(34, 0); ctx.lineTo(14, 7); ctx.fill(); ctx.restore(); }
  blob(ctx, 0, 0, 22, '#dee2e6'); ctx.strokeStyle = '#495057'; ctx.lineWidth = 2; ctx.stroke(); blob(ctx, 0, 0, 14, '#adb5bd'); blob(ctx, 0, 0, 8, '#4dabf7'); blob(ctx, -3, -3, 3, '#d0ebff');
  ctx.fillStyle = `rgba(255,200,60,${.5 + .5 * Math.sin(now / 60)})`; for (let i = 0; i < 3; i++) blob(ctx, Math.cos(i * 2.09 + .5) * 18, Math.sin(i * 2.09 + .5) * 18, 3, ctx.fillStyle);
  ctx.restore();
}
// ===== HUD =====
function arrowTo(target, col, icon, from) {
  const t = tang(from, target), sx = dot(t, CR), sy = dot(t, CF), a = Math.atan2(-sy, sx);
  const rr_ = Math.min(W, H) * .4, x = CX + Math.cos(a) * rr_, y = CY + Math.sin(a) * rr_;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-7, -11); ctx.lineTo(-3, 0); ctx.lineTo(-7, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(icon, x - Math.cos(a) * 24, y - Math.sin(a) * 24 + 6);
}
function txt(s, x, y, size, col = '#fff', al = 'center', weight = 900) { ctx.font = `${weight} ${size}px system-ui`; ctx.textAlign = al; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function btn(b, col, alpha = .55) { ctx.fillStyle = `rgba(0,0,0,${alpha})`; rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill(); if (col) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); } }
const ui = id => UI.find(b => b.id === id);
function hud(now, meAlive, mePos) {
  const meIn = phase === 1 && myId !== 255 && !dead;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const from = mePos || camP;
  if (phase === 1) {
    if (zone.pre) { if (matchT > DROP_T) arrowTo(comet, '#ff6b3d', '☄️', from); }
    else if (angDist(from, zone.c) > zone.rho * .6 || zone.k >= 5) arrowTo(zone.k >= 5 && plan ? plan[ZONE.length - 1] : (!zone.mv && plan && zone.k < ZONE.length ? plan[zone.k] : zone.c), '#69db7c', '🚀', from);
    const wi = zone;
    const s = wi.pre ? '☄️ ' + Math.ceil(wi.left) : wi.mv ? '🔥 ' + Math.ceil(wi.left) : '⚠️ ' + Math.ceil(wi.left);
    const col = wi.pre ? '#ffa94d' : wi.mv ? '#ff6b6b' : (wi.left < 5 ? (Math.floor(now / 250) % 2 ? '#ffd43b' : '#fff') : '#fff');
    txt(s, CX, 30, 22, col);
    const burnt = Math.round((1 + Math.cos(zone.rho)) / 2 * 100); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(CX - 50, 38, 100, 6); ctx.fillStyle = '#ff6b3d'; ctx.fillRect(CX - 50, 38, burnt, 6);
  }
  // миникарта-глобус
  minimap(now, from);
  // игроки/убийства
  if (phase >= 1) txt('👤 ' + aliveN + (myId !== 255 ? '   💀 ' + (priv ? priv.kills : 0) : ''), W - 68, 150, 16, '#fff', 'center', 800);
  // лента убийств
  ctx.textAlign = 'left';
  feed.forEach((f, i) => { const age = (now - f.t) / 1000; if (age > 7) return; ctx.globalAlpha = Math.min(1, 7 - age); const y = 22 + i * 21; const a = f.k >= 0 ? (names[f.k] ? names[f.k].n : '?') : '☄️', b = names[f.v] ? names[f.v].n : '?';
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
    const hb = ui('heal'); btn(hb, priv.meds ? '#ff6b6b' : null); txt('✚' + priv.meds, hb.x + hb.w / 2, hb.y + hb.h * .66, 18, priv.meds ? '#ff8787' : '#666');
    const rb = ui('reload'); btn(rb, null); txt('⟳', rb.x + rb.w / 2, rb.y + rb.h * .7, 24, '#fff');
    if (priv.st) { const k = priv.prog / 255; ctx.strokeStyle = priv.st & 2 ? '#ff6b6b' : '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(CX, CY, 30, -1.57, -1.57 + 6.2832 * k); ctx.stroke(); }
    // кнопка подобрать
    pickShow = null; let bd = 1e9; for (const it of loot.values()) { const d = angDist(it.p, mePos) * R; if (d < PR + 30 && d < bd && it.k === 0) { bd = d; pickShow = it; } }
    if (pickShow) { const b = ui('pick'); btn(b, RARITY[pickShow.r], .7); ctx.save(); ctx.translate(b.x + b.w * .3, b.y + b.h * .5); gunShape(ctx, pickShow.x, b.h * .32, RARITY[pickShow.r]); ctx.restore(); txt(touchUI ? '✋' : 'E', b.x + b.w - 16, b.y + b.h * .65, 18); }
    // в огне
    if (outZone(mePos, zone)) { const g = ctx.createRadialGradient(CX, CY, Math.min(W, H) * .3, CX, CY, Math.max(W, H) * .7); g.addColorStop(0, 'rgba(255,40,0,0)'); g.addColorStop(1, `rgba(255,40,0,${.45 + .2 * Math.sin(now / 120)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); txt('🔥', CX, CY - 46, 26); }
    // джойстики
    drawStick(sticks.L, 'rgba(255,255,255,.65)'); drawStick(sticks.R, 'rgba(255,120,80,.75)');
    if (touchUI) { if (!sticks.L) ghostStick(W * .16, H * .68); if (!sticks.R) ghostStick(W * .84, H * .68); }
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
    else if (!endInfo) { txt('👁 ' + (names[camId] ? names[camId].n : ''), CX, H - 34, 18); const b = ui('spec'); btn(b, '#fff'); txt('⏭', b.x + b.w / 2, b.y + b.h * .7, 22); if (dead) txt('#' + dead.place, 40, H - 30, 22, '#ffd43b'); }
  }
  if (endInfo) {
    const t = (now - endInfo.t) / 1000, k = Math.min(1, t / .5);
    ctx.fillStyle = `rgba(8,4,24,${.35 * k})`; ctx.fillRect(0, 0, W, H);
    const win = endInfo.w === myId && myId !== 255;
    txt(win ? '🚀 ПОБЕДА!' : '🚀 ' + (names[endInfo.w] ? names[endInfo.w].n : ''), CX, H * .35, (win ? 58 : 40) * k, win ? '#ffd43b' : '#fff');
    if (!win && dead) txt('#' + dead.place, CX, H * .35 + 50, 30 * k);
  }
  if (!ws || ws.readyState !== 1) { if (started) txt('📡 …', CX, H / 2, 30); }
  if (PERF) { ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#0f0'; ctx.fillText(`${fps} fps · ${snapRate} snap/s · pend ${pending.length} · ents ${Object.keys(ents).length}`, 8, H - 8); }
}
function ghostStick(x, y) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.2832); ctx.stroke(); }
function drawStick(s, col) { if (!s) return; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x0, s.y0, 55, 0, 6.2832); ctx.stroke(); const v = stickVec(s); blob(ctx, s.x0 + v[0] * 55, s.y0 - v[1] * 55, 24, col); }
function minimap(now, from) {
  const big = bigMap, r = big ? Math.min(W, H) * .42 : 56, cx = big ? CX : W - 68, cy = big ? CY : 68;
  const pr = q => { const x = dot(q, CR), y = dot(q, CF), z = dot(q, CP); return [cx + x * r, cy - y * r, z]; };
  const capPts = (c, th) => { const u = anyTang(c), v = cross(c, u), pts = []; for (let i = 0; i < 64; i++) { const t = i / 64 * 6.2832; let q = add(mul(c, Math.cos(th)), add(mul(u, Math.cos(t)), v, Math.sin(t)), Math.sin(th)); let [x, y, z] = pr(q); if (z < 0) { const l = Math.hypot(x - cx, y - cy) || 1; x = cx + (x - cx) / l * r; y = cy + (y - cy) / l * r; } pts.push([x, y]); } return pts; };
  const cap = (c, th, col) => { if (th >= Math.PI - 1e-3) { ctx.fillStyle = col; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); return; } const t = capTest(c, th, CP, Math.PI / 2); if (!t) return; const tp = pr(t); fillRegion(capPts(c, th), cx, cy, r, tp, col); };
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fillStyle = '#5fb83f'; ctx.fill(); ctx.clip();
  for (const b of BIOMES) cap(b.c, b.r, b.col);
  if (phase >= 1 && zone.rho < Math.PI) cap(mul(zone.c, -1), Math.PI - zone.rho, 'rgba(40,12,8,.85)');
  const g = ctx.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,30,.45)'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (phase >= 1) {
    const ring = (c, th, col, dash) => { ctx.setLineDash(dash ? [4, 4] : []); ctx.strokeStyle = col; ctx.lineWidth = big ? 3 : 2; ctx.beginPath(); let on = false; const u = anyTang(c), v = cross(c, u); for (let i = 0; i <= 64; i++) { const t = i / 64 * 6.2832; const q = add(mul(c, Math.cos(th)), add(mul(u, Math.cos(t)), v, Math.sin(t)), Math.sin(th)); const [x, y, z] = pr(q); if (z > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false; } ctx.stroke(); ctx.setLineDash([]); };
    if (zone.rho < Math.PI) ring(zone.c, zone.rho, '#ffd43b');
    if (plan && !zone.pre && !zone.mv && zone.k < ZONE.length) ring(plan[zone.k], ZONE[zone.k][0], '#fff', 1);
    if (plan && zone.k >= 5) { const [ax, ay, az] = pr(plan[ZONE.length - 1]); if (az > 0) txt('🚀', ax, ay + 5, big ? 22 : 13); }
    const [kx, ky, kz] = pr(comet); if (kz > 0 && zone.pre) txt('☄️', kx, ky + 5, big ? 22 : 13);
    if (phase === 1 && matchT < DROP_T) { const [sx, sy, sz] = pr(shipPos(shipS, shipD, matchT)[0]); if (sz > 0) txt('✈️', sx, sy + 5, big ? 22 : 13); }
    for (const id in ents) { const e = ents[id]; if (e.seen < 0 || +id === myId || !e.disp) continue; const [x, y, z] = pr(e.disp); if (z > 0) blob(ctx, x, y, big ? 5 : 3, '#ff6b6b'); }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
  const [mx, my] = pr(from); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, my - 7); ctx.lineTo(mx + 5, my + 5); ctx.lineTo(mx - 5, my + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ===== стартовый экран =====
let myName = '', myChar = Math.floor(Math.random() * 10);
try { myName = localStorage.getItem('le_name') || ''; const c = localStorage.getItem('le_char'); if (c !== null) myChar = +c; } catch (e) { }
const nameIn = document.getElementById('name'), pv = document.getElementById('pv'), pg = pv.getContext('2d');
nameIn.value = myName;
function drawPv() { pg.setTransform(1, 0, 0, 1, 0, 0); pg.clearRect(0, 0, pv.width, pv.height); pg.setTransform(2, 0, 0, 2, 0, 0); drawChar(pg, 45, 45, 26, -.5, myChar, 2 | (2 << 4), {}); }
document.getElementById('prev').onclick = () => { myChar = (myChar + 9) % 10; drawPv(); };
document.getElementById('next').onclick = () => { myChar = (myChar + 1) % 10; drawPv(); };
document.getElementById('play').onclick = () => {
  myName = (nameIn.value || '').trim().slice(0, 12) || 'Игрок' + Math.floor(Math.random() * 100);
  try { localStorage.setItem('le_name', myName); localStorage.setItem('le_char', myChar); } catch (e) { }
  nameIn.blur(); initSound(); document.getElementById('start').style.display = 'none'; started = true; connect();
  try { if (touchUI || 'ontouchstart' in window) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { }
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
resize(); layout(); drawPv(); requestAnimationFrame(frame);
