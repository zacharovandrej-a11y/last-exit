// ===== LAST EXIT — клиент зомби-коопа: экраны, сеть, управление, HUD =====
const $ = id => document.getElementById(id);
const CAM_F = G3.CAM_F, CAM_R = G3.CAM_R; // «вверх» и «вправо» экрана на карте
const NOZONE = zoneAt(0, null);
const objs = genWorld();
const PCSS = ['#3d8bff', '#ff5a5a', '#51cf66', '#ffd43b'], PCH = [0, 3, 4, 1];
let ws = null, myId = -1, roomCode = '', inRoom = false, roster = [];
let snaps = [], lastSnap = null, meP = [...ZSPAWN], meAim = [1, 0], meSt = 0, myW = 0, unl = [0], pk = {}, wl = ZW.map(() => 1), maxHp = 100;
let perkOpts = null, perkLv = 0, msgs = [], overInfo = null, bigMsg = null, startedT = 0;
const ammo = ZW.map(w => w.mag); let relT = 0, fireT = 0, bloom = 0;
const zst = new Map(), loot = new Map(), tracers = [], trails = [], walks = {}; const ash = []; let frameShots = [], shake = 0, shakeV = [0, 0], buf = { rage: 0, spd: 0, ammo: 0, shield: 0, frz: 0 };
const ZSKIN = 10; let mySkin = (+localStorage.getItem('zskin') || 0) % ZSKIN;
$('rec').textContent = +(localStorage.getItem('zbest') || 0) ? '🏆 Твой рекорд: волна ' + localStorage.getItem('zbest') : '';
$('name').value = localStorage.getItem('zname') || '';
const myName = () => ($('name').value.trim() || 'Игрок').slice(0, 12);
function show(id) { for (const s of ['start', 'lobby']) $(s).classList.toggle('on', s === id); }
// ===== список комнат и вход =====
async function refreshRooms() {
  if (inRoom) return;
  try { const l = await (await fetch('/rooms', { cache: 'no-store' })).json(); renderRooms(l); return l; } catch (e) { return []; }
}
function renderRooms(l) {
  const el = $('rooms'); el.innerHTML = ''; if (!l.length) el.innerHTML = '<div class="hint">Пока никого — создай свою или жми «Быстрая игра»</div>';
  for (const r of l) { const d = document.createElement('div'); d.className = 'room'; d.innerHTML = '<div class="i"><b>' + r.c + '</b> · ' + r.n + '/4 · ' + (r.st === 'wait' ? 'ждут игроков' : r.st === 'play' ? 'волна ' + r.w : 'итоги') + '<br>' + (r.names || []).join(', ') + '</div>';
    const b = document.createElement('button'); b.textContent = r.n >= 4 ? 'Полна' : 'Войти'; b.disabled = r.n >= 4; b.onclick = () => connect(r.c); d.appendChild(b); el.appendChild(d); }
}
setInterval(refreshRooms, 3000); refreshRooms();
const newCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
$('quick').onclick = async () => { const l = (await refreshRooms()) || []; const f = l.filter(r => r.n < 4 && r.st !== 'over').sort((a, b) => (a.st === 'wait' ? -1 : 0) - (b.st === 'wait' ? -1 : 0) || a.w - b.w)[0]; connect(f ? f.c : newCode()); };
$('create').onclick = () => connect(newCode());
$('go').onclick = () => { send({ t: 'start' }); audioInit(); };
const setSkin = d => { mySkin = (mySkin + d + ZSKIN) % ZSKIN; localStorage.setItem('zskin', mySkin); };
$('skp').onclick = () => setSkin(-1); $('skn').onclick = () => setSkin(1);
$('leave').onclick = () => leaveRoom();
$('share').onclick = () => { const url = location.origin + '/?r=' + roomCode; if (navigator.share) navigator.share({ title: 'LAST EXIT', text: 'Заходи отбиваться от зомби!', url }).catch(() => { }); else { navigator.clipboard && navigator.clipboard.writeText(url); $('share').textContent = '✔ Ссылка скопирована'; } };
function connect(code) {
  localStorage.setItem('zname', myName()); audioInit(); $('err').textContent = '';
  if (ws) { ws.onclose = null; ws.close(); }
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?r=' + code + '&n=' + encodeURIComponent(myName()) + '&k=' + mySkin); ws.binaryType = 'arraybuffer';
  ws.onmessage = e => typeof e.data === 'string' ? onMsg(JSON.parse(e.data)) : onSnap(e.data);
  ws.onclose = () => { if (inRoom) { $('err').textContent = 'Связь потеряна'; inRoom = false; show('start'); } };
}
const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
function leaveRoom() { inRoom = false; roomCode = ''; if (ws) { ws.onclose = null; ws.close(); ws = null; } history.replaceState(null, '', '/'); show('start'); refreshRooms(); }
{ const r = new URLSearchParams(location.search).get('r'); if (r) { $('start').querySelector('.hint').textContent = 'Тебя позвали в комнату ' + r.toUpperCase() + ' — впиши имя и жми «Быстрая игра»'; $('quick').onclick = () => connect(r.toUpperCase()); } }
// ===== сообщения сервера =====
function onMsg(m) {
  const now = performance.now();
  if (m.t === 'err') { $('err').textContent = m.s; leaveRoom(); }
  else if (m.t === 'sp') meP = [...m.sp];
  else if (m.t === 'room') { inRoom = true; myId = m.you; meP = [...m.sp]; roomCode = m.code; unl = m.unl; history.replaceState(null, '', '/?r=' + m.code); $('code').textContent = m.code; $('share').textContent = '🔗 Позвать друга'; resetLocal();
    for (const id of m.dead) if (objs[id]) { objs[id].dead = true; objs[id].type === 'bw' || objs[id].type === 'fence' || objs[id].type === 'ifence' ? G3.smashWall(id, null) : G3.killObj(id); }
    for (const id of m.gl) if (objs[id]) { objs[id].broken = true; G3.breakGlass(id, objs); }
    for (const [id, s] of m.ob) G3.objState(id, s, objs);
    for (const [id, x, y, k] of m.it) addLoot(id, x, y, k || 0, now); if (m.frz) buf.frz = now + m.frz * 1000;
    if (m.st === 'play') { show(null); startedT = now; } else show('lobby'); }
  else if (m.t === 'ros') { roster = m.pl; for (const [id, , k] of roster) if (k !== undefined) skinOf[id] = k; $('plist').innerHTML = roster.map(([id, n]) => '<div class="pl" style="--c:' + PCSS[id] + '">' + n + (id === myId ? ' (ты)' : '') + '</div>').join(''); if (m.st === 'wait' && inRoom) { show('lobby'); overInfo = null; } }
  else if (m.t === 'start') { show(null); resetLocal(); ZFX.reset(); startedT = now; meP = [...m.sp]; }
  else if (m.t === 'wave') { unl = m.unl; bigMsg = { s: (m.boss ? '☠ БОСС · ' : '') + 'ВОЛНА ' + m.w + (m.cyc ? ' · круг ' + (m.cyc + 1) : ''), t: now }; for (const i of m.nw) msgs.push({ s: '🔓 Открыто: ' + ZW[i].n, t: now, c: '#ffd43b' }); if (m.nw.length) myW = m.nw[m.nw.length - 1]; if (m.tip) msgs.push({ s: m.tip, t: now + 2000, c: '#ff8787' }); sfx('wave'); }
  else if (m.t === 'clear') { bigMsg = { s: 'ВОЛНА ' + m.w + ' ПРОЙДЕНА', t: now, c: '#8ce99a' }; if (m.w > +(localStorage.getItem('zbest') || 0)) localStorage.setItem('zbest', m.w); }
  else if (m.t === 'msg') msgs.push({ s: m.s, t: now, c: m.c });
  else if (m.t === 'lvl') { perkOpts = m.o; perkLv = m.lv; sfx('lvl'); }
  else if (m.t === 'pk') { pk = m.pk; wl = m.wl; maxHp = m.maxHp; }
  else if (m.t === 'k') { const z = zst.get(m.z); ZFX.kill([m.x, m.y], m.d, m.g, m.ty, m.lost, z); zst.delete(m.z); sfx('splat', vol([m.x, m.y]) * (m.g >= 3 ? 1 : .6)); }
  else if (m.t === 'sh') for (const [id, w, list] of m.s) { if (id === myId) continue; const p = plPos(id); if (!p) continue;
    if (w < 0) { for (const b of list) ZFX.boom(b, 95); sfx('boom', vol(list[0])); continue; }
    for (const [a, l] of list) { const an = a / 100, d = [Math.cos(an), Math.sin(an)], from = add(p, d, 12); if (ZW[w].fire) ZFX.flame(from, d, l); else addBullet(ZW[w], from, d, l, null); } frameShots.push([id, ZW[w].fire ? 0 : 1]); sfx('shot' + w, vol(p) * .6); }
  else if (m.t === 'it') addLoot(m.id, m.x, m.y, m.k || 0, now);
  else if (m.t === 'itx') { loot.delete(m.id); if (m.by >= 0) onBonus(m, now); }
  else if (m.t === 'over') { overInfo = Object.assign(m, { t: now }); if (m.w > +(localStorage.getItem('zbest') || 0)) localStorage.setItem('zbest', m.w); }
  else if (m.t === 'cr') { const o = objs[m.id]; if (o) { o.dead = true; G3.killObj(m.id); if (!m.boom) { sfx('crate', vol(o.p)); G3.debris(o.p, 14, 12, 0x8a6a40, 110, 3.2); } } }
  else if (m.t === 'rv') { const o = objs[m.id]; if (o) { o.dead = false; G3.reviveObj(m.id); } }
  else if (m.t === 'ob') G3.objState(m.id, m.s, objs);
  else if (m.t === 'boom') { ZFX.boom(m.p, m.r); sfx('boom', vol(m.p)); shake = Math.max(shake, 7 * vol(m.p) * (m.r > 200 ? 2 : 1)); }
  else if (m.t === 'gl') { const o = objs[m.id]; if (o && !o.broken) { o.broken = true; G3.breakGlass(m.id, objs); sfx('glass', vol(o.p) * .8); } }
  else if (m.t === 'wb') { const o = objs[m.id]; if (o) { o.dead = true; G3.smashWall(m.id, objs); sfx('boom', vol(o.p) * .6); } } // громила проломил
  else if (m.t === 'smh') { const o = objs[m.id]; if (o) { G3.debris(lerp(o.p, [m.x, m.y], .3), 18, 4, 0x8a7a6a, 70, 2.5); sfx('smash', vol([m.x, m.y]) * .8); } }
}
function resetLocal() { zst.clear(); loot.clear(); perkOpts = null; overInfo = null; pk = {}; wl = ZW.map(() => 1); maxHp = 100; myW = 0; ZW.forEach((w, i) => ammo[i] = w.mag); snaps = []; tracers.length = 0; trails.length = 0; buf = { rage: 0, spd: 0, ammo: 0, shield: 0, frz: 0 }; }
// ===== снапшоты =====
function onSnap(buf) {
  const v = new DataView(buf); if (v.getUint8(0) !== 1) return;
  const s = { t: performance.now(), st: v.getUint8(1), phase: v.getUint8(2), wave: v.getUint8(3), left: v.getUint16(4, true), timer: v.getUint16(6, true) / 10, cyc: v.getUint8(9), pl: [], z: new Map() };
  const np = v.getUint8(8), nz = v.getUint16(10, true); let o = 12;
  for (let i = 0; i < np; i++) { const f = v.getUint8(o + 7); s.pl.push({ id: v.getUint8(o), p: [v.getInt16(o + 1, true) / 10, v.getInt16(o + 3, true) / 10], a: v.getUint8(o + 5) / 255 * Math.PI * 2, hp: v.getUint8(o + 6) / 255, st: f & 3, fire: f & 4, inv: f & 8, rev: f & 16, w: v.getUint8(o + 8), lvl: v.getUint8(o + 9), down: v.getUint8(o + 10), xp: v.getUint8(o + 11) / 255 }); o += ZSN_P; }
  for (let i = 0; i < nz; i++) { const id = v.getUint16(o, true), b = v.getUint8(o + 6); s.z.set(id, { p: [v.getInt16(o + 2, true) / 10, v.getInt16(o + 4, true) / 10], ty: b & 7, lost: b >> 3, hp: v.getUint8(o + 7) / 255, fl: v.getUint8(o + 8) }); o += ZSN_Z; }
  const me = s.pl.find(q => q.id === myId);
  if (me) { if (me.st === 2 || dist(me.p, meP) > 160 || (meSt === 2 && me.st !== 2)) meP = [...me.p]; meSt = me.st; }
  snaps.push(s); if (snaps.length > 30) snaps.shift(); lastSnap = s;
}
const INTERP = 110;
function sampled(now) {
  const tt = now - INTERP; let a = null, b = null;
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= tt) { a = snaps[i]; b = snaps[i + 1] || a; break; }
  if (!a) a = b = snaps[0]; if (!a) return null;
  return { a, b, k: b === a ? 0 : Math.min(1, (tt - a.t) / (b.t - a.t)) };
}
function plPos(id) { if (id === myId) return meP; const s = lastSnap && lastSnap.pl.find(q => q.id === id); return s ? s.p : null; }
// ===== управление =====
const keys = {}, mouse = { x: 0, y: 0, down: false, has: false }; let fireHeld = false, touchUI = false;
const sticks = { L: null, R: null };
const weaponStrip = $('weapons');
let shownWeapons = [], shownWeapon = -1;
weaponStrip.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchUI = true; });
weaponStrip.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (button && unl.includes(+button.value)) myW = +button.value;
});
weaponStrip.addEventListener('wheel', e => {
  if (!e.deltaX && e.deltaY) {
    e.preventDefault();
    cycleW(e.deltaY > 0 ? 1 : -1);
  }
}, { passive: false });
function updateWeaponStrip(visible) {
  if (weaponStrip.hidden === visible) weaponStrip.hidden = !visible;
  if (!visible) return;
  if (shownWeapons !== unl) {
    shownWeapons = unl;
    shownWeapon = -1;
    weaponStrip.replaceChildren(...unl.map(i => {
      const button = document.createElement('button');
      button.type = 'button';
      button.value = i;
      button.setAttribute('aria-label', ZW[i].n);
      button.title = ZW[i].n;
      const image = document.createElement('img');
      image.src = G3.weaponImage(i);
      image.alt = '';
      image.draggable = false;
      button.append(image);
      return button;
    }));
  }
  if (shownWeapon === myW) return;
  shownWeapon = myW;
  for (const button of weaponStrip.children) {
    const selected = +button.value === myW;
    button.setAttribute('aria-pressed', selected);
    if (selected && (button.offsetLeft < weaponStrip.scrollLeft ||
        button.offsetLeft + button.offsetWidth > weaponStrip.scrollLeft + weaponStrip.clientWidth)) {
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}
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
function stickV(s) { const k = sticks[s]; if (!k) return [0, 0]; const d = sub(k.p, k.o), l = len(d); if (l < 6) return [0, 0]; const m = Math.min(1, l / 60); return [d[0] / l * m, -d[1] / l * m]; }
const scr2map = v => add(mul(CAM_R, v[0]), CAM_F, v[1]);
function cycleW(d) { if (!unl.length) return; const i = unl.indexOf(myW); myW = unl[(i + d + unl.length) % unl.length]; }
function pickPerk(i) { if (!perkOpts) return; send({ t: 'perk', i }); perkOpts = null; sfx('pick'); }
let btns = [];
function uiTap(x, y) { if (overInfo) return false; for (const b of btns) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.f(); return true; } return false; }
const magOf = w => Math.round(ZW[w].mag * (1 + (pk.mag || 0) * .3));
function relStart() { if (relT > 0 || ammo[myW] >= magOf(myW)) return; relT = ZW[myW].rel / (1 + (pk.rel || 0) * .25); sfx('rel'); }
// ===== стрельба: попадания считает клиент (что видишь — в то попадаешь), стены и машины останавливают пули =====
// Пули летят видимыми штрихами (как в Crimsonland); урон, кровь и разбитые стёкла — в момент, когда пуля долетела.
let outHits = [], outShots = [], outBooms = [], outObj = [], outGlass = [];
const HITOBJ = new Set(['car', 'truck', 'barrel', 'crate']);
function addBullet(W, from, d, end, ev) {
  const b = { from, d, end, s: 0, v: (W.bv || 2600) * (W.pel > 1 ? .85 + Math.random() * .3 : 1), bl: (W.bl || 30) * 1.5, bw: W.bw || 2.4, bc: W.bc || 0xffe066, ev, W, done: false };
  if (W.trail) { const tr = { a: from, b: from, t: 0, life: W.trail === 3 ? .9 : W.trail === 2 ? .7 : .55, c: W.trail === 3 ? 0x5aa8ff : W.trail === 2 ? 0x6a6660 : 0x8a8a8a, w: W.trail === 3 ? 6 : W.trail === 2 ? 5 : 2.6, k: W.trail === 3 ? 1 : .55, follow: b }; trails.push(tr); }
  tracers.push(b); return b;
}
function stepBullets(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) { const b = tracers[i]; b.s += b.v * dt; const ev = b.ev;
    if (ev) { // мои пули: применяем попадания по мере полёта
      while (ev.glass.length && ev.glass[0][0] <= b.s) { const o = ev.glass.shift()[1]; if (!o.broken) { o.broken = true; G3.breakGlass(o.id, objs); outGlass.push(o.id); sfx('glass', .7); } }
      while (ev.hits.length && ev.hits[0][0] <= b.s) { const [t, z, dmg, g] = ev.hits.shift(); outHits.push([z.id, dmg, g]); const zz = zst.get(z.id); ZFX.hit(add(b.from, b.d, t), b.d, g, zz || z); if (zz) zz.kick = Math.min(1, (zz.kick || 0) + .5); sfx('hit', .5); }
    }
    if (!b.done && b.s >= b.end) { b.done = true; const e = add(b.from, b.d, b.end);
      if (ev && ev.boom) { for (const h of ev.boom.hits) outHits.push(h); for (const o of ev.boom.obj) outObj.push(o); ZFX.boom(e, b.W.boom); outBooms.push([Math.round(e[0]), Math.round(e[1])]); sfx('boom', 1); shake = Math.max(shake, 6); }
      else if (!ev || ev.wall) { G3.puff(e, 22); G3.flash(e, 24, 10); G3.hitNear(objs, e); if (ev && ev.obj) outObj.push(ev.obj); }
      if (b.W.boom && !ev) { /* чужая граната — взрыв придёт сообщением sh */ } }
    if (b.s - b.bl >= b.end) tracers.splice(i, 1);
  }
  for (let i = trails.length - 1; i >= 0; i--) { const t = trails[i]; if (t.follow) { t.b = add(t.follow.from, t.follow.d, Math.min(t.follow.s, t.follow.end)); if (t.follow.done) t.follow = null; } else { t.t += dt; if (t.t > t.life) trails.splice(i, 1); } }
}
function shoot(zl) {
  const W = ZW[myW], wlv = wl[myW] || 1, dmg = W.dmg * (1 + (pk.dmg || 0) * .15) * (1 + (wlv - 1) * .25), pierce = (W.pierce || 1) + (pk.pierce || 0);
  const a0 = Math.atan2(meAim[1], meAim[0]), from = add(meP, meAim, 12);
  for (let k = 0; k < W.pel; k++) {
    const an = a0 + (Math.random() - .5) * (W.spread + bloom), d = [Math.cos(an), Math.sin(an)];
    let end = W.range, objHit = null; const glass = [];
    for (const o of rayObjs(objs, from, d, W.range)) { // мир: стены и машины — стоп, окна — бьются, заборы и кусты — насквозь
      if (o.dead || o.nc) continue; const t = rayObj(from, d, o); if (!(t < end) || t < 0) continue;
      if (o.type === 'bw' && o.win) { if (!o.broken) glass.push([t, o]); continue; }
      if (OT[o.type] && OT[o.type].pass) continue;
      end = t; objHit = o;
    }
    const hits = [];
    for (const z of zl) { const q = sub(z.p, from), t = dot(q, d); if (t < 0 || t > end) continue; const off = Math.abs(q[0] * d[1] - q[1] * d[0]), r = ZT[z.ty].r * ZT[z.ty].sc * .7 + 3; if (off < r) hits.push([t, z]); }
    hits.sort((a, b) => a[0] - b[0]);
    const ev = { hits: [], glass: glass.filter(g => g[0] < end).sort((a, b) => a[0] - b[0]), wall: false, obj: null, boom: null };
    if (W.boom) { const h = hits[0], c = add(from, d, h ? h[0] : end); end = h ? h[0] : end; ev.glass = ev.glass.filter(g => g[0] < end);
      ev.boom = { hits: [], obj: [] };
      for (const z of zl) { const dd = dist(z.p, c); if (dd < W.boom) ev.boom.hits.push([z.id, Math.round(dmg * (1 - dd / W.boom * .6)), W.gore]); }
      for (const o of nearObjs(objs, c, W.boom)) if (HITOBJ.has(o.type) && !o.dead) ev.boom.obj.push([o.id, Math.round(dmg * .6)]);
    } else {
      let n = 0; for (const [t, z] of hits) { const fall = W.fire ? 1 - t / W.range * .5 : 1; ev.hits.push([t, z, Math.round(dmg * fall), W.gore]); n++; if (n >= pierce) { end = t; objHit = null; break; } }
      ev.glass = ev.glass.filter(g => g[0] < end);
      if (objHit && n < pierce) { ev.wall = true; if (HITOBJ.has(objHit.type)) ev.obj = [objHit.id, Math.round(dmg)]; }
    }
    if (W.fire) { ZFX.flame(from, d, end); for (const [t, z, dm, g] of ev.hits) { outHits.push([z.id, dm, g]); ZFX.hit(add(from, d, t), d, g, z); } for (const [, o] of ev.glass) { o.broken = true; G3.breakGlass(o.id, objs); outGlass.push(o.id); } }
    else addBullet(W, from, d, end, ev);
    outShots.push([Math.round(an * 100), Math.round(end)]);
  }
  sfx('shot' + myW, 1); frameShots.push([myId, W.fire ? 0 : 1.2]);
  shake = Math.min(9, shake + (W.kick || .5));
  bloom = Math.min(.25, bloom + (W.pel > 1 ? .04 : .025));
}
// ===== бонусы =====
const skinOf = {};
function addLoot(id, x, y, k, now) { loot.set(id, { id, k: 7, x: k, r: 0, n: 1, p: [x, y], exp: now + 30000 }); }
function onBonus(m, now) {
  const B = ZB[m.k || 0], me = m.by === myId, who = (roster.find(r => r[0] === m.by) || [0, '?'])[1];
  if (m.k === 4) buf.frz = now + m.T * 1000;
  if (me) { if (m.k === 1) buf.rage = now + m.T * 1000; if (m.k === 2) buf.spd = now + m.T * 1000; if (m.k === 5) buf.shield = now + m.T * 1000; if (m.k === 6) { buf.ammo = now + m.T * 1000; ammo[myW] = magOf(myW); relT = 0; } }
  if (m.k === 3) shake = Math.max(shake, 10 * vol([m.x, m.y]) + 2);
  bigMsg = me || m.k === 3 || m.k === 4 ? { s: B.i + ' ' + B.n.toUpperCase() + (B.d ? ' — ' + B.d : m.k === 0 ? ' +40' : ''), t: now, c: B.c } : bigMsg;
  if (!me) msgs.push({ s: B.i + ' ' + who + ': ' + B.n, t: now, c: B.c });
  sfx('bonus', me ? 1 : .5);
}
const vol = p => Math.max(0, 1 - dist(meP, p) / 900);
// ===== звук =====
let A = null, noiseB = null;
function audioInit() { if (A) return; try { A = new (window.AudioContext || window.webkitAudioContext)(); const n = A.sampleRate; noiseB = A.createBuffer(1, n, n); const d = noiseB.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } catch (e) { } }
function sfx(k, v = 1) {
  if (!A || v <= .02) return; const now = A.currentTime, g = A.createGain(); g.connect(A.destination);
  const noise = (f, d, gain, type = 'lowpass') => { const s = A.createBufferSource(); s.buffer = noiseB; const fl = A.createBiquadFilter(); fl.type = type; fl.frequency.value = f; s.connect(fl); fl.connect(g); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(.001, now + d); s.start(now, Math.random() * .5); s.stop(now + d); };
  const tone = (f0, f1, d, gain, type = 'sine') => { const o = A.createOscillator(); o.type = type; o.connect(g); o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d); g.gain.setValueAtTime(gain * v, now); g.gain.exponentialRampToValueAtTime(.001, now + d); o.start(now); o.stop(now + d); };
  if (k.startsWith('shot')) { const w = ZW[+k.slice(4)] || ZW[0]; if (w.fire) noise(700, .1, .12); else noise(w.pel > 1 ? 900 : w.dmg > 60 ? 1200 : w.rate > 10 ? 2600 : 1800, w.pel > 1 || w.dmg > 60 ? .3 : .12, .28); }
  else if (k === 'boom') noise(380, 1, .9);
  else if (k === 'splat') noise(500, .18, .35, 'bandpass');
  else if (k === 'crate' || k === 'smash') noise(900, .15, .3, 'bandpass');
  else if (k === 'glass') noise(3200, .2, .25, 'highpass');
  else if (k === 'hurt') tone(220, 90, .25, .3, 'square');
  else if (k === 'lvl') tone(520, 1040, .3, .25);
  else if (k === 'pick') tone(700, 1200, .12, .2);
  else if (k === 'bonus') { tone(600, 1400, .25, .22, 'triangle'); }
  else if (k === 'hit') noise(260, .07, .22, 'lowpass');
  else if (k === 'wave') tone(120, 60, .8, .4, 'sawtooth');
  else if (k === 'rel') tone(300, 500, .08, .12, 'square');
}
// ===================== игровой цикл =====================
let lastT = performance.now(), sendAcc = 0, hurtFlash = 0, lastHp = 1, fps = 60, zoom = 1;
function loop(now) {
  requestAnimationFrame(loop);
  if ($('start').classList.contains('on')) G3.preview($('skin'), mySkin);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; fps = fps * .95 + (1 / Math.max(dt, .001)) * .05;
  const S = sampled(now), cur = lastSnap, playing = inRoom && cur && cur.st >= 1 && !$('lobby').classList.contains('on');
  // мой ввод
  let mv = [0, 0], aimV = null; fireHeld = false;
  if (playing) {
    let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my++; if (keys.KeyS || keys.ArrowDown) my--; if (keys.KeyD || keys.ArrowRight) mx++; if (keys.KeyA || keys.ArrowLeft) mx--;
    const L = stickV('L'); if (len(L) > 0) { mx = L[0]; my = L[1]; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; } if (l > 0) mv = scr2map([mx, my]);
    const Rv = stickV('R');
    if (len(Rv) > .15) { aimV = norm(scr2map(Rv)); fireHeld = len(Rv) > .5; }
    else if (!touchUI && mouse.has) { const g = G3.screenToGround(mouse.x, mouse.y, 24); if (g && dist(g, meP) > 3) aimV = norm(sub(g, meP)); fireHeld = mouse.down || !!keys.Space; }
    else if (len(mv) > 0) aimV = norm(mv);
    if (aimV) meAim = aimV;
    if (meSt !== 2) { const sp = SPEED * (1 + (pk.spd || 0) * .08) * (meSt === 1 ? .35 : 1) * (now < buf.spd ? 1.35 : 1); meP = collide(objs, add(meP, mv, sp * dt)); }
  }
  // зомби: интерполяция + анимация
  const zl = [];
  if (S && S.b.st === 1) {
    for (const [id, zb] of S.b.z) { const za = S.a.z.get(id) || zb, p = lerp(za.p, zb.p, S.k);
      let z = zst.get(id); if (!z) { z = Object.assign({ id, p, lp: p, walk: Math.random() * 6, yaw: Math.atan2(meP[0] - p[0], meP[1] - p[1]), flash: 0 }, ZFX.look(id, zb.ty)); zst.set(id, z); }
      const d = dist(p, z.lp); z.walk += d * .12 / ZT[zb.ty].sc; if (d > .2) { const ty = Math.atan2(p[0] - z.lp[0], p[1] - z.lp[1]); let dy = ty - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * .2; }
      z.lp = p; z.p = p; z.ty = zb.ty; z.lost = zb.lost; z.fl = zb.fl; z.hp = zb.hp; z.flash = Math.max(0, z.flash - dt * 6); z.kick = Math.max(0, (z.kick || 0) - dt * 7);
      if (zb.hp < .5 && Math.random() < dt * 2) ZFX.decal(p, 5 + Math.random() * 5, 'drop', 0x6e0000, .8); // раненый оставляет кровавый след
      if (zb.lost & 4 && Math.random() < dt * 8) ZFX.decal(p, 9, 'drop', 0x5e0000, .5);
      if (zb.fl & 2 && Math.random() < dt * 10) ZFX.flame(p, [0, 0], 1);
      zl.push(z); }
    for (const id of zst.keys()) if (!S.b.z.has(id)) zst.delete(id);
  }
  // стрельба
  const W = ZW[myW]; bloom = Math.max(0, bloom - dt * .35);
  if (relT > 0) { relT -= dt; if (relT <= 0) ammo[myW] = magOf(myW); }
  fireT = Math.max(-.05, fireT - dt);
  if (playing && fireHeld && meSt === 0 && cur.st === 1 && relT <= 0) { const rate = W.rate * (1 + (pk.rate || 0) * .12) * (now < buf.rage ? 2 : 1); while (fireT <= 0 && ammo[myW] > 0) { fireT += 1 / rate; if (now >= buf.ammo) ammo[myW]--; shoot(zl); } if (ammo[myW] <= 0) relStart(); }
  stepBullets(dt);
  // отправка 20 раз в секунду
  sendAcc += dt;
  if (playing && sendAcc >= DT) { sendAcc = 0; const m = { t: 'in', p: [Math.round(meP[0] * 10) / 10, Math.round(meP[1] * 10) / 10], a: [Math.round(meAim[0] * 100) / 100, Math.round(meAim[1] * 100) / 100], w: myW, f: fireHeld && meSt === 0 ? 1 : 0 };
    if (outHits.length) m.h = outHits.splice(0); if (outShots.length) m.s = outShots.splice(0); if (outBooms.length) m.b = outBooms.splice(0); if (outObj.length) m.o = outObj.splice(0); if (outGlass.length) m.g = outGlass.splice(0); send(m); }
  // игроки → персонажи render3d
  const list = [], plist = [];
  if (S) for (const pb of S.b.pl) {
    let p, aim, moving, fire;
    if (pb.id === myId) { p = meP; aim = meAim; moving = len(mv) > 0; fire = fireHeld && meSt === 0 && relT <= 0 && ammo[myW] > 0; }
    else { const pa = S.a.pl.find(q => q.id === pb.id) || pb; p = lerp(pa.p, pb.p, S.k); aim = [Math.cos(pb.a), Math.sin(pb.a)]; moving = dist(pa.p, pb.p) > .5; fire = !!pb.fire; }
    const w = pb.id === myId ? myW : pb.w, wa = walks[pb.id] || (walks[pb.id] = { lp: p, walk: 0, deadT: 0 }); wa.walk += dist(p, wa.lp) * .16; wa.lp = p;
    wa.deadT = pb.st === 1 ? wa.deadT + dt : 0;
    plist.push({ id: pb.id, p, st: pb.st, hp: pb.hp, down: pb.down });
    if (pb.st === 2) continue;
    list.push({ id: pb.id, ch: skinOf[pb.id] ?? PCH[pb.id], p, aim, wb: pb.st === 1 ? 0 : ZW[w].m | (Math.min(3, (pb.id === myId ? wl[w] : 1) - 1) << 4), walk: wa.walk, moving, fire, down: pb.st === 1, deadT: wa.deadT, hp: Math.round(pb.hp * 100), fall: pb.st === 1 ? [-aim[0], -aim[1]] : null });
    if (playing && pb.st === 0) ZFX.footsteps(pb.id, p, moving, dt);
  }
  const meS = cur && cur.pl.find(q => q.id === myId); if (meS) { if (meS.hp < lastHp - .01 && meS.st === 0) { hurtFlash = 1; sfx('hurt'); } lastHp = meS.hp; }
  hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
    shake = Math.max(0, shake - dt * (8 + shake * 2)); if (Math.random() < .6) shakeV = [(Math.random() - .5) * 2, (Math.random() - .5) * 2];
  const camP = playing || inRoom ? add(meP, shakeV, shake) : [ZSPAWN[0] + Math.sin(now / 9000) * 300, ZSPAWN[1] + Math.cos(now / 9000) * 300];
  G3.frame({ now, dt, objs, zone: NOZONE, plan: null, matchT: 0, phase: 0, loot, list, tracers, trails, shots: frameShots, shipS: [0, 0], shipD: [1, 0], camP, inB: playing ? bldAt(objs.blds, meP) : -1, me: playing && meSt !== 2 ? meP : null, zoom, extra: (d, n) => ZFX.update(d, n, zl) });
  frameShots = [];
  hud(now, dt, cur, meS, plist, zl);
}
// ===================== HUD =====================
function txt(s, x, y, size, col, align = 'center', weight = 800) { ctx.font = weight + ' ' + size + 'px system-ui,sans-serif'; ctx.textAlign = align; ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function hud(now, dt, cur, meS, plist, zl) {
  const dpr = Math.min(2, devicePixelRatio), W_ = innerWidth, H_ = innerHeight;
  if (cv.width !== Math.round(W_ * dpr) || cv.height !== Math.round(H_ * dpr)) { cv.width = Math.round(W_ * dpr); cv.height = Math.round(H_ * dpr); G3.resize(W_, H_); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W_, H_); btns = [];
  const pl_ = inRoom && cur && cur.st !== 0 && !$('lobby').classList.contains('on'); cv.style.cursor = pl_ && !touchUI ? 'none' : '';
  updateWeaponStrip(!!(pl_ && meS && meS.st < 2 && !overInfo && unl.length > 1));
  if (!pl_) return;
  if (hurtFlash > 0) { const g = ctx.createRadialGradient(W_ / 2, H_ / 2, Math.min(W_, H_) * .3, W_ / 2, H_ / 2, Math.max(W_, H_) * .7); g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(160,0,0,' + hurtFlash * .6 + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, W_, H_); }
  // пепел и дымка заката (рисуется поверх мира, дёшево — 2D)
  { const hz = ctx.createLinearGradient(0, 0, W_ * .3, H_); hz.addColorStop(0, 'rgba(255,120,40,.1)'); hz.addColorStop(.5, 'rgba(255,120,40,0)'); hz.addColorStop(1, 'rgba(40,10,0,.12)'); ctx.fillStyle = hz; ctx.fillRect(0, 0, W_, H_);
    if (!ash.length) for (let i = 0; i < 46; i++) ash.push({ x: Math.random() * W_, y: Math.random() * H_, v: 12 + Math.random() * 22, s: 1 + Math.random() * 2.2, ph: Math.random() * 6, e: Math.random() < .12 });
    for (const f of ash) { f.y += f.v * dt; f.x += (Math.sin(now / 900 + f.ph) * 10 - 8) * dt; if (f.y > H_ + 5) { f.y = -5; f.x = Math.random() * W_ * 1.2; } if (f.x < -5) f.x = W_ + 5;
      ctx.fillStyle = f.e ? 'rgba(255,150,60,' + (.5 + .4 * Math.sin(now / 120 + f.ph)) + ')' : 'rgba(200,190,180,.55)'; ctx.fillRect(f.x, f.y, f.s, f.s); } }
  if (now < buf.frz) { ctx.fillStyle = 'rgba(120,190,255,' + (.08 + .04 * Math.sin(now / 200)) + ')'; ctx.fillRect(0, 0, W_, H_); }
  // лазерный прицел и перекрестие (как в Crimsonland)
  if (meS && meS.st === 0) { const W = ZW[myW], [px, py] = G3.project(meP, 24);
    { // прицельная линия: редкие точки с отступом от игрока, гаснут к концу; на конце — маленький кружок
      const L = Math.min(W.range, 380), n = 14; for (let k = 2; k <= n; k++) { const q = G3.project(add(meP, meAim, L * k / n), 24), a = .75 * (1 - k / (n + 2)); ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, 7); ctx.fill(); }
      if (touchUI) { const q = G3.project(add(meP, meAim, L), 24); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.stroke(); } }
    if (!touchUI && mouse.has) { const dpx = Math.hypot(mouse.x - px, mouse.y - py), r = Math.max(7, dpx * Math.tan((W.spread + bloom) / 2) + 5); ctx.strokeStyle = relT > 0 ? '#ffd43b' : '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, 7); ctx.stroke();
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(mouse.x + a * (r + 2), mouse.y + b * (r + 2)); ctx.lineTo(mouse.x + a * (r + 8), mouse.y + b * (r + 8)); ctx.stroke(); }
      if (relT > 0) { ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r + 12, -1.57, -1.57 + 6.283 * (1 - relT / (ZW[myW].rel / (1 + (pk.rel || 0) * .25)))); ctx.stroke(); } }
    if (now < buf.shield) { ctx.strokeStyle = 'rgba(177,151,252,' + (.5 + .3 * Math.sin(now / 120)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py - 4, 30, 34, 0, 0, 7); ctx.stroke(); } }
  // последние зомби: метки, чтобы не искать их по всей карте
  if (cur.phase === 1 && cur.left > 0 && cur.left <= 5) for (const z of zl) { const sc = ZT[z.ty].sc, [x, y, vis] = G3.project(z.p, 46 * sc), bob = Math.sin(now / 160) * 4;
    ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
    if (vis && x > 10 && x < W_ - 10 && y > 40 && y < H_ - 10) { ctx.beginPath(); ctx.moveTo(x, y - 4 + bob); ctx.lineTo(x - 9, y - 18 + bob); ctx.lineTo(x + 9, y - 18 + bob); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else { const cx = W_ / 2, cy = H_ / 2 + 15, dx = x - cx, dy = y - cy, k = Math.min((W_ / 2 - 30) / Math.max(1, Math.abs(dx)), (H_ / 2 - 70) / Math.max(1, Math.abs(dy))), ex = cx + dx * k, ey = cy + dy * k, a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); const pu = 1 + .15 * Math.sin(now / 150); ctx.scale(pu, pu); ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      txt(Math.round(dist(z.p, meP) * .036) + ' м', ex - Math.cos(a) * 26, ey - Math.sin(a) * 26 + 5, 12, '#ffb3b3'); } }
  const s = cur.phase === 1 ? 'ВОЛНА ' + cur.wave + '  ·  🧟 ' + cur.left + (cur.left <= 5 ? ' — ищи по красным стрелкам' : '') : cur.wave ? 'Перерыв · следующая волна через ' + Math.ceil(cur.timer) + ' с' : 'Приготовьтесь… ' + Math.ceil(cur.timer);
  txt(s, W_ / 2, 30, 18, '#fff');
  if (bigMsg && now - bigMsg.t < 2600) { ctx.globalAlpha = Math.min(1, (2600 - (now - bigMsg.t)) / 500); txt(bigMsg.s, W_ / 2, H_ * .3, Math.min(54, W_ / 12), bigMsg.c || '#ff4b4b', 'center', 900); ctx.globalAlpha = 1; }
  msgs = msgs.filter(m => now - m.t < 5000); msgs.filter(m => m.t <= now).slice(-5).forEach((m, i) => txt(m.s, W_ / 2, 56 + i * 22, 15, m.c || '#ffe3e3'));
  // другие игроки: имя, здоровье, SOS
  for (const p of plist) { if (p.id === myId) continue; const [x, y, vis] = G3.project(p.p, 62); const nm = (roster.find(r => r[0] === p.id) || [0, '?'])[1];
    if (vis) { txt(nm, x, y - 8, 12, PCSS[p.id]); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 16, y - 4, 32, 4); ctx.fillStyle = '#51cf66'; ctx.fillRect(x - 16, y - 4, 32 * p.hp, 4); if (p.st === 1) txt('🆘 ' + p.down, x, y - 22, 15, '#ff6b6b'); }
    else { const cx = Math.max(24, Math.min(W_ - 24, x)), cy = Math.max(60, Math.min(H_ - 24, y)); ctx.fillStyle = PCSS[p.id]; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.fill(); if (p.st === 1) txt('🆘', cx, cy - 14, 14, '#fff'); } }
  if (meS) {
    const bw = Math.min(220, W_ * .35), x0 = 14, y0 = H_ - 46;
    { let bx = x0; for (const [k, bi] of [['rage', 1], ['spd', 2], ['ammo', 6], ['shield', 5], ['frz', 4]]) { const left = (buf[k] - now) / 1000; if (left <= 0) continue; const B = ZB[bi]; ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(bx, y0 - 30, 52, 24, 8); ctx.fill(); ctx.strokeStyle = B.c; ctx.lineWidth = 2; ctx.stroke(); txt(B.i + ' ' + Math.ceil(left), bx + 26, y0 - 13, 13, '#fff'); bx += 58; } }
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(x0, y0, bw, 16, 6); ctx.fill(); ctx.fillStyle = '#e03131'; rr(x0, y0, Math.max(6, bw * meS.hp), 16, 6); ctx.fill(); txt('❤ ' + Math.ceil(meS.hp * maxHp), x0 + 8, y0 + 13, 12, '#fff', 'left');
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0, y0 + 20, bw, 6); ctx.fillStyle = '#ffd43b'; ctx.fillRect(x0, y0 + 20, bw * meS.xp, 6); txt('ур. ' + meS.lvl, x0 + bw + 8, y0 + 27, 13, '#ffd43b', 'left');
    const W = ZW[myW], wx = W_ - 14, wy = H_ - 20;
    txt(W.n + ' ' + '★'.repeat(Math.max(0, (wl[myW] || 1) - 1)), wx, wy - 22, 17, '#fff', 'right'); txt(relT > 0 ? 'перезарядка…' : now < buf.ammo ? '∞' : ammo[myW] + ' / ' + magOf(myW), wx, wy, 15, relT > 0 ? '#ffd43b' : '#ccc', 'right');
    if (meS.st === 1) txt('ТЫ УПАЛ! Ползи к напарнику — ' + meS.down + ' с', W_ / 2, H_ * .72, 22, '#ff6b6b', 'center', 900);
    if (meS.st === 2) txt('💀 Ты погиб. Вернёшься в начале следующей волны', W_ / 2, H_ * .72, 20, '#ff8787');
  }
  if (perkOpts) {
    const cw = Math.min(200, (W_ - 40) / 3), ch = 74, y = H_ - ch - (touchUI || !weaponStrip.hidden ? 126 : 70), x0 = W_ / 2 - (cw * 3 + 20) / 2;
    txt('⭐ Уровень ' + perkLv + ' — выбери улучшение' + (touchUI ? '' : ' (Z / X / C)'), W_ / 2, y - 10, 15, '#ffd43b');
    perkOpts.forEach((pi, i) => { const P = ZPERK[pi], b = { x: x0 + i * (cw + 10), y, w: cw, h: ch, f: () => pickPerk(i) }; btns.push(b); ctx.fillStyle = 'rgba(40,10,10,.88)'; rr(b.x, b.y, b.w, b.h, 12); ctx.fill(); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.stroke();
      txt(P.n, b.x + cw / 2, b.y + 28, 14, '#fff'); txt(P.d, b.x + cw / 2, b.y + 50, 11, '#e0c0c0', 'center', 600); });
  }
  if (touchUI) for (const k of ['L', 'R']) { const st = sticks[k]; if (!st) continue; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(st.o[0], st.o[1], 60, 0, 7); ctx.stroke(); const d = sub(st.p, st.o), l = Math.min(60, len(d)), q = l > 0 ? add(st.o, norm(d), l) : st.o; ctx.fillStyle = k === 'R' ? 'rgba(255,80,80,.5)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(q[0], q[1], 24, 0, 7); ctx.fill(); }
  if (touchUI && !sticks.L && !sticks.R && now - startedT < 9000) txt('левый палец — бежать, правый — целиться и стрелять', W_ / 2, H_ - 14, 13, 'rgba(255,255,255,.7)');
  const xb = { x: W_ - 44, y: 10, w: 34, h: 34, f: () => { if (confirm('Выйти из игры?')) leaveRoom(); } }; btns.push(xb); ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(xb.x, xb.y, xb.w, xb.h, 8); ctx.fill(); txt('✕', xb.x + 17, xb.y + 24, 18, '#fff');
  if (location.hash === '#perf') txt(Math.round(fps) + ' fps · 🧟 ' + zst.size, 10, 20, 12, '#0f0', 'left');
  if (overInfo) { ctx.fillStyle = 'rgba(10,0,0,.8)'; ctx.fillRect(0, 0, W_, H_); txt('ВСЕ ПАЛИ', W_ / 2, H_ * .28, 48, '#ff3b3b', 'center', 900);
    txt('Дошли до волны ' + overInfo.w + (overInfo.cyc ? ' (круг ' + (overInfo.cyc + 1) + ')' : '') + ' · убито зомби: ' + overInfo.kills, W_ / 2, H_ * .28 + 40, 18, '#fff');
    overInfo.pl.forEach(([n, k, l], i) => txt(n + ' — ' + k + ' убийств, ур. ' + l, W_ / 2, H_ * .28 + 80 + i * 24, 15, '#e0c0c0'));
    txt('🏆 рекорд: волна ' + (+(localStorage.getItem('zbest') || 0)), W_ / 2, H_ * .28 + 190, 15, '#ffd43b'); txt('Возврат в комнату…', W_ / 2, H_ * .28 + 220, 13, '#aaa'); }
}
G3.resize(innerWidth, innerHeight);
requestAnimationFrame(loop);
