// ===== LAST EXIT — зомби-кооп. Сервер: Cloudflare Worker + Durable Objects =====
// Каждая комната (до 4 игроков) — свой объект World со своим городом. Lobby — список идущих игр.
/*SHARED*/
const INDEX_HTML = __INDEX_HTML__;
const THREE_JS = __THREE__;
const ICONS = { 192: '__ICON192__', 512: '__ICON512__' };
const b64bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
      const code = cleanCode(url.searchParams.get('r')); if (code.length < 4) return new Response('bad room', { status: 400 });
      return env.WORLD.get(env.WORLD.idFromName('room-' + code)).fetch(req);
    }
    if (url.pathname === '/rooms') return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(new Request('https://lobby/list'));
    if (url.pathname === '/' || url.pathname === '/index.html')
      return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    if (url.pathname === '/manifest.webmanifest') return new Response(JSON.stringify({
      name: 'LAST EXIT', short_name: 'LAST EXIT', start_url: '/', display: 'fullscreen', orientation: 'landscape',
      background_color: '#120606', theme_color: '#120606',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
    }), { headers: { 'content-type': 'application/manifest+json' } });
    if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png')
      return new Response(b64bin(ICONS[url.pathname.includes('512') ? 512 : 192]), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' } });
    if (url.pathname === '/three.min.js') return new Response(THREE_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=604800' } });
    if (url.pathname === '/sw.js') return new Response("self.addEventListener('fetch',()=>{});", { headers: { 'content-type': 'text/javascript' } });
    return new Response('not found', { status: 404 });
  }
};

// ===== список комнат: комнаты сами сообщают о себе раз в несколько секунд =====
export class Lobby {
  constructor() { this.rooms = new Map(); }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    if (req.method === 'POST') { const m = await req.json(); if (m.gone || !m.n) this.rooms.delete(m.code); else this.rooms.set(m.code, Object.assign(m, { t: now })); return new Response('ok'); }
    const l = [...this.rooms.values()].filter(r => now - r.t < 15000).map(r => ({ c: r.code, n: r.n, w: r.w, st: r.st, names: r.names }));
    for (const [k, r] of this.rooms) if (now - r.t > 60000) this.rooms.delete(k);
    return new Response(JSON.stringify(l), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}

const near = (ds, q) => ds.reduce((m, d) => dist(d.o, q) < dist(m.o, q) ? d : m);
const toLocal = (b, p) => { const r = sub(p, b.p); return [dot(r, b.u), dot(r, b.v)]; };
const toWorld = (b, l) => add(add(b.p, b.u, l[0]), b.v, l[1]);
function roomAt(b, l) { let best = 0, bd = 1e9; b.rooms.forEach((r, i) => { const dx = Math.max(r.x0 - l[0], 0, l[0] - r.x1), dy = Math.max(r.y0 - l[1], 0, l[1] - r.y1), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } }); return best; }
const SMASH = new Set(['bw', 'fence', 'ifence', 'furn', 'shed', 'car', 'truck', 'bus', 'crate', 'barrel', 'tent', 'grave', 'sandbag', 'jersey']);

