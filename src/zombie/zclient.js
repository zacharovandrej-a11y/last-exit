// ===== ОРДА — клиент: экраны, сеть, управление, 3D, кровь =====
const T = THREE, $ = id => document.getElementById(id);
const PCOL = [0x3d8bff, 0xff5a5a, 0x51cf66, 0xffd43b], PCSS = ['#3d8bff', '#ff5a5a', '#51cf66', '#ffd43b'];
let ws = null, myId = -1, roomCode = '', inRoom = false, roster = [], rst = 'wait';
let snaps = [], lastSnap = null, meP = [0, 0], meAim = [1, 0], meSt = 0, myW = 0, unl = [0], pk = {}, wl = ZW.map(() => 1), maxHp = 100;
let perkOpts = null, perkLv = 0, msgs = [], overInfo = null, bigMsg = null, wantW = -1;
const ammo = ZW.map(w => w.mag); let relT = 0, fireT = 0, bloom = 0;
const zst = new Map(); // состояние зомби на клиенте (интерполяция, анимация)
const items = new Map();
const best = +(localStorage.getItem('zbest') || 0);
$('rec').textContent = best ? '🏆 Твой рекорд: волна ' + best : '';
$('name').value = localStorage.getItem('zname') || '';
// ===== сеть =====
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/zws'); ws.binaryType = 'arraybuffer';
  ws.onopen = () => { send({ t: 'hello', name: myName() }); const r = new URLSearchParams(location.search).get('r'); if (r && !inRoom) send({ t: 'join', code: r }); };
  ws.onmessage = e => typeof e.data === 'string' ? onMsg(JSON.parse(e.data)) : onSnap(e.data);
  ws.onclose = () => { setTimeout(connect, 1500); };
}
const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const myName = () => ($('name').value.trim() || 'Игрок').slice(0, 12);
function show(id) { for (const s of ['start', 'lobby']) $(s).classList.toggle('on', s === id); }
$('quick').onclick = () => { localStorage.setItem('zname', myName()); send({ t: 'hello', name: myName() }); send({ t: 'quick' }); audioInit(); };
$('create').onclick = () => { localStorage.setItem('zname', myName()); send({ t: 'hello', name: myName() }); send({ t: 'create' }); audioInit(); };
$('go').onclick = () => { send({ t: 'start' }); audioInit(); };
$('leave').onclick = () => leaveRoom();
$('share').onclick = () => { const url = location.origin + '/z?r=' + roomCode; if (navigator.share) navigator.share({ title: 'ОРДА — зомби-кооп', text: 'Заходи отбиваться от зомби!', url }).catch(() => { }); else { navigator.clipboard && navigator.clipboard.writeText(url); $('share').textContent = '✔ Ссылка скопирована'; } };
function leaveRoom() { send({ t: 'leave' }); inRoom = false; roomCode = ''; history.replaceState(null, '', '/z'); show('start'); }
function onMsg(m) {
  if (m.t === 'rooms') { const el = $('rooms'); el.innerHTML = ''; if (!m.l.length) el.innerHTML = '<div class="hint">Пока никого — создай свою или жми «Быстрая игра»</div>';
    for (const r of m.l) { const d = document.createElement('div'); d.className = 'room'; d.innerHTML = '<div class="i"><b>' + r.c + '</b> · ' + r.n + '/4 · ' + (r.st === 'wait' ? 'ждут игроков' : r.st === 'play' ? 'волна ' + r.w : 'итоги') + '<br>' + r.names.join(', ') + '</div>';
      const b = document.createElement('button'); b.textContent = r.n >= 4 ? 'Полна' : 'Войти'; b.disabled = r.n >= 4; b.onclick = () => { localStorage.setItem('zname', myName()); send({ t: 'hello', name: myName() }); send({ t: 'join', code: r.c }); audioInit(); }; d.appendChild(b); el.appendChild(d); } }
  else if (m.t === 'err') $('err').textContent = m.s;
  else if (m.t === 'room') { inRoom = true; myId = m.you; roomCode = m.code; unl = m.unl; rst = m.st; history.replaceState(null, '', '/z?r=' + m.code); $('code').textContent = m.code; $('share').textContent = '🔗 Позвать друга'; resetLocal(); if (m.st === 'play') { show(null); startedT = performance.now(); } else show('lobby'); }
  else if (m.t === 'ros') { roster = m.pl; rst = m.st; $('plist').innerHTML = roster.map(([id, n]) => '<div class="pl" style="--c:' + PCSS[id] + '">' + n + (id === myId ? ' (ты)' : '') + '</div>').join(''); if (m.st === 'wait' && inRoom) { show('lobby'); overInfo = null; } }
  else if (m.t === 'start') { show(null); resetLocal(); R.resetBlood(); startedT = performance.now(); }
  else if (m.t === 'wave') { unl = m.unl; bigMsg = { s: (m.boss ? '☠ БОСС · ' : '') + 'ВОЛНА ' + m.w + (m.cyc ? ' · круг ' + (m.cyc + 1) : ''), t: performance.now() }; for (const i of m.nw) msgs.push({ s: '🔓 Открыто: ' + ZW[i].n, t: performance.now(), c: '#ffd43b' }); if (m.nw.length && !firing()) { myW = m.nw[m.nw.length - 1]; } sfx('wave'); }
  else if (m.t === 'clear') { bigMsg = { s: 'ВОЛНА ' + m.w + ' ПРОЙДЕНА', t: performance.now(), c: '#8ce99a' }; const b = +(localStorage.getItem('zbest') || 0); if (m.w > b) localStorage.setItem('zbest', m.w); }
  else if (m.t === 'msg') msgs.push({ s: m.s, t: performance.now() });
  else if (m.t === 'lvl') { perkOpts = m.o; perkLv = m.lv; sfx('lvl'); }
  else if (m.t === 'pk') { pk = m.pk; wl = m.wl; maxHp = m.maxHp; }
  else if (m.t === 'k') onKill(m);
  else if (m.t === 'sh') for (const [id, w, list] of m.s) { if (id === myId) continue; const p = plPos(id); if (!p) continue; if (w < 0) { for (const b of list) R.boom(b); sfx('boom', vol(list[0])); continue; } for (const [a, l] of list) { const an = a / 100, d = [Math.cos(an), Math.sin(an)]; R.tracer(p, add(p, d, l), w); } sfx('shot' + ZW[w].m, vol(p) * .6); }
  else if (m.t === 'it') items.set(m.id, [m.x, m.y]);
  else if (m.t === 'itx') { items.delete(m.id); if (m.by === myId) { msgs.push({ s: '❤ +40', t: performance.now(), c: '#ff8787' }); sfx('pick'); } }
  else if (m.t === 'over') { overInfo = Object.assign(m, { t: performance.now() }); const b = +(localStorage.getItem('zbest') || 0); if (m.w > b) localStorage.setItem('zbest', m.w); }
}
function resetLocal() { zst.clear(); items.clear(); perkOpts = null; overInfo = null; pk = {}; wl = ZW.map(() => 1); maxHp = 100; myW = 0; ZW.forEach((w, i) => ammo[i] = w.mag); snaps = []; R.clearFx(); }
function firing() { return fireHeld; }
// ===== снапшоты =====
let startedT = 0;
function onSnap(buf) {
  const v = new DataView(buf); if (v.getUint8(0) !== 1) return;
  const s = { t: performance.now(), st: v.getUint8(1), phase: v.getUint8(2), wave: v.getUint8(3), left: v.getUint16(4, true), timer: v.getUint16(6, true) / 10, cyc: v.getUint8(9), pl: [], z: new Map() };
  const np = v.getUint8(8), nz = v.getUint16(10, true); let o = 12;
  for (let i = 0; i < np; i++) { s.pl.push({ id: v.getUint8(o), p: [v.getInt16(o + 1, true) / 10, v.getInt16(o + 3, true) / 10], a: v.getUint8(o + 5) / 255 * Math.PI * 2, hp: v.getUint8(o + 6) / 255, st: v.getUint8(o + 7) & 3, fire: v.getUint8(o + 7) & 4, inv: v.getUint8(o + 7) & 8, rev: v.getUint8(o + 7) & 16, w: v.getUint8(o + 8), lvl: v.getUint8(o + 9), down: v.getUint8(o + 10), xp: v.getUint8(o + 11) / 255 }); o += ZSN_P; }
  for (let i = 0; i < nz; i++) { const id = v.getUint16(o, true), b = v.getUint8(o + 6); s.z.set(id, { p: [v.getInt16(o + 2, true) / 10, v.getInt16(o + 4, true) / 10], ty: b & 7, lost: b >> 3, hp: v.getUint8(o + 7) / 255, fl: v.getUint8(o + 8) }); o += ZSN_Z; }
  const me = s.pl.find(q => q.id === myId);
  if (me) { if (me.st !== meSt && me.st === 0 && meSt !== 0) meP = [...me.p]; if (me.st === 2 || dist(me.p, meP) > 160) meP = [...me.p]; meSt = me.st; }
  if (!lastSnap || s.st === 1 && lastSnap.st !== 1) meP = me ? [...me.p] : [0, 0];
  snaps.push(s); if (snaps.length > 30) snaps.shift(); lastSnap = s;
}
const INTERP = 110, ISO_K = 1.35 / Math.hypot(1, 1.35, 1); // во сколько раз земля сжата по вертикали на экране
function sampled(now) { // интерполяция зомби и других игроков
  const tt = now - INTERP; let a = null, b = null;
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= tt) { a = snaps[i]; b = snaps[i + 1] || a; break; }
  if (!a) { a = b = snaps[0]; } if (!a) return null;
  const k = b === a ? 0 : Math.min(1, (tt - a.t) / (b.t - a.t));
  return { a, b, k };
}
function plPos(id) { if (id === myId) return meP; const s = lastSnap && lastSnap.pl.find(q => q.id === id); return s ? s.p : null; }
// ===== управление =====
const keys = {}, mouse = { x: 0, y: 0, down: false, has: false }; let fireHeld = false, touchUI = false;
const sticks = { L: null, R: null };
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') relStart(); if (e.code === 'KeyQ') cycleW(-1); if (e.code === 'KeyE') cycleW(1); if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (unl.includes(i)) myW = i; } if (perkOpts && /^Key[ZXC]$/.test(e.code)) pickPerk('ZXC'.indexOf(e.code[3])); });
addEventListener('keyup', e => { keys[e.code] = false; });
const cv = $('c'), ctx = cv.getContext('2d');
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; });
cv.addEventListener('mousedown', e => { if (uiTap(e.clientX, e.clientY)) return; mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('wheel', e => cycleW(e.deltaY > 0 ? 1 : -1));
cv.addEventListener('touchstart', e => { touchUI = true; for (const t of e.changedTouches) { if (uiTap(t.clientX, t.clientY)) continue; const side = t.clientX < innerWidth / 2 ? 'L' : 'R'; if (!sticks[side]) sticks[side] = { id: t.identifier, o: [t.clientX, t.clientY], p: [t.clientX, t.clientY] }; } e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === t.identifier) sticks[s].p = [t.clientX, t.clientY]; e.preventDefault(); }, { passive: false });
const tEnd = e => { for (const t of e.changedTouches) for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === t.identifier) sticks[s] = null; };
cv.addEventListener('touchend', tEnd); cv.addEventListener('touchcancel', tEnd);
function stickV(s) { const k = sticks[s]; if (!k) return [0, 0]; const d = sub(k.p, k.o), l = len(d); if (l < 6) return [0, 0]; const m = Math.min(1, l / 60); return [d[0] / l * m, d[1] / l * m]; }
function cycleW(d) { if (!unl.length) return; const i = unl.indexOf(myW); myW = unl[(i + d + unl.length) % unl.length]; }
function pickPerk(i) { if (!perkOpts) return; send({ t: 'perk', i }); perkOpts = null; sfx('pick'); }
// кнопки на экране (в координатах CSS-пикселей)
let btns = [];
function uiTap(x, y) {
  if (overInfo) return false;
  for (const b of btns) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.f(); return true; }
  return false;
}
function relStart() { const W = ZW[myW]; if (relT > 0 || ammo[myW] >= magOf(myW)) return; relT = W.rel / (1 + (pk.rel || 0) * .25); sfx('rel'); }
const magOf = w => Math.round(ZW[w].mag * (1 + (pk.mag || 0) * .3));
// ===== стрельба: попадания считает клиент (что видишь, в то и попадаешь), сервер проверяет =====
let outHits = [], outShots = [], outBooms = [];
function shoot(zpos) {
  const W = ZW[myW], wlv = wl[myW] || 1, dmg = W.dmg * (1 + (pk.dmg || 0) * .15) * (1 + (wlv - 1) * .25), pierce = (W.pierce || 1) + (pk.pierce || 0);
  const a0 = Math.atan2(meAim[1], meAim[0]), from = add(meP, meAim, 14);
  for (let k = 0; k < W.pel; k++) {
    const an = a0 + (Math.random() - .5) * (W.spread + bloom), d = [Math.cos(an), Math.sin(an)];
    const hits = [];
    for (const [id, z] of zpos) { const q = sub(z.p, from), t = dot(q, d); if (t < 0 || t > W.range) continue; const off = Math.abs(q[0] * d[1] - q[1] * d[0]), r = ZT[z.ty].r * ZT[z.ty].sc * .75 + 3; if (off < r) hits.push([t, id, z]); }
    hits.sort((a, b) => a[0] - b[0]);
    let end = W.range;
    if (W.boom) { const h = hits[0], c = h ? add(from, d, h[0]) : add(from, d, W.range); end = h ? h[0] : W.range;
      for (const [id, z] of zpos) { const dd = dist(z.p, c); if (dd < W.boom) outHits.push([id, Math.round(dmg * (1 - dd / W.boom * .6)), W.gore]); }
      R.boom(c); outBooms.push([Math.round(c[0]), Math.round(c[1])]); sfx('boom', 1);
    } else {
      let n = 0; for (const [t, id, z] of hits) { const fall = W.fire ? 1 - t / W.range * .5 : 1; outHits.push([id, Math.round(dmg * fall), W.gore]); R.hitBlood(add(from, d, t), d, W.gore, z); n++; if (n >= pierce) { end = t; break; } }
    }
    if (W.fire) R.flame(from, d, end); else R.tracer(from, add(from, d, end), myW);
    outShots.push([Math.round(an * 100), Math.round(end)]);
  }
  R.muzzle(); sfx('shot' + W.m, 1);
  bloom = Math.min(.25, bloom + (W.pel > 1 ? .04 : .025));
}
// ===== убийство: кровь, ошмётки, труп в землю =====
function onKill(m) {
  const z = zst.get(m.z), T_ = ZT[m.ty], p = [m.x, m.y], d = m.d;
  R.kill(p, d, m.g, m.ty, m.lost, z ? z.yaw : Math.atan2(-d[0], -d[1]));
  zst.delete(m.z); sfx('splat', vol(p) * (m.g >= 3 ? 1 : .6));
}
const vol = p => Math.max(0, 1 - dist(meP, p) / 900);
// ===== звук =====
let A = null, noiseB = null;
function audioInit() { if (A) return; try { A = new (window.AudioContext || window.webkitAudioContext)(); const n = A.sampleRate; noiseB = A.createBuffer(1, n, n); const d = noiseB.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } catch (e) { } }
function sfx(k, v = 1) {
  if (!A || v <= .02) return; const now = A.currentTime, g = A.createGain(); g.connect(A.destination);
  const noise = (f, d, gain, type = 'lowpass') => { const s = A.createBufferSource(); s.buffer = noiseB; const fl = A.createBiquadFilter(); fl.type = type; fl.frequency.value = f; s.connect(fl); fl.connect(g); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(.001, now + d); s.start(now, Math.random() * .5); s.stop(now + d); };
  const tone = (f0, f1, d, gain, type = 'sine') => { const o = A.createOscillator(); o.type = type; o.connect(g); o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(.001, now + d); o.start(now); o.stop(now + d); };
  if (k.startsWith('shot')) { const m = +k.slice(4); noise([0, 2400, 1500, 900, 3200, 2800, 700, 1200, 800, 600][m] || 1500, m === 3 || m === 8 ? .28 : m === 4 ? .35 : .12, m === 7 ? .18 : .28); }
  else if (k === 'boom') { noise(380, 1, .9); }
  else if (k === 'splat') noise(500, .18, .35, 'bandpass');
  else if (k === 'hurt') tone(220, 90, .25, .3, 'square');
  else if (k === 'lvl') tone(520, 1040, .3, .25);
  else if (k === 'pick') tone(700, 1200, .12, .2);
  else if (k === 'wave') tone(120, 60, .8, .4, 'sawtooth');
  else if (k === 'rel') tone(300, 500, .08, .12, 'square');
}
// ===================== 3D =====================
const R = (() => {
  const g = $('g'), renderer = new T.WebGLRenderer({ canvas: g, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setClearColor(0x120606);
  const scene = new T.Scene(); scene.fog = new T.Fog(0x120606, 1400, 2400);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, -2000, 4000); const CAM_OFF = new T.Vector3(1, 1.35, 1).normalize();
  scene.add(new T.HemisphereLight(0xffeedd, 0x3a2a2a, .75)); const sun = new T.DirectionalLight(0xfff2dd, .75); sun.position.set(300, 600, 200); scene.add(sun);
  const grad = (() => { const d = new Uint8Array([100, 180, 255]), t = new T.DataTexture(d, 3, 1, T.LuminanceFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })();
  const MAT = c => new T.MeshToonMaterial({ color: c, gradientMap: grad });
  const cvTex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); return t; };
  // земля: грязь с травой
  const groundTex = cvTex(512, 512, (x, w, h) => { x.fillStyle = '#5a5240'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const r = Math.random(); x.fillStyle = r < .3 ? 'rgba(70,90,40,.35)' : r < .6 ? 'rgba(40,34,26,.3)' : 'rgba(120,110,90,.2)'; const s = 2 + Math.random() * 14; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, s, 0, 7); x.fill(); } for (let i = 0; i < 400; i++) { x.strokeStyle = 'rgba(90,120,50,.5)'; x.beginPath(); const px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); x.lineTo(px + (Math.random() - .5) * 6, py - 6 - Math.random() * 6); x.stroke(); } });
  groundTex.wrapS = groundTex.wrapT = T.RepeatWrapping; groundTex.repeat.set(10, 10);
  const GS = ZA * 2 + 900, ground = new T.Mesh(new T.PlaneGeometry(GS, GS), new T.MeshLambertMaterial({ map: groundTex })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // ограда арены
  { const n = 64, geo = new T.BoxGeometry(1, 1, 1), m = new T.InstancedMesh(geo, MAT(0x6e6a62), n * 4 + 40), M4 = new T.Matrix4(); let i = 0;
    const seg = ZA * 2 / n; for (let s = 0; s < 4; s++) for (let k = 0; k < n; k++) { const t = -ZA + seg * (k + .5), h = 26 + (k * 7 % 5) * 3, x = s < 2 ? t : (s === 2 ? -1 : 1) * (ZA + 14), z = s < 2 ? (s ? -1 : 1) * (ZA + 14) : t; M4.compose(new T.Vector3(x, h / 2, z), new T.Quaternion(), new T.Vector3(s < 2 ? seg - 2 : 10, h, s < 2 ? 10 : seg - 2)); m.setMatrixAt(i++, M4); }
    for (let k = 0; k < 40; k++) { const a = k / 40 * 6.283, r = ZA + 120 + (k * 37 % 90); M4.compose(new T.Vector3(Math.cos(a) * r, 12, Math.sin(a) * r), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), k), new T.Vector3(30 + k % 3 * 10, 24, 20)); m.setMatrixAt(i++, M4); }
    m.count = i; scene.add(m); }
  // ===== кровь в текстуре земли: всё, что пролилось, остаётся навсегда и не тормозит =====
  const BS = ZA * 2.24, RT = new T.WebGLRenderTarget(2048, 2048, { depthBuffer: false });
  const bloodMat = new T.MeshBasicMaterial({ map: RT.texture, transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false }); // без тумана: иначе пустые места краснеют
  const bloodPlane = new T.Mesh(new T.PlaneGeometry(BS, BS), bloodMat); bloodPlane.rotation.x = -Math.PI / 2; bloodPlane.position.y = .4; scene.add(bloodPlane);
  const dScene = new T.Scene(), dCam = new T.OrthographicCamera(-BS / 2, BS / 2, BS / 2, -BS / 2, .1, 100); dCam.position.set(0, 50, 0); dCam.up.set(0, 0, -1); dCam.lookAt(0, 0, 0);
  const blob = (k) => cvTex(128, 128, (x, w, h) => { x.translate(64, 64); const n = 6 + k * 3; x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 30 + k * 4, 0, 7); x.fill(); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 26 + Math.random() * 34, s = 3 + Math.random() * 9; x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, 7); x.fill(); x.beginPath(); x.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); x.lineTo(Math.cos(a + .1) * r, Math.sin(a + .1) * r); x.lineTo(Math.cos(a - .1) * r, Math.sin(a - .1) * r); x.fill(); } });
  const TEX = { b0: blob(0), b1: blob(1), b2: blob(2), drop: cvTex(32, 32, (x) => { const gr = x.createRadialGradient(16, 16, 2, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(.7, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); }),
    foot: cvTex(32, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(16, 22, 9, 15, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(16, 48, 7, 9, 0, 0, 7); x.fill(); }),
    body: cvTex(64, 128, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect ? x.roundRect(14, 30, 36, 56, 10) : x.rect(14, 30, 36, 56); x.fill(); x.beginPath(); x.arc(32, 18, 13, 0, 7); x.fill(); x.fillRect(4, 36, 10, 40); x.fillRect(50, 36, 10, 40); x.fillRect(18, 84, 11, 40); x.fillRect(35, 84, 11, 40); }),
    smear: cvTex(128, 32, (x) => { const gr = x.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.2, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,.3)'); x.fillStyle = gr; x.fillRect(0, 8, 128, 16); }) };
  const decalPool = [], dq = []; for (let i = 0; i < 80; i++) { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false })); m.rotation.x = -Math.PI / 2; m.visible = false; dScene.add(m); decalPool.push(m); }
  let needClear = true;
  function decal(p, size, tex, col, a = 1, rot = Math.random() * 6.28, sy = 1) { dq.push([p[0], p[1], size, tex, col, a, rot, sy]); }
  const BLOOD = [0x8a0000, 0x7a0505, 0x6a0000, 0x9a0a0a];
  const bloodCol = () => BLOOD[Math.floor(Math.random() * 4)];
  function flushDecals() {
    if (needClear) { renderer.setRenderTarget(RT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.setRenderTarget(null); renderer.setClearColor(0x120606, 1); needClear = false; grid.fill(0); }
    while (dq.length) {
      const batch = dq.splice(0, decalPool.length);
      batch.forEach((d, i) => { const m = decalPool[i]; m.position.set(d[0], 0, d[1]); m.scale.set(d[2], d[2] * d[7], 1); m.rotation.z = d[6]; m.material.map = TEX[d[3]]; m.material.color.setHex(d[4]); m.material.opacity = d[5]; m.material.needsUpdate = true; m.visible = true; });
      renderer.setRenderTarget(RT); renderer.autoClear = false; renderer.render(dScene, dCam); renderer.autoClear = true; renderer.setRenderTarget(null);
      for (const m of decalPool) m.visible = false;
    }
  }
  // сетка «сколько крови» — для кровавых следов
  const GN = 100, grid = new Float32Array(GN * GN), gi = p => { const x = Math.floor((p[0] / BS + .5) * GN), y = Math.floor((p[1] / BS + .5) * GN); return x < 0 || y < 0 || x >= GN || y >= GN ? -1 : y * GN + x; };
  function wet(p, r, a) { const c = BS / GN; for (let dx = -r; dx <= r; dx += c) for (let dy = -r; dy <= r; dy += c) { const i = gi([p[0] + dx, p[1] + dy]); if (i >= 0) grid[i] = Math.min(3, grid[i] + a); } }
  function bloodAt(p, size, a = .9) { decal(p, size, 'b' + Math.floor(Math.random() * 3), bloodCol(), a); wet(p, size * .4, a); }
  // ===== частицы: брызги крови и ошмётки (летят, падают, впитываются в землю) =====
  const PN = 700, drops = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xaa0000 }), PN); drops.frustumCulled = false; scene.add(drops);
  const dP = new Float32Array(PN * 3), dV = new Float32Array(PN * 3), dL = new Float32Array(PN), dS = new Float32Array(PN); let dI = 0; const M4 = new T.Matrix4(), V3 = new T.Vector3(), Q = new T.Quaternion(), S3 = new T.Vector3(), E = new T.Euler();
  function spray(p, h, dir, n, sp, size = 1.6) { for (let k = 0; k < n; k++) { const i = dI++ % PN; dP[i * 3] = p[0]; dP[i * 3 + 1] = h; dP[i * 3 + 2] = p[1]; const a = Math.atan2(dir[1], dir[0]) + (Math.random() - .5) * 1.4, s = sp * (.3 + Math.random()); dV[i * 3] = Math.cos(a) * s; dV[i * 3 + 1] = 40 + Math.random() * sp * .8; dV[i * 3 + 2] = Math.sin(a) * s; dL[i] = 1; dS[i] = size * (.5 + Math.random()); } }
  const GIBN = 140, gibGeo = new T.BoxGeometry(1, 1, 1), gibs = new T.InstancedMesh(gibGeo, MAT(0xffffff), GIBN); gibs.frustumCulled = false; gibs.setColorAt(0, new T.Color(0x7a0a0a)); scene.add(gibs); // цвет задаём сразу — иначе шейдер без цветов
  const gb = []; for (let i = 0; i < GIBN; i++) gb.push({ on: 0, p: [0, 0, 0], v: [0, 0, 0], r: [0, 0, 0], w: [0, 0, 0], s: [1, 1, 1], t: 0, col: 0 }); let gI = 0;
  function gib(p, h, dir, s, col, sp) { const o = gb[gI++ % GIBN]; o.on = 1; o.p = [p[0], h, p[1]]; const a = Math.atan2(dir[1], dir[0]) + (Math.random() - .5) * 1.6, v = sp * (.4 + Math.random() * .8); o.v = [Math.cos(a) * v, 60 + Math.random() * 120, Math.sin(a) * v]; o.r = [0, 0, 0]; o.w = [(Math.random() - .5) * 20, (Math.random() - .5) * 20, (Math.random() - .5) * 20]; o.s = s; o.t = 0; o.col = col; gibs.setColorAt(gb.indexOf(o), new T.Color(col)); gibs.instanceColor.needsUpdate = true; }
  // ===== зомби: 6 инстансных частей на всех — сотни зомби без тормозов =====
  const ZN = 420, parts = ['legL', 'legR', 'torso', 'head', 'armL', 'armR'], PG = {
    legL: [new T.BoxGeometry(5, 16, 5).translate(0, -8, 0), [-3.2, 16, 0]], legR: [new T.BoxGeometry(5, 16, 5).translate(0, -8, 0), [3.2, 16, 0]],
    torso: [new T.BoxGeometry(13, 16, 8).translate(0, 8, 0), [0, 15, 0]], head: [new T.BoxGeometry(9, 9, 9).translate(0, 4.5, 0), [0, 31, 1]],
    armL: [new T.BoxGeometry(4, 15, 4).translate(0, -7, 0), [-8.5, 29, 0]], armR: [new T.BoxGeometry(4, 15, 4).translate(0, -7, 0), [8.5, 29, 0]] };
  const ZM = {}; for (const k of parts) { const m = new T.InstancedMesh(PG[k][0], MAT(0xffffff), ZN); m.frustumCulled = false; m.setColorAt(0, new T.Color()); m.count = 0; scene.add(m); ZM[k] = m; } // цвет — до count = 0, иначе буфер цветов пустой
  const zShadow = new T.InstancedMesh(new T.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false }), ZN); zShadow.frustumCulled = false; scene.add(zShadow);
  const base = new T.Matrix4(), loc = new T.Matrix4(), tmp = new T.Matrix4(), C = new T.Color(), WHITE = new T.Color(1, 1, 1), FIRE = new T.Color(1, .5, .1);
  function drawZombies(list, now) {
    let n = 0;
    for (const z of list) {
      if (n >= ZN) break; const Tz = ZT[z.ty], sc = Tz.sc, crawl = z.lost & 4, t = now / 1000;
      const ph = z.walk, sw = Math.sin(ph), att = z.fl & 1;
      base.compose(V3.set(z.p[0], crawl ? 2 : 0, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.set(sc, sc, sc));
      if (crawl) base.multiply(tmp.makeRotationX(1.35)).multiply(tmp.makeTranslation(0, -14, -8));
      const flash = Math.max(0, z.flash), burn = z.fl & 2;
      for (const k of parts) {
        const m = ZM[k], [, j] = PG[k]; let rx = 0, rz = 0, hide = false;
        if (k === 'legL') { rx = sw * .6 * (crawl ? .2 : 1); hide = crawl; } else if (k === 'legR') { rx = -sw * .6 * (crawl ? .2 : 1); hide = crawl; }
        else if (k === 'armL') { rx = -1.45 + (att ? Math.sin(t * 14) * .5 : Math.sin(ph * .5) * .12); rz = -.1; hide = z.lost & 1; }
        else if (k === 'armR') { rx = -1.45 + (att ? Math.cos(t * 14) * .5 : Math.cos(ph * .5) * .12); rz = .1; hide = z.lost & 2; }
        else if (k === 'torso') { rx = .25 + (att ? .15 : 0); rz = Math.sin(ph * .5) * .08; }
        else if (k === 'head') { rx = .2; rz = Math.sin(t * 2 + z.seed) * .25; }
        if (hide) loc.makeScale(0, 0, 0); else { loc.makeTranslation(j[0], j[1], j[2]); loc.multiply(tmp.makeRotationFromEuler(E.set(rx, 0, rz))); }
        if (k === 'torso' || k === 'head') { if (k === 'head') { loc.makeTranslation(j[0], j[1] - 2, j[2] + 2); loc.multiply(tmp.makeRotationFromEuler(E.set(rx, 0, rz))); } }
        m.setMatrixAt(n, tmp.multiplyMatrices(base, loc));
        C.setHex(k === 'head' || k === 'armL' || k === 'armR' ? z.skin : k === 'torso' ? z.cloth : z.pants);
        if (burn) C.lerp(FIRE, .35 + .2 * Math.sin(t * 20 + z.seed)); if (flash > 0) C.lerp(WHITE, flash);
        m.setColorAt(n, C);
      }
      zShadow.setMatrixAt(n, M4.compose(V3.set(z.p[0], .6, z.p[1]), Q.identity(), S3.set(Tz.r * 1.1, 1, Tz.r * 1.1)));
      n++;
    }
    for (const k of parts) { ZM[k].count = n; ZM[k].instanceMatrix.needsUpdate = true; if (ZM[k].instanceColor) ZM[k].instanceColor.needsUpdate = true; }
    zShadow.count = n; zShadow.instanceMatrix.needsUpdate = true;
  }
  // ===== игроки =====
  const pls = {};
  function gunMesh(m) {
    const g = new T.Group(), b = (c, x, y, z, sx, sy, sz) => { const o = new T.Mesh(new T.BoxGeometry(sx, sy, sz), MAT(c)); o.position.set(x, y, z); g.add(o); };
    const L = { 1: 8, 5: 10, 3: 22, 2: 22, 8: 14, 7: 24, 4: 30, 6: 20, 9: 20 }[m] || 12;
    b(0x2a2a2a, 0, 0, L / 2, 2.6, 3.2, L); b(0x5a3a22, 0, -2.6, 0, 2.2, 4, 2.6);
    if (m === 3 || m === 8) b(0x6b4a2e, 0, -.6, -5, 2.4, 3, 8);
    if (m === 6) b(0x3d4a2a, 0, .5, L * .6, 5, 5, 8);
    if (m === 9) { b(0xc0392b, 0, -3.5, 6, 4.5, 6, 6); b(0x555555, 0, 0, L, 1.6, 1.6, 4); }
    if (m === 7) b(0x3a3a3a, 2.6, -2, 6, 3, 5, 6);
    if (m === 4) b(0x111111, 0, 3, 6, 1.8, 2, 8);
    g.userData.len = L; return g;
  }
  function makePlayer(id) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const box = (par, c, x, y, z, sx, sy, sz, oy = 0) => { const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz).translate(0, oy, 0), MAT(c)); m.position.set(x, y, z); par.add(m); return m; };
    const shirt = PCOL[id], legL = new T.Group(), legR = new T.Group(); legL.position.set(-3.4, 17, 0); legR.position.set(3.4, 17, 0); body.add(legL, legR);
    box(legL, 0x2f3542, 0, 0, 0, 5.5, 17, 6, -8.5); box(legR, 0x2f3542, 0, 0, 0, 5.5, 17, 6, -8.5);
    box(body, shirt, 0, 24, 0, 14, 15, 8.5); box(body, 0x4a3b2a, 0, 17.5, 0, 14.5, 2.5, 9);
    const head = new T.Group(); head.position.set(0, 32, 0); body.add(head); box(head, 0xe8b48a, 0, 4.5, 0, 9.5, 9.5, 9.5); box(head, 0x2b2b2b, 0, 9.6, -.5, 10, 2.5, 10); box(head, 0x111111, 0, 5.5, 4.9, 7, 1.6, .4);
    const armL = new T.Group(), armR = new T.Group(); armL.position.set(-8.6, 30, 0); armR.position.set(8.6, 30, 0); body.add(armL, armR);
    box(armL, shirt, 0, 0, 0, 4.2, 14, 4.2, -6.5); box(armR, shirt, 0, 0, 0, 4.2, 14, 4.2, -6.5);
    const gunH = new T.Group(); gunH.position.set(2.5, 24, 7); body.add(gunH);
    const ring = new T.Mesh(new T.RingGeometry(12, 15, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: shirt, transparent: true, opacity: .7 })); ring.position.y = .8; g.add(ring);
    g.scale.setScalar(1.15); scene.add(g);
    return { g, body, legL, legR, armL, armR, head, gunH, gunM: -1, walk: 0, lp: null, yaw: 0, ring };
  }
  function drawPlayer(id, p, aim, st, w, fire, inv, now, moving) {
    const P = pls[id] || (pls[id] = makePlayer(id)); P.seen = now;
    P.g.visible = st !== 2 && !(inv && Math.floor(now / 90) % 2);
    if (st === 2) return;
    const W = ZW[w]; if (P.gunM !== w) { P.gunH.clear(); const gm = gunMesh(W.m); P.gunH.add(gm); P.gunM = w; }
    if (P.lp) { const d = dist(p, P.lp); P.walk += d * .16; } P.lp = [...p];
    const tgt = Math.atan2(aim[0], aim[1]); let dy = tgt - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * .35;
    P.g.position.set(p[0], 0, p[1]); P.g.rotation.y = P.yaw;
    const sw = Math.sin(P.walk), a = moving ? 1 : 0;
    if (st === 1) { // упал: ползёт на животе
      P.body.rotation.x = 1.45; P.body.position.set(0, 4, -18); P.legL.rotation.x = sw * .3; P.legR.rotation.x = -sw * .3;
      P.armL.rotation.set(-2.6 + sw * .5, 0, 0); P.armR.rotation.set(-2.6 - sw * .5, 0, 0); P.gunH.visible = false; return; }
    P.gunH.visible = true; P.body.rotation.set(fire ? -.05 : 0, 0, 0); P.body.position.set(0, Math.abs(Math.cos(P.walk)) * 1.5 * a, 0);
    P.legL.rotation.x = sw * .7 * a; P.legR.rotation.x = -sw * .7 * a;
    if (W.oneh) { P.armR.rotation.set(-1.5, 0, -.1); P.armL.rotation.set(-sw * .5 * a, 0, -.1); P.gunH.position.set(8.6, 30, 14); P.gunH.rotation.set(0, 0, 0); }
    else { P.armR.rotation.set(-1.15, 0, .3); P.armL.rotation.set(-1.35, 0, -.55); P.gunH.position.set(3, 25.5, 6); P.gunH.rotation.set(0, 0, 0); }
    P.gunH.position.z -= fire ? 1.5 : 0;
  }
  // ===== вспышки, трассеры, огонь, взрывы =====
  const TRN = 80, trs = []; for (let i = 0; i < TRN; i++) { const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xfff3a0, transparent: true })); m.visible = false; m.userData.t = 9; scene.add(m); trs.push(m); } let trI = 0;
  function tracer(a, b, w) { const m = trs[trI++ % TRN], d = dist(a, b); m.position.set((a[0] + b[0]) / 2, 22, (a[1] + b[1]) / 2); m.rotation.set(0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0); m.scale.set(d, ZW[w] && ZW[w].m === 4 ? 1.6 : .8, ZW[w] && ZW[w].m === 4 ? 1.6 : .8); m.userData.t = 0; m.visible = true; }
  const glowTex = TEX.drop, SPN = 160, sps = []; for (let i = 0; i < SPN; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb040, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.visible = false; s.userData = { t: 9, life: 1, v: [0, 0, 0], s0: 10, s1: 20 }; scene.add(s); sps.push(s); } let spI = 0;
  function sprite(p, h, s0, s1, life, col, v = [0, 0, 0]) { const s = sps[spI++ % SPN]; s.position.set(p[0], h, p[1]); s.material.color.setHex(col); s.userData = { t: 0, life, v, s0, s1 }; s.visible = true; }
  let muzzleAt = null; function muzzle() { muzzleAt = true; }
  function flame(from, d, end) { for (let i = 0; i < 2; i++) { const k = Math.random() * end; sprite(add(from, d, k), 18, 6, 22, .35, Math.random() < .5 ? 0xff8a20 : 0xffd040, [d[0] * 120, 20, d[1] * 120]); } }
  function boom(c) { sprite(c, 20, 30, 160, .45, 0xffd080); for (let i = 0; i < 8; i++) sprite(add(c, [(Math.random() - .5) * 60, (Math.random() - .5) * 60]), 15 + Math.random() * 20, 20, 70, .6, 0xff7020, [0, 40, 0]); decal(c, 120, 'b2', 0x1a120c, .85); spray(c, 10, [1, 0], 30, 160, 2.4); }
  // ===== попадание и смерть =====
  function hitBlood(p, d, gore, z) { spray(p, 20, d, 4 + gore * 3, 90 + gore * 40); if (Math.random() < .5) bloodAt(add(p, d, 12 + Math.random() * 20), 14 + gore * 5, .8); if (z) z.flashT = 1; const zs = z && zst.get(z.id); if (zs) zs.flash = .9; }
  const dying = [];
  function kill(p, d, g, ty, lost, yaw) {
    const Tz = ZT[ty], sc = Tz.sc, skin = Tz.skin, cloth = Tz.cloth;
    spray(p, 20 * sc, d, 10 + g * 10, 120 + g * 50, 1.6 + g * .3); bloodAt(p, 30 * sc + g * 8, 1);
    for (let i = 0; i < 2 + g; i++) bloodAt(add(p, d, 15 + Math.random() * 40 * (g * .4 + .6)), 10 + Math.random() * 16, .9);
    if (g >= 5) { // разорвало
      for (let i = 0; i < 14; i++) gib(p, 18 * sc, d, [3 + Math.random() * 5, 3 + Math.random() * 5, 3 + Math.random() * 5].map(v => v * sc), Math.random() < .5 ? skin : Math.random() < .5 ? cloth : 0x7a0a0a, 230);
      bloodAt(p, 70 * sc, 1); return; }
    if (g >= 3) { if (!(lost & 1) && Math.random() < .6) gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], skin, 160); if (!(lost & 2) && Math.random() < .6) gib(p, 26 * sc, d, [4 * sc, 14 * sc, 4 * sc], skin, 160); if (Math.random() < .55) { gib(p, 32 * sc, d, [9 * sc, 9 * sc, 9 * sc], skin, 200); lost |= 16; } }
    dying.push({ p: [...p], d, yaw, ty, lost, t: 0, sc, skin, cloth, pants: 0x3a3a3a });
  }
  // ===== кадр =====
  let zoomK = 1;
  function frame(now, dt, me, list, plist) {
    flushDecals();
    // камера
    const vw = innerWidth, vh = innerHeight, span = Math.max(560, Math.min(820, Math.max(vw, vh) * .85)) * zoomK, asp = vw / vh;
    cam.left = -span / 2; cam.right = span / 2; cam.top = span / 2 / asp; cam.bottom = -span / 2 / asp; cam.updateProjectionMatrix();
    const ctr = new T.Vector3(me[0], 0, me[1]); cam.position.copy(ctr).addScaledVector(CAM_OFF, 1000); cam.lookAt(ctr);
    // частицы крови
    for (let i = 0; i < PN; i++) { if (dL[i] <= 0) { M4.makeScale(0, 0, 0); drops.setMatrixAt(i, M4); continue; }
      dV[i * 3 + 1] -= 520 * dt; dP[i * 3] += dV[i * 3] * dt; dP[i * 3 + 1] += dV[i * 3 + 1] * dt; dP[i * 3 + 2] += dV[i * 3 + 2] * dt;
      if (dP[i * 3 + 1] <= 0) { dL[i] = 0; if (Math.random() < .35) decal([dP[i * 3], dP[i * 3 + 2]], 4 + dS[i] * 3, 'drop', bloodCol(), .9); M4.makeScale(0, 0, 0); }
      else M4.compose(V3.set(dP[i * 3], dP[i * 3 + 1], dP[i * 3 + 2]), Q.identity(), S3.setScalar(dS[i]));
      drops.setMatrixAt(i, M4); }
    drops.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < GIBN; i++) { const o = gb[i]; if (!o.on) { gibs.setMatrixAt(i, M4.makeScale(0, 0, 0)); continue; }
      o.t += dt; if (o.p[1] > o.s[1] / 2) { o.v[1] -= 500 * dt; for (let k = 0; k < 3; k++) { o.p[k] += o.v[k] * dt; o.r[k] += o.w[k] * dt; } if (Math.random() < .3) spray([o.p[0], o.p[2]], o.p[1], [o.v[0], o.v[2]], 1, 20, 1.2); }
      else { o.p[1] = o.s[1] / 2; o.v[0] *= .8; o.v[2] *= .8; o.w = o.w.map(x => x * .8); o.p[0] += o.v[0] * dt; o.p[2] += o.v[2] * dt; if (o.t > .25 && Math.random() < .2) decal([o.p[0], o.p[2]], 6, 'drop', bloodCol(), .8); }
      if (o.t > 6) { o.on = 0; decal([o.p[0], o.p[2]], Math.max(o.s[0], o.s[1]) * 1.4, 'b0', 0x3a0a08, .9); }
      gibs.setMatrixAt(i, M4.compose(V3.set(o.p[0], o.p[1], o.p[2]), Q.setFromEuler(E.set(o.r[0], o.r[1], o.r[2])), S3.set(o.s[0], o.s[1], o.s[2]))); }
    gibs.instanceMatrix.needsUpdate = true;
    // умирающие зомби: падают, потом «впитываются» в землю трупом
    const all = list.slice();
    for (let i = dying.length - 1; i >= 0; i--) { const z = dying[i]; z.t += dt;
      if (z.t > 2.2) { decal(add(z.p, z.d, 14 * z.sc), 34 * z.sc, 'body', 0x3e1a14, .95, -z.yaw + Math.PI, 1); bloodAt(z.p, 26 * z.sc, .7); dying.splice(i, 1); continue; }
      const k = Math.min(1, z.t / .35); all.push({ p: add(z.p, z.d, k * 10), ty: z.ty, lost: z.lost | (k > .9 ? 0 : 0), yaw: z.yaw, walk: 0, fl: 0, skin: z.skin, cloth: z.cloth, pants: z.pants, seed: 1, flash: 0, fall: k, fd: z.d }); }
    drawZombiesFall(all, now);
    // эффекты
    for (const m of trs) { if (!m.visible) continue; m.userData.t += dt; m.material.opacity = 1 - m.userData.t / .07; if (m.userData.t > .07) m.visible = false; }
    for (const s of sps) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > u.life) { s.visible = false; continue; } const k = u.t / u.life; s.scale.setScalar(u.s0 + (u.s1 - u.s0) * k); s.material.opacity = 1 - k; s.position.x += u.v[0] * dt; s.position.y += u.v[1] * dt; s.position.z += u.v[2] * dt; }
    if (muzzleAt) { const P = pls[myId]; if (P) { const w = new T.Vector3(0, 0, P.gunH.children[0] ? P.gunH.children[0].userData.len + 3 : 14); P.gunH.localToWorld(w); sprite([w.x, w.z], w.y, 14, 26, .06, 0xffe080); } muzzleAt = null; }
    for (const id in pls) if (pls[id].seen !== now) pls[id].g.visible = false;
    for (const p of plist) drawPlayer(p.id, p.p, p.aim, p.st, p.w, p.fire, p.inv, now, p.moving);
    // аптечки
    itemMesh.count = 0; let ii = 0; for (const [, p] of items) { M4.compose(V3.set(p[0], 6 + Math.sin(now / 200) * 2, p[1]), Q.setFromEuler(E.set(0, now / 600, 0)), S3.setScalar(1)); itemMesh.setMatrixAt(ii++, M4); } itemMesh.count = ii; itemMesh.instanceMatrix.needsUpdate = true;
    renderer.setSize(vw, vh, false); renderer.render(scene, cam);
  }
  const itemMesh = new T.InstancedMesh(new T.BoxGeometry(12, 8, 12), MAT(0xffffff), 50); itemMesh.frustumCulled = false; scene.add(itemMesh);
  { const cross = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), MAT(0xe03131), 1); }
  // зомби с учётом падения
  function drawZombiesFall(list, now) {
    const pre = list.filter(z => !z.fall), fall = list.filter(z => z.fall);
    drawZombies(pre.concat(fall.map(z => z)), now);
    // для падающих — доворачиваем матрицы: опрокидываем назад от выстрела
    let n = pre.length;
    for (const z of fall) { if (n >= ZN) break; const sc = ZT[z.ty].sc, ang = (1 - Math.pow(1 - z.fall, 3)) * 1.5;
      base.compose(V3.set(z.p[0], 0, z.p[1]), Q.setFromEuler(E.set(0, z.yaw, 0)), S3.set(sc, sc, sc)); base.multiply(tmp.makeRotationX(-ang));
      for (const k of parts) { const [, j] = PG[k]; const hide = (k === 'armL' && z.lost & 1) || (k === 'armR' && z.lost & 2) || ((k === 'legL' || k === 'legR') && z.lost & 4) || (k === 'head' && z.lost & 16);
        if (hide) loc.makeScale(0, 0, 0); else { loc.makeTranslation(j[0], j[1], j[2]); loc.multiply(tmp.makeRotationFromEuler(E.set(k.startsWith('arm') ? -1.2 - ang : k.startsWith('leg') ? ang * .3 : 0, 0, 0))); }
        ZM[k].setMatrixAt(n, tmp.multiplyMatrices(base, loc)); }
      n++; }
    for (const k of parts) ZM[k].instanceMatrix.needsUpdate = true;
  }
  function resetBlood() { needClear = true; dying.length = 0; for (const o of gb) o.on = 0; dL.fill(0); }
  function clearFx() { dying.length = 0; }
  return { ZM, frame, tracer, flame, boom, hitBlood, kill, muzzle, decal, bloodAt, resetBlood, clearFx, grid, gi, wetAt: p => { const i = gi(p); return i < 0 ? 0 : grid[i]; }, renderer };
})();
// ===================== игровой цикл =====================
let lastT = performance.now(), sendAcc = 0, footD = 0, footSide = 1, footWet = 0, hurtFlash = 0, lastHp = 1, fps = 60;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; fps = fps * .95 + (1 / Math.max(dt, .001)) * .05;
  const S = sampled(now), cur = lastSnap;
  const playing = inRoom && cur && cur.st >= 1 && !$('lobby').classList.contains('on');
  // мой ввод
  let mv = [0, 0], aimV = null; fireHeld = false;
  if (playing) {
    if (keys.KeyW || keys.ArrowUp) mv[1]--; if (keys.KeyS || keys.ArrowDown) mv[1]++; if (keys.KeyA || keys.ArrowLeft) mv[0]--; if (keys.KeyD || keys.ArrowRight) mv[0]++;
    const L = stickV('L'); if (len(L) > 0) mv = L;
    // экран → мир (изометрия): «вверх» на экране = (-1,-1) в мире
    const scr = v => { const x = v[0], y = v[1] / ISO_K, l = len(v), r = [(x + y) * Math.SQRT1_2, (y - x) * Math.SQRT1_2]; return l > 0 ? add([0, 0], norm(r), l) : r; };
    if (len(mv) > 0) mv = scr(len(mv) > 1 ? norm(mv) : mv);
    const Rv = stickV('R');
    if (len(Rv) > .15) { aimV = norm(scr(Rv)); fireHeld = len(Rv) > .5; }
    else if (!touchUI && mouse.has) { const dx = mouse.x - innerWidth / 2, dy = mouse.y - innerHeight / 2; if (dx * dx + dy * dy > 100) aimV = norm(scr([dx, dy])); fireHeld = mouse.down || keys.Space; }
    else if (len(mv) > 0) aimV = norm(mv);
    if (aimV) meAim = aimV;
    if (meSt !== 2) { const sp = ZSPEED * (1 + (pk.spd || 0) * .08) * (meSt === 1 ? .35 : 1); meP = add(meP, mv, sp * dt); meP[0] = Math.max(-ZA, Math.min(ZA, meP[0])); meP[1] = Math.max(-ZA, Math.min(ZA, meP[1])); }
  }
  // зомби: интерполяция + анимация
  const zl = [];
  if (S && S.a.st === 1) {
    for (const [id, zb] of S.b.z) { const za = S.a.z.get(id) || zb, p = lerp(za.p, zb.p, S.k);
      let z = zst.get(id); const Tz = ZT[zb.ty];
      if (!z) { z = { id, p, lp: p, walk: Math.random() * 6, yaw: Math.atan2(-p[0], -p[1]), seed: id % 7, flash: 0, skin: shade(Tz.skin, id), cloth: shade(Tz.cloth, id * 3), pants: shade(0x3a3a40, id * 5) }; zst.set(id, z); }
      const d = dist(p, z.lp); z.walk += d * .12 * (1 / Tz.sc); if (d > .2) { const ty = Math.atan2(p[0] - z.lp[0], p[1] - z.lp[1]); let dy = ty - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * .2; }
      z.lp = p; z.p = p; z.ty = zb.ty; z.lost = zb.lost; z.fl = zb.fl; z.hp = zb.hp; z.flash = Math.max(0, z.flash - dt * 6);
      if (zb.hp < .5 && Math.random() < dt * 2) R.decal(p, 5 + Math.random() * 5, 'drop', 0x7a0000, .8); // раненый оставляет кровавый след
      if (zb.lost & 4 && Math.random() < dt * 8) R.decal(p, 9, 'drop', 0x6a0000, .5);
      if (zb.fl & 2 && Math.random() < dt * 10) R.flame(p, [0, 0], 1);
      zl.push(z); }
    for (const id of zst.keys()) if (!S.b.z.has(id) && !S.a.z.has(id)) zst.delete(id);
  }
  // стрельба
  const W = ZW[myW]; bloom = Math.max(0, bloom - dt * .35);
  if (relT > 0) { relT -= dt; if (relT <= 0) ammo[myW] = magOf(myW); }
  fireT -= dt;
  if (playing && fireHeld && meSt === 0 && cur.st === 1 && relT <= 0 && !perkTap) {
    const rate = W.rate * (1 + (pk.rate || 0) * .12);
    while (fireT <= 0 && ammo[myW] > 0) { fireT += 1 / rate; ammo[myW]--; const zpos = new Map(zl.map(z => [z.id, z])); shoot(zpos); }
    if (ammo[myW] <= 0) relStart();
  }
  if (fireT < 0) fireT = 0;
  // кровавые следы ног
  if (playing && meSt === 0) { const w = R.wetAt(meP); if (w > .25) footWet = Math.min(1, footWet + w * .5); footD += len(mv) * ZSPEED * dt;
    if (footD > 17 && footWet > .05) { footD = 0; footSide *= -1; const a = Math.atan2(meAim[0], meAim[1]), mvA = len(mv) ? Math.atan2(mv[0], mv[1]) : a, side = [Math.cos(mvA) * 4 * footSide, -Math.sin(mvA) * 4 * footSide];
      R.decal(add(meP, side), 7, 'foot', 0x5a0000, .75 * footWet, -mvA + Math.PI, 1.6); footWet *= .88; } }
  // отправка ввода 20 раз в секунду
  sendAcc += dt;
  if (playing && sendAcc >= ZDT) { sendAcc = 0; const m = { t: 'in', p: [Math.round(meP[0] * 10) / 10, Math.round(meP[1] * 10) / 10], a: [Math.round(meAim[0] * 100) / 100, Math.round(meAim[1] * 100) / 100], w: myW, f: fireHeld && meSt === 0 ? 1 : 0 };
    if (outHits.length) m.h = outHits.splice(0); if (outShots.length) m.s = outShots.splice(0); if (outBooms.length) m.b = outBooms.splice(0); send(m); }
  // игроки
  const plist = [];
  if (S) for (const pb of S.b.pl) { if (pb.id === myId) { plist.push({ id: myId, p: meP, aim: meAim, st: pb.st, w: myW, fire: fireHeld && meSt === 0 && relT <= 0, inv: pb.inv, moving: len(mv) > 0 }); continue; }
    const pa = S.a.pl.find(q => q.id === pb.id) || pb, p = lerp(pa.p, pb.p, S.k); plist.push({ id: pb.id, p, aim: [Math.cos(pb.a), Math.sin(pb.a)], st: pb.st, w: pb.w, fire: pb.fire, inv: pb.inv, moving: dist(pa.p, pb.p) > .5 }); }
  const meS = cur && cur.pl.find(q => q.id === myId); if (meS) { if (meS.hp < lastHp - .01 && meS.st === 0) { hurtFlash = 1; sfx('hurt'); } lastHp = meS.hp; }
  hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
  if (playing || (S && inRoom)) R.frame(now, dt, meP, zl, plist); else R.frame(now, dt, [Math.sin(now / 9000) * 300, Math.cos(now / 9000) * 300], [], []);
  hud(now, dt, cur, meS, plist);
}
function shade(hex, seed) { const c = new THREE.Color(hex), k = .85 + ((seed * 9301 + 49297) % 233280) / 233280 * .3; return c.multiplyScalar(k).getHex(); }
// ===================== HUD =====================
let perkTap = false;
function txt(s, x, y, size, col, align = 'center', weight = 800) { ctx.font = weight + ' ' + size + 'px system-ui,sans-serif'; ctx.textAlign = align; ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function toScreen(p) { // мир → экран (та же изометрия, что у камеры)
  const vw = innerWidth, vh = innerHeight, span = Math.max(560, Math.min(820, Math.max(vw, vh) * .85)), k = vw / span;
  const d = sub(p, meP), cx = (d[0] - d[1]) * Math.SQRT1_2, cy = (d[0] + d[1]) * Math.SQRT1_2 * ISO_K; return [vw / 2 + cx * k, vh / 2 + cy * k];
}
function hud(now, dt, cur, meS, plist) {
  const dpr = Math.min(2, devicePixelRatio), W_ = innerWidth, H_ = innerHeight;
  if (cv.width !== W_ * dpr) { cv.width = W_ * dpr; cv.height = H_ * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W_, H_); btns = [];
  if (!inRoom || !cur || cur.st === 0 || $('lobby').classList.contains('on')) return;
  if (hurtFlash > 0) { const g = ctx.createRadialGradient(W_ / 2, H_ / 2, Math.min(W_, H_) * .3, W_ / 2, H_ / 2, Math.max(W_, H_) * .7); g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(160,0,0,' + hurtFlash * .6 + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, W_, H_); }
  // верх: волна
  const s = cur.phase === 1 ? 'ВОЛНА ' + cur.wave + '  ·  🧟 ' + cur.left : cur.wave ? 'Перерыв · следующая волна через ' + Math.ceil(cur.timer) + ' с' : 'Приготовьтесь… ' + Math.ceil(cur.timer);
  txt(s, W_ / 2, 30, 18, '#fff');
  if (bigMsg && now - bigMsg.t < 2600) { const a = Math.min(1, (2600 - (now - bigMsg.t)) / 500); ctx.globalAlpha = a; txt(bigMsg.s, W_ / 2, H_ * .3, Math.min(54, W_ / 12), bigMsg.c || '#ff4b4b', 'center', 900); ctx.globalAlpha = 1; }
  msgs = msgs.filter(m => now - m.t < 4500); msgs.slice(-5).forEach((m, i) => txt(m.s, W_ / 2, 56 + i * 22, 15, m.c || '#ffe3e3'));
  // имена и состояние других игроков
  for (const p of plist) { const [x, y] = toScreen(p.p); const nm = (roster.find(r => r[0] === p.id) || [0, '?'])[1];
    if (p.id !== myId) { txt(nm, x, y - 52, 12, PCSS[p.id]); const ps = cur.pl.find(q => q.id === p.id); if (ps) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 16, y - 47, 32, 4); ctx.fillStyle = '#51cf66'; ctx.fillRect(x - 16, y - 47, 32 * ps.hp, 4); }
      if (ps && ps.st === 1) { txt('🆘 ' + ps.down, x, y - 64, 15, '#ff6b6b'); }
      if (x < 0 || x > W_ || y < 0 || y > H_) { const cx = Math.max(24, Math.min(W_ - 24, x)), cy = Math.max(60, Math.min(H_ - 24, y)); ctx.fillStyle = PCSS[p.id]; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.fill(); if (ps && ps.st === 1) txt('🆘', cx, cy - 14, 14, '#fff'); } } }
  // я
  if (meS) {
    const bw = Math.min(220, W_ * .35), x0 = 14, y0 = H_ - 46;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(x0, y0, bw, 16, 6); ctx.fill(); ctx.fillStyle = meS.hp > .35 ? '#e03131' : '#ff6b6b'; rr(x0, y0, bw * meS.hp, 16, 6); ctx.fill(); txt('❤ ' + Math.ceil(meS.hp * maxHp), x0 + 8, y0 + 13, 12, '#fff', 'left');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0, y0 + 20, bw, 6); ctx.fillStyle = '#ffd43b'; ctx.fillRect(x0, y0 + 20, bw * meS.xp, 6); txt('ур. ' + meS.lvl, x0 + bw + 8, y0 + 27, 13, '#ffd43b', 'left');
    // оружие
    const W = ZW[myW], wx = W_ - 14, wy = H_ - 20;
    txt(W.n + ' ' + '★'.repeat(Math.max(0, (wl[myW] || 1) - 1)), wx, wy - 22, 17, '#fff', 'right'); txt(relT > 0 ? 'перезарядка…' : ammo[myW] + ' / ' + magOf(myW), wx, wy, 15, relT > 0 ? '#ffd43b' : '#ccc', 'right');
    if (unl.length > 1) { const b = { x: W_ - 128, y: H_ - 104, w: 114, h: 34, f: () => cycleW(1) }; btns.push(b); ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(b.x, b.y, b.w, b.h, 10); ctx.fill(); txt('🔫 сменить (' + unl.length + ')', b.x + b.w / 2, b.y + 22, 13, '#fff'); }
    if (meS.st === 1) { txt('ТЫ УПАЛ! Ползи к напарнику — ' + meS.down + ' с', W_ / 2, H_ * .72, 22, '#ff6b6b', 'center', 900); }
    if (meS.st === 2) txt('💀 Ты погиб. Вернёшься в начале следующей волны', W_ / 2, H_ * .72, 20, '#ff8787');
  }
  // перки: выбор 1 из 3
  perkTap = false;
  if (perkOpts) {
    const n = 3, cw = Math.min(200, (W_ - 40) / 3), ch = 74, y = H_ - ch - (touchUI ? 120 : 70), x0 = W_ / 2 - (cw * n + 10 * (n - 1)) / 2;
    txt('⭐ Уровень ' + perkLv + ' — выбери улучшение' + (touchUI ? '' : ' (Z / X / C)'), W_ / 2, y - 10, 15, '#ffd43b');
    perkOpts.forEach((pi, i) => { const P = ZPERK[pi], b = { x: x0 + i * (cw + 10), y, w: cw, h: ch, f: () => pickPerk(i) }; btns.push(b); ctx.fillStyle = 'rgba(40,10,10,.88)'; rr(b.x, b.y, b.w, b.h, 12); ctx.fill(); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.stroke();
      txt(P.n, b.x + cw / 2, b.y + 28, 14, '#fff'); txt(P.d, b.x + cw / 2, b.y + 50, 11, '#e0c0c0', 'center', 600); });
  }
  // стики
  if (touchUI) for (const k of ['L', 'R']) { const st = sticks[k]; if (!st) continue; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(st.o[0], st.o[1], 60, 0, 7); ctx.stroke(); const d = sub(st.p, st.o), l = Math.min(60, len(d)), q = add(st.o, norm(d), l); ctx.fillStyle = k === 'R' ? 'rgba(255,80,80,.5)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(q[0], q[1], 24, 0, 7); ctx.fill(); }
  if (touchUI && !sticks.L && !sticks.R && now - startedT < 9000) { txt('левый палец — бежать, правый — целиться и стрелять', W_ / 2, H_ - 14, 13, 'rgba(255,255,255,.7)'); }
  // выход
  const xb = { x: W_ - 44, y: 10, w: 34, h: 34, f: () => { if (confirm('Выйти из игры?')) leaveRoom(); } }; btns.push(xb); ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(xb.x, xb.y, xb.w, xb.h, 8); ctx.fill(); txt('✕', xb.x + 17, xb.y + 24, 18, '#fff');
  if (location.hash === '#perf') txt(Math.round(fps) + ' fps · 🧟 ' + zst.size, 10, 20, 12, '#0f0', 'left');
  // итоги
  if (overInfo) { ctx.fillStyle = 'rgba(10,0,0,.8)'; ctx.fillRect(0, 0, W_, H_); txt('ВСЕ ПАЛИ', W_ / 2, H_ * .28, 48, '#ff3b3b', 'center', 900);
    txt('Дошли до волны ' + overInfo.w + (overInfo.cyc ? ' (круг ' + (overInfo.cyc + 1) + ')' : '') + ' · убито зомби: ' + overInfo.kills, W_ / 2, H_ * .28 + 40, 18, '#fff');
    overInfo.pl.forEach(([n, k, l], i) => txt(n + ' — ' + k + ' убийств, ур. ' + l, W_ / 2, H_ * .28 + 80 + i * 24, 15, '#e0c0c0'));
    txt('🏆 рекорд: волна ' + (+(localStorage.getItem('zbest') || 0)), W_ / 2, H_ * .28 + 190, 15, '#ffd43b'); txt('Возврат в комнату…', W_ / 2, H_ * .28 + 220, 13, '#aaa'); }
}
connect(); requestAnimationFrame(loop);