// ===== комната =====
export class World {
  constructor(state, env) {
    this.state = state; this.env = env; this.code = null;
    this.clients = new Set(); this.players = []; this.timer = null; this.tick = 0; this.t = 0;
    this.rnd = mkRng((Date.now() % 100000) + 7);
    this.objs = genWorld();
    for (const o of this.objs) { const h = zObjHp(o); if (h) o.hp = o.hp || h; }
    for (const b of this.objs.blds) b.wins = b.walls.map(i => this.objs[i]).filter(o => o.win);
    this.st = 'wait'; this.phase = 0; this.wave = 0; this.cyc = 0; this.toSpawn = 0; this.spAcc = 0; this.spRate = 1; this.timerT = 0; this.kills = 0;
    // место старта — на улице у рынка
    this.spawnC = ZSPAWN; for (let r = 0, done = false; r < 600 && !done; r += 20) for (let k = 0; k < 16 && !done; k++) { const q = add(ZSPAWN, [Math.cos(k / 16 * 6.283) * r, Math.sin(k / 16 * 6.283) * r]); if (bldAt(this.objs.blds, q) < 0 && nearObjs(this.objs, q, 60).every(o => o.nc || !objPush(o, q, 50))) { this.spawnC = q; done = true; } }
    this.frzT = 0; this.zs = new Map(); this.zid = 1; this.items = new Map(); this.iid = 1; this.shots = []; this.later = []; this.repT = 0;
  }
  async fetch(req) {
    const url = new URL(req.url); this.code = this.code || cleanCode(url.searchParams.get('r'));
    const { 0: cli, 1: ws } = new WebSocketPair(); ws.accept();
    const c = { ws, name: String(url.searchParams.get('n') || 'Игрок').slice(0, 12) || 'Игрок', skin: Math.max(0, Math.min(9, parseInt(url.searchParams.get('k')) || 0)), p: null };
    if (this.players.length >= ZMAXP) { this.send(c, { t: 'err', s: 'Комната заполнена' }); ws.close(1013, 'full'); return new Response(null, { status: 101, webSocket: cli }); }
    this.clients.add(c);
    ws.addEventListener('message', e => { try { this.onMsg(c, e.data); } catch (err) { } });
    const bye = () => { if (!this.clients.has(c)) return; this.clients.delete(c); this.leave(c); };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.join(c);
    if (!this.timer) this.timer = setInterval(() => this.loop(), 1000 / TICK);
    return new Response(null, { status: 101, webSocket: cli });
  }
  send(c, m) { try { c.ws.send(typeof m === 'string' || m instanceof ArrayBuffer ? m : JSON.stringify(m)); } catch (e) { } }
  sendAll(m, except) { const s = typeof m === 'string' ? m : JSON.stringify(m); for (const p of this.players) if (p.c !== except) this.send(p.c, s); }
  msg(s, c) { this.sendAll({ t: 'msg', s, c }); }
  report(gone) {
    if (!this.env || !this.env.LOBBY || !this.code) return;
    const body = JSON.stringify(gone ? { code: this.code, gone: 1 } : { code: this.code, n: this.players.length, w: this.wave, st: this.st, names: this.players.map(p => p.name) });
    try { this.state.waitUntil(this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).fetch('https://lobby/up', { method: 'POST', body })); } catch (e) { }
  }
  // ===== вход и выход =====
  spawnAt(i) { const a = i * 1.57 + .8; return collide(this.objs, add(this.spawnC, [Math.cos(a) * 30, Math.sin(a) * 30])); }
  join(c) {
    let id = 0; while (this.players.some(p => p.id === id)) id++;
    const p = { c, id, name: c.name, skin: c.skin, p: this.spawnAt(id), rageT: 0, spdT: 0, ammoT: 0, aim: [1, 0], hp: 100, maxHp: 100, st: 0, downT: 0, revT: 0, inv: this.t + 3, w: 0, fire: 0, lvl: 1, xp: 0, pend: 0, opts: null, pk: {}, wl: ZW.map(() => 1), kills: 0, regA: 0, lastT: 0, bi: -1 };
    c.p = p; this.players.push(p); this.players.sort((a, b) => a.id - b.id);
    if (this.st === 'play') { // вход посреди боя: рядом с командой, уровень почти как у команды, всё открытое оружие
      const mates = this.players.filter(q => q !== p && q.st === 0), m = mates[Math.floor(this.rnd() * mates.length)];
      if (m) p.p = collide(this.objs, add(m.p, [(this.rnd() - .5) * 50, (this.rnd() - .5) * 50]));
      const others = this.players.filter(q => q !== p), avg = others.reduce((s, q) => s + q.lvl, 0) / Math.max(1, others.length);
      p.lvl = Math.max(1, Math.round(avg) - 1); p.pend = p.lvl - 1; p.w = zUnlocked(this.wave).slice(-1)[0] || 0;
      if (this.phase === 1) this.toSpawn += Math.round(zWaveCount(this.wave, 1, this.cyc) * .5);
    }
    this.send(c, { t: 'room', sp: p.p, code: this.code, you: p.id, st: this.st, wave: this.wave, unl: zUnlocked(Math.max(1, this.wave)),
      dead: this.objs.filter(o => o.dead).map(o => o.id), gl: this.objs.filter(o => o.broken).map(o => o.id), ob: this.objs.filter(o => o.smoke || o.burnt).map(o => [o.id, o.burnt ? 2 : 1]),
      it: [...this.items.values()].map(it => [it.id, Math.round(it.p[0]), Math.round(it.p[1]), it.k]), frz: Math.max(0, this.frzT - this.t) });
    this.roster(); if (p.pend > 0) this.offerPerk(p);
    this.msg('👋 ' + p.name + ' в игре'); this.report();
  }
  leave(c) {
    this.players = this.players.filter(p => p.c !== c);
    if (!this.players.length) { this.report(true); this.st = 'wait'; this.zs.clear(); this.wave = 0; return; }
    this.roster(); this.msg('🚪 ' + c.name + ' вышел'); this.report();
  }
  roster() { this.sendAll({ t: 'ros', pl: this.players.map(p => [p.id, p.name, p.skin]), st: this.st }); }
  onMsg(c, data) {
    if (typeof data !== 'string') return; let m; try { m = JSON.parse(data); } catch (e) { return; }
    const p = c.p; if (!p) return;
    if (m.t === 'start') { if (this.st === 'wait') this.startGame(); return; }
    if (m.t === 'perk') { this.pickPerk(p, m.i | 0); return; }
    if (m.t === 'in') this.input(p, m);
  }
  startGame() {
    this.st = 'play'; this.phase = 0; this.wave = 0; this.cyc = 0; this.kills = 0; this.frzT = 0; this.zs.clear(); this.items.clear(); this.timerT = this.t + 4;
    this.players.forEach((p, i) => { Object.assign(p, { p: this.spawnAt(p.id), hp: 100, maxHp: 100, st: 0, downT: 0, revT: 0, inv: this.t + 3, w: 0, lvl: 1, xp: 0, pend: 0, opts: null, pk: {}, wl: ZW.map(() => 1), kills: 0, rageT: 0, spdT: 0, ammoT: 0 }); this.send(p.c, { t: 'pk', pk: p.pk, wl: p.wl, maxHp: p.maxHp }); this.send(p.c, { t: 'start', sp: p.p }); }); this.roster(); this.report();
  }
  // ===== волны =====
  startWave() {
    this.wave++;
    if (this.wave > ZWAVES) { this.wave = 1; this.cyc++; this.sendAll({ t: 'msg', s: '🔁 Круг ' + (this.cyc + 1) + '! Налётчики сильнее, оружие остаётся' }); }
    const n = this.players.length; this.phase = 1;
    this.waveSpawned = 0; this.toSpawn = zWaveCount(this.wave, n, this.cyc); this.spRate = this.toSpawn / (14 + this.wave * .7); this.spAcc = 0;
    if (this.wave % 5 === 0) this.spawnZ(5);
    for (const p of this.players) if (p.st === 2) { p.st = 0; p.hp = p.maxHp; const m = this.players.find(q => q.st === 0 && q !== p); p.p = m ? collide(this.objs, add(m.p, [20, 20])) : this.spawnAt(p.id); p.inv = this.t + 3; this.send(p.c, { t: 'sp', sp: p.p }); this.msg('✨ ' + p.name + ' вернулся'); }
    const nw = ZW.map((w, i) => w.wave === this.wave && this.cyc === 0 ? i : -1).filter(i => i >= 0);
    const tips = { 5: '⚠ Бегуны теперь перепрыгивают заборы', 1: 'Знаменосец с кругом усиливает союзников — цельтесь в него', 12: '⚠ Через заборы лезут уже все' };
    this.sendAll({ t: 'wave', w: this.wave, n: this.toSpawn, cyc: this.cyc, boss: this.wave % 5 === 0 ? 1 : 0, unl: zUnlocked(this.wave), nw, tip: this.cyc === 0 ? tips[this.wave] : null });
    this.report();
  }
  // место появления: на улице, в 650–950 от команды, не на виду
  spawnPoint() {
    const al = this.players.filter(p => p.st < 2); const c = al.length ? [al.reduce((s, p) => s + p.p[0], 0) / al.length, al.reduce((s, p) => s + p.p[1], 0) / al.length] : ZSPAWN;
    for (let k = 0; k < 20; k++) {
      const a = this.rnd() * 6.283, d = 650 + this.rnd() * 300, q = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
      if (!inMap(q, 80) || bldAt(this.objs.blds, q) >= 0) continue;
      const cq = collide(this.objs, q); if (dist(cq, q) > 3) continue;
      if (al.some(p => dist(p.p, q) < 550)) continue;
      return q;
    }
    return null;
  }
  spawnZ(type) {
    const p = this.spawnPoint(); if (!p) return null;
    const T = ZT[type], hm = zHpMul(this.wave, this.players.length, this.cyc) * (type === 5 ? this.players.length * .6 + .4 : 1);
    const hp = raiderHealth(type, this.wave) * hm;
    const z = { id: this.zid, ty: type, p, hp, mhp: hp, sp: T.sp * (.85 + this.rnd() * .3) * (1 + this.cyc * .12), r: T.r, ab: zAbil(type, this.wave), atkT: 0, lost: 0, burn: 0, burnBy: null, tg: null, atk: 0, air: 0, smT: 0, stuck: 0, side: this.rnd() < .5 ? 1 : -1, bi: -1, navB: -1, navR: -1 };
    this.zid = this.zid % 65000 + 1; this.zs.set(z.id, z); return z;
  }
  // ===== ввод игрока: позиция (доверяем, но ограничиваем скорость), оружие, попадания =====
  damageRaider(z, damage) {
    if (z.ty !== RAIDER_SUPPORT) {
      for (const ally of this.zs.values()) {
        if (ally.ty !== RAIDER_SUPPORT || ally.hp <= 0 || dist(z.p, ally.p) > SUPPORT_RADIUS) continue;
        damage /= SUPPORT_HEALTH;
        break;
      }
    }
    z.hp -= damage;
  }
  input(p, m) {
    const now = this.t, el = Math.min(.5, now - (p.lastT || now)) || DT; p.lastT = now;
    if (Array.isArray(m.p) && p.st !== 2) {
      const q = collide(this.objs, [+m.p[0] || 0, +m.p[1] || 0]), d = dist(q, p.p), lim = SPEED * 1.7 * (p.st === 1 ? .4 : 1) * (1 + (p.pk.spd || 0) * .08) * (now < p.spdT + .5 ? 1.4 : 1) * el + 14;
      p.p = d <= lim ? q : add(p.p, norm(sub(q, p.p)), lim); p.bi = bldAt(this.objs.blds, p.p);
    }
    if (Array.isArray(m.a)) p.aim = norm([+m.a[0] || 1, +m.a[1] || 0]);
    if (m.w !== undefined && zUnlocked(Math.max(1, this.wave)).includes(m.w | 0)) p.w = m.w | 0;
    p.fire = m.f ? 1 : 0;
    if (this.st !== 'play' || p.st !== 0) return;
    const W = ZW[p.w], maxD = W.dmg * 6 * (W.boom ? 1.5 : 1);
    if (Array.isArray(m.h)) for (const h of m.h.slice(0, 80)) {
      const z = this.zs.get(h[0] | 0); if (!z) continue;
      const dmg = Math.min(maxD, Math.max(0, +h[1] || 0)); if (dist(z.p, p.p) > W.range + (W.boom || 0) + 120) continue;
      this.damageRaider(z, dmg); z.lastDir = norm(sub(z.p, p.p));
      if (W.kb && !ZT[z.ty].boss) { const sc = ZT[z.ty].sc, k = W.kb * Math.min(1.5, dmg / W.dmg) / (sc * sc); z.kbv = add(z.kbv || [0, 0], z.lastDir, k); if (len(z.kbv) > 45) z.kbv = mul(norm(z.kbv), 45); z.stag = Math.min(.35, (z.stag || 0) + .08 + k * .01); } // отбрасывание и запинка, как в Crimsonland
      if (W.fire) { z.burn = 3; z.burnBy = p; }
      const g = W.gore;
      if (g >= 2 && dmg > z.mhp * .12 && this.rnd() < .1 * g) z.lost |= 1 << Math.floor(this.rnd() * (g >= 3 ? 3 : 2));
      if (z.hp <= 0) this.killZ(z, p, g + (dmg > z.mhp * .8 ? 1 : 0));
    }
    if (Array.isArray(m.o)) for (const [oid, dmg] of m.o.slice(0, 10)) { const o = this.objs[oid | 0]; if (!o || o.dead || !(o.hp > 0) || dist(o.p, p.p) > W.range + 150) continue; if (!['car', 'truck', 'bus', 'barrel', 'crate'].includes(o.type)) continue; o.hp -= Math.min(maxD, +dmg || 0); this.objHurt(o, p); }
    if (Array.isArray(m.g)) for (const oid of m.g.slice(0, 10)) { const o = this.objs[oid | 0]; if (o && o.win && !o.broken) { o.broken = 1; this.sendAll({ t: 'gl', id: o.id }, p.c); } }
    if (Array.isArray(m.s) && m.s.length) this.shots.push([p.id, p.w, m.s.slice(0, 30)]);
    if (Array.isArray(m.b)) for (const b of m.b.slice(0, 4)) { this.shots.push([p.id, -1, [[+b[0] | 0, +b[1] | 0]]]); }
  }
  killZ(z, by, gore) {
    if (!this.zs.has(z.id)) return; this.zs.delete(z.id); this.kills++;
    const T = ZT[z.ty];
    this.sendAll({ t: 'k', z: z.id, x: Math.round(z.p[0]), y: Math.round(z.p[1]), d: (z.lastDir || [1, 0]).map(v => Math.round(v * 100) / 100), g: Math.min(6, gore | 0), ty: z.ty, lost: z.lost, by: by ? by.id : -1 });
    if (by) { by.kills++; this.giveXp(by, T.xp); if (by.pk.vamp) by.hp = Math.min(by.maxHp, by.hp + by.pk.vamp); }
    for (const q of this.players) if (q !== by && q.st === 0) this.giveXp(q, T.xp * .35);
    if (this.rnd() < (z.ty >= 2 ? .3 : .045)) { const it = { id: this.iid++, p: [...z.p], k: zPickBonus(this.rnd), T: this.t + 30 }; this.items.set(it.id, it); this.sendAll({ t: 'it', id: it.id, x: Math.round(it.p[0]), y: Math.round(it.p[1]), k: it.k }); }
  }
  giveXp(p, x) { p.xp += x; while (p.xp >= zXpNeed(p.lvl)) { p.xp -= zXpNeed(p.lvl); p.lvl++; p.pend++; } if (p.pend > 0 && !p.opts) this.offerPerk(p); }
  offerPerk(p) { const a = ZPERK.map((_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } p.opts = a.slice(0, 3); this.send(p.c, { t: 'lvl', lv: p.lvl, o: p.opts }); }
  pickPerk(p, i) {
    if (!p.opts || i < 0 || i > 2) return; const k = ZPERK[p.opts[i]].k;
    p.pk[k] = (p.pk[k] || 0) + 1; if (k === 'hp') { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } if (k === 'wlvl') p.wl[p.w]++;
    p.opts = null; p.pend--; this.send(p.c, { t: 'pk', pk: p.pk, wl: p.wl, maxHp: p.maxHp }); if (p.pend > 0) this.offerPerk(p);
  }
  // ===== предметы мира: машины, бочки, ящики, стены =====
  objHurt(o, by) {
    if (o.type === 'crate') { if (o.hp <= 0 && !o.dead) { o.dead = true; o.fixT = this.t + 150; this.sendAll({ t: 'cr', id: o.id }); } return; }
    if (o.type === 'car' || o.type === 'truck' || o.type === 'bus') {
      if (o.hp < OT[o.type].hp * .5 && !o.smoke && !o.burnt) { o.smoke = 1; this.sendAll({ t: 'ob', id: o.id, s: 1 }); }
      if (o.hp <= 0 && !o.burnt) { o.burnt = 1; o.fixT = this.t + 180; this.sendAll({ t: 'ob', id: o.id, s: 2 }); this.explode(o.p, by, 130, 160); }
      return; }
    if (o.type === 'barrel') { if (o.hp <= 0 && !o.dead) { o.dead = true; o.fixT = this.t + 120; this.sendAll({ t: 'cr', id: o.id, boom: 1 }); this.explode(o.p, by, 110, 140); } return; }
    if (o.hp <= 0 && !o.dead) { o.dead = true; this.sendAll({ t: 'wb', id: o.id }); } // громила проломил стену / окно / забор
  }
  explode(c, by, R, dmg) {
    this.sendAll({ t: 'boom', p: [Math.round(c[0]), Math.round(c[1])], r: R });
    for (const z of this.zs.values()) { const d = dist(z.p, c); if (d < R + z.r) { const k = 1 - Math.min(1, d / R); this.damageRaider(z, dmg * (.3 + k * k)); z.lastDir = norm(sub(z.p, c)); if (z.hp <= 0) this.killZ(z, by, 5); } }
    for (const o of nearObjs(this.objs, c, R)) { if (o.dead || !(o.hp > 0) || dist(o.p, c) > R * .8) continue; if (o.type === 'barrel' || o.type === 'crate') { o.hp = 0; this.later.push([this.t + .15 + this.rnd() * .2, o, by]); } else if ((o.type === 'car' || o.type === 'truck' || o.type === 'bus') && !o.burnt) { o.hp -= dmg * .8; this.later.push([this.t + .3, o, by]); } }
  }
  hurt(p, dmg) {
    if (p.st === 0) { p.hp -= dmg; if (p.hp <= 0) { p.hp = 0; p.st = 1; p.downT = ZDOWN; p.revT = 0; this.msg('🆘 ' + p.name + ' упал! Ползи к напарнику', '#ff6b6b'); } }
    else if (p.st === 1) p.downT -= dmg * .12;
  }
  // бонус подобран: аптечка, ярость, скорость, ядерка, заморозка, щит, бесконечные патроны
  bonus(p, it) {
    const B = ZB[it.k], t = this.t; let T = B.T || 0;
    if (it.k === 0) p.hp = Math.min(p.maxHp, p.hp + 40);
    else if (it.k === 1) p.rageT = t + T;
    else if (it.k === 2) p.spdT = t + T;
    else if (it.k === 3) this.explode(p.p, p, 330, 900);
    else if (it.k === 4) { this.frzT = t + T; }
    else if (it.k === 5) p.inv = Math.max(p.inv, t + T);
    else if (it.k === 6) p.ammoT = t + T;
    this.sendAll({ t: 'itx', id: it.id, by: p.id, k: it.k, T, x: Math.round(it.p[0]), y: Math.round(it.p[1]) });
  }
  gameOver() {
    this.st = 'over'; this.phase = 0;
    this.sendAll({ t: 'over', w: this.wave, cyc: this.cyc, kills: this.kills, pl: this.players.map(p => [p.name, p.kills, p.lvl]) });
    this.zs.clear(); this.items.clear(); this.overT = this.t + 9; this.report();
  }
  // ===== движение зомби по городу =====
  around(a, t) {
    const B = this.objs.blds, d = dist(a, t), n = Math.min(10, Math.ceil(Math.min(d, 320) / 32)); let hit = -1;
    for (let i = 1; i <= n; i++) { const q = lerp(a, t, Math.min(1, i * 32 / d)); hit = bldAt(B, q); if (hit >= 0) break; }
    if (hit < 0) return t;
    const b = B[hit], X = b.w / 2 + 26, Y = b.h / 2 + 26, cs = [[X, Y], [-X, Y], [X, -Y], [-X, -Y]].map(([x, y]) => add(add(b.p, b.u, x), b.v, y));
    const clear = (p, q) => { for (let k = 1; k < 6; k++) if (bldAt(B, lerp(p, q, k / 6)) === hit) return false; return dist(p, q) > 6; };
    let best = null, bd = 1e9; for (const c of cs) { if (!clear(a, c)) continue; const v = dist(a, c) + dist(c, t); if (v < bd) { bd = v; best = c; } }
    return best || t;
  }
  // куда идти зомби z к цели t: снаружи — к двери (лазуны — и к окнам), внутри — по комнатам
  zGoal(z, t, tb) {
    const B = this.objs.blds, bb = z.bi;
    if (bb < 0) {
      if (tb < 0) return this.around(z.p, t);
      if (!z.entry || z.entry.b !== tb || (!z.entry.go && this.tick % 20 === z.id % 20)) { // выбор входа: двери, а лазунам и громилам — ещё и окна
        const Bt = B[tb], c = [];
        for (const d of Bt.doors) c.push({ o: d.o, i: d.i });
        if (z.ab & 6) for (const w of Bt.wins) { if (w.dead && !(z.ab & 4)) continue; const n = w.w < w.h ? w.u : w.v, s = dot(sub(w.p, Bt.p), n) > 0 ? 1 : -1; c.push({ o: add(w.p, n, s * 22), i: add(w.p, n, -s * 22), win: 1 }); }
        let best = c[0], bd = 1e9; for (const e of c) { const v = dist(z.p, e.o) + dist(e.i, t) * .6; if (v < bd) { bd = v; best = e; } }
        z.entry = Object.assign({ b: tb }, best);
      }
      const e = z.entry; if (e.go || dist(z.p, e.o) < 16 || (e.win && dist(z.p, e.o) < 40)) { e.go = 1; return e.i; } return this.around(z.p, e.o); // дошёл до входа — лезет внутрь, не дёргаясь
    }
    const Bd = B[bb], lp = toLocal(Bd, z.p);
    let rb = Bd.rooms.findIndex(r => lp[0] > r.x0 && lp[0] < r.x1 && lp[1] > r.y0 && lp[1] < r.y1);
    if (rb < 0) rb = z.navB === bb && z.navR >= 0 ? z.navR : roomAt(Bd, lp); z.navB = bb; z.navR = rb;
    let goalRoom, exit = null;
    if (tb === bb) goalRoom = roomAt(Bd, toLocal(Bd, t)); else { exit = near(Bd.doors, t); goalRoom = exit.room; }
    if (rb === goalRoom) return exit ? (dist(z.p, exit.i) < 24 || dist(z.p, exit.o) < dist(exit.i, exit.o) ? exit.o : exit.i) : t;
    const prev = new Map([[rb, -1]]), Q = [rb];
    while (Q.length) { const r = Q.shift(); if (r === goalRoom) break; for (const e of Bd.adj) { const n = e.a === r ? e.b : e.b === r ? e.a : -1; if (n >= 0 && !prev.has(n)) { prev.set(n, r); Q.push(n); } } }
    if (!prev.has(goalRoom)) return t;
    let r = goalRoom; while (prev.get(r) !== rb) r = prev.get(r);
    const e = Bd.adj.find(e => (e.a === rb && e.b === r) || (e.b === rb && e.a === r)), dp = toWorld(Bd, e.p);
    if (dist(z.p, dp) < 20) { const R = Bd.rooms[r]; return toWorld(Bd, [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2]); }
    return dp;
  }
  // столкновения зомби: заборы — препятствие (бегуны позже перепрыгивают), окна — только для лазунов
  zCollide(z, p) {
    let air = false;
    for (const o of nearObjs(this.objs, p, z.r + 6)) {
      if (o.dead || o.nc) continue;
      if ((z.ab & 1) && (o.type === 'fence' || o.type === 'ifence' || o.type === 'sandbag')) { if (objPush(o, p, z.r)) air = true; continue; }
      if ((z.ab & 2) && o.type === 'bw' && o.win) { if (objPush(o, p, z.r)) air = true; continue; }
      const lim = o.rad + z.r + 2; if (Math.abs(o.p[0] - p[0]) > lim || Math.abs(o.p[1] - p[1]) > lim) continue;
      const pu = objPush(o, p, z.r); if (pu) { p = add(p, pu); z.block = o; }
    }
    if (air) z.air = .35;
    return clampMap(p);
  }
  // ===== шаг мира =====
  loop() {
    if (!this.clients.size) { clearInterval(this.timer); this.timer = null; return; }
    this.tick++; this.t += DT;
    if (this.st === 'play') this.step(DT);
    else if (this.st === 'over' && this.t > this.overT) { this.st = 'wait'; this.wave = 0; this.roster(); this.report(); }
    this.snap();
    if (this.tick % (5 * TICK) === 0) this.report();
  }
  step(dt) {
    const t = this.t;
    if (this.phase === 0 && t >= this.timerT) this.startWave();
    if (this.phase === 1) {
      if (this.toSpawn > 0) { this.spAcc += this.spRate * dt; const cap = 120 + 30 * this.players.length; while (this.spAcc >= 1 && this.toSpawn > 0 && this.zs.size < cap) { this.spAcc--; if (this.spawnZ(zPickType(this.wave, this.rnd, this.waveSpawned || 0))) { this.toSpawn--; this.waveSpawned = (this.waveSpawned || 0) + 1; } } }
      else if (!this.zs.size) { this.phase = 0; this.timerT = t + ZBREAK; this.sendAll({ t: 'clear', w: this.wave }); }
    }
    if (this.later.length) { const now_ = this.later.filter(l => l[0] <= t); this.later = this.later.filter(l => l[0] > t); for (const [, o, by] of now_) this.objHurt(o, by); }
    if (this.tick % (5 * TICK) === 0) for (const o of this.objs) { if (!o.fixT || t < o.fixT) continue; if (this.players.some(p => dist(p.p, o.p) < o.rad + PR + 4)) continue;
      o.fixT = 0; o.hp = OT[o.type].hp; if (o.dead) { o.dead = false; this.sendAll({ t: 'rv', id: o.id }); } if (o.burnt || o.smoke) { o.burnt = o.smoke = 0; this.sendAll({ t: 'ob', id: o.id, s: 0 }); } }
    if (this.tick % TICK === 0) for (const it of this.items.values()) if (t > it.T) { this.items.delete(it.id); this.sendAll({ t: 'itx', id: it.id, by: -1 }); }
    // игроки: упавший ползёт и ждёт помощи
    for (const p of this.players) {
      p.bi = bldAt(this.objs.blds, p.p);
      if (p.st === 0) { if (p.pk.regen) { p.regA += p.pk.regen * dt; if (p.regA >= 1) { p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.regA)); p.regA %= 1; } }
        for (const it of this.items.values()) if (dist(it.p, p.p) < 26) { this.items.delete(it.id); this.bonus(p, it); } }
      else if (p.st === 1) {
        p.downT -= dt;
        const helper = this.players.find(q => q !== p && q.st === 0 && dist(q.p, p.p) < PR * 2 + 26);
        if (helper) { p.revT += dt; if (p.revT >= ZREV) { p.st = 0; p.hp = Math.round(p.maxHp * .5); p.inv = t + 2; p.revT = 0; this.msg('💉 ' + helper.name + ' поднял ' + p.name, '#8ce99a'); } }
        else p.revT = Math.max(0, p.revT - dt * 2);
        if (p.st === 1 && p.downT <= 0) { p.st = 2; this.msg('💀 ' + p.name + ' погиб — вернётся в начале волны', '#ff8787'); }
      }
    }
    if (!this.players.some(p => p.st === 0)) { this.gameOver(); return; }
    // зомби
    const G = new Map(), key = (x, y) => (Math.floor(x / 48) + 100) * 1000 + Math.floor(y / 48) + 100;
    for (const z of this.zs.values()) { const k = key(z.p[0], z.p[1]); let a = G.get(k); if (!a) G.set(k, a = []); a.push(z); }
    const targets = this.players.filter(p => p.st < 2), B = this.objs.blds;
    for (const z of this.zs.values()) {
      if (z.burn > 0) { z.burn -= dt; this.damageRaider(z, 14 * dt); if (z.hp <= 0) { this.killZ(z, z.burnBy, 1); continue; } }
      z.air = Math.max(0, z.air - dt); z.block = null;
      if (z.kbv) { const m = mul(z.kbv, Math.min(1, dt * 14)); z.p = this.zCollide(z, add(z.p, m)); z.kbv = sub(z.kbv, m); if (len(z.kbv) < .5) z.kbv = null; } // отлетает от пуль
      z.stag = Math.max(0, (z.stag || 0) - dt);
      if (t < this.frzT) { z.atk = 0; z.backKickAt = 0; continue; } // заморозка: стоят как статуи
      if (!z.tg || z.tg.st === 2 || !this.players.includes(z.tg) || this.tick % 15 === z.id % 15) { let bd = 1e9; z.tg = null; for (const p of targets) { const d = dist(p.p, z.p) * (p.st === 1 ? 1.3 : 1); if (d < bd) { bd = d; z.tg = p; } } }
      const T = z.tg; z.atk = 0; if (!T) continue;
      if (this.tick % 4 === z.id % 4) z.bi = bldAt(B, z.p);
      const support = z.ty === RAIDER_SUPPORT;
      const d = dist(T.p, z.p), reach = support ? 105 : z.r + PR + 5;
      if (d > reach) {
        z.backKickAt = 0;
        const goal = d < 60 && (z.bi === T.bi) ? T.p : this.zGoal(z, T.p, T.bi);
        let dir = norm(sub(goal, z.p)); if (z.stuck > 0) { dir = norm(add(dir, perp(dir), z.side * 1.4)); z.stuck--; }
        const sp = z.sp * (z.lost & 4 ? .35 : 1) * (z.burn > 0 ? 1.2 : 1) * (z.air > 0 ? .6 : 1) * (z.stag > 0 ? .3 : 1), want = add(z.p, dir, sp * dt);
        const np = this.zCollide(z, want);
        if (dist(np, z.p) < sp * dt * .25) {
          if ((z.ab & 4) && z.block && SMASH.has(z.block.type) && z.block.hp > 0) { z.smT -= dt; if (z.smT <= 0) { z.smT = .7; z.atk = 1; z.block.hp -= 70 * ZT[z.ty].sc; this.sendAll({ t: 'smh', id: z.block.id, x: Math.round(z.p[0]), y: Math.round(z.p[1]) }); this.objHurt(z.block, null); } }
          else { z.stuck = 10; if (this.rnd() < .3) z.side *= -1; z.stT = (z.stT || 0) + dt * 10; }
        }
        z.p = np; if (z.entry && z.entry.go && z.bi >= 0) z.entry = null;
        z.stT = Math.max(0, (z.stT || 0) - dt * .5);
        if (this.tick % 100 === z.id % 100) { z.noProg = d >= (z.lastD || 1e9) - 25 ? (z.noProg || 0) + 1 : 0; z.lastD = d; } // не приближается 10 с (застрял у забора) — заходит с другой стороны
        if ((z.noProg >= 2 || z.stT > 8) && d > 220) { const q = this.spawnPoint(); if (q) { z.p = q; z.stT = 0; z.noProg = 0; z.lastD = 1e9; z.entry = null; } }
      } else if (!support) {
        z.atk = 1; z.atkT -= dt;
        const backKick = z.ty === 1 && raiderBackKick(z.id) && !(z.lost & 4);
        if (backKick && !z.backKickAt && z.atkT <= 0) z.backKickAt = t + .32;
        const strike = backKick ? z.backKickAt > 0 && t >= z.backKickAt : z.atkT <= 0;
        if (backKick) z.atk = z.backKickAt > 0 || z.atkT > .70 ? 1 : 0;
        if (strike) {
          z.backKickAt = 0;
          z.atkT = .85;
          const earlyHeavy = (z.ty === 2 || z.ty === 4) && this.wave < 4 ? .65 : 1;
          if (t > T.inv) this.hurt(T, ZT[z.ty].dmg * earlyHeavy * (1 + this.cyc * .3) * ((z.lost & 3) === 3 ? .4 : 1));
        }
      }
      // расталкивают друг друга
      const gx = Math.floor(z.p[0] / 48), gy = Math.floor(z.p[1] / 48);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) { const a = G.get((gx + ix + 100) * 1000 + gy + iy + 100); if (a) for (const o of a) { if (o === z) continue; const dd = dist(o.p, z.p), m = o.r + z.r; if (dd < m && dd > .01) { const push = (m - dd) * ZT[o.ty].sc / (ZT[z.ty].sc + ZT[o.ty].sc); z.p = add(z.p, norm(sub(z.p, o.p)), Math.min(push, 5)); } } }
    }
    if (this.shots.length) { this.sendAll({ t: 'sh', s: this.shots }); this.shots = []; }
  }
  // ===== снапшот: двоичный, 20 раз в секунду =====
  snap() {
    const zs = this.st === 'play' ? [...this.zs.values()] : [], np = this.players.length;
    const buf = new ArrayBuffer(12 + np * ZSN_P + zs.length * ZSN_Z), v = new DataView(buf);
    v.setUint8(0, 1); v.setUint8(1, this.st === 'wait' ? 0 : this.st === 'play' ? 1 : 2); v.setUint8(2, this.phase); v.setUint8(3, Math.min(255, this.wave));
    v.setUint16(4, Math.min(65535, this.toSpawn + this.zs.size), true); v.setUint16(6, Math.max(0, Math.round((this.timerT - this.t) * 10)), true); v.setUint8(8, np); v.setUint8(9, this.cyc); v.setUint16(10, zs.length, true);
    let o = 12;
    for (const p of this.players) {
      v.setUint8(o, p.id); v.setInt16(o + 1, Math.round(p.p[0] * 10), true); v.setInt16(o + 3, Math.round(p.p[1] * 10), true);
      v.setUint8(o + 5, Math.round((Math.atan2(p.aim[1], p.aim[0]) / (Math.PI * 2) + 1) % 1 * 255));
      v.setUint8(o + 6, Math.round(Math.max(0, p.hp / p.maxHp) * 255)); v.setUint8(o + 7, p.st | (p.fire << 2) | (this.t < p.inv ? 8 : 0) | (p.revT > 0 ? 16 : 0));
      v.setUint8(o + 8, p.w); v.setUint8(o + 9, Math.min(255, p.lvl)); v.setUint8(o + 10, Math.max(0, Math.ceil(p.downT))); v.setUint8(o + 11, Math.min(255, Math.round(p.xp / zXpNeed(p.lvl) * 255))); o += ZSN_P;
    }
    for (const z of zs) {
      v.setUint16(o, z.id, true); v.setInt16(o + 2, Math.round(z.p[0] * 10), true); v.setInt16(o + 4, Math.round(z.p[1] * 10), true);
      v.setUint8(o + 6, z.ty | (z.lost << 3)); v.setUint8(o + 7, Math.round(Math.max(0, z.hp / z.mhp) * 255)); v.setUint8(o + 8, z.atk | (z.burn > 0 ? 2 : 0) | (z.air > 0 ? 4 : 0) | (this.t < this.frzT ? 8 : 0)); o += ZSN_Z;
    }
    for (const p of this.players) this.send(p.c, buf);
  }
}
