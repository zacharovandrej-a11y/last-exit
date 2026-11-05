// ===== LAST EXIT — сервер (Cloudflare Worker + Durable Object) =====
/*SHARED*/
const INDEX_HTML = __INDEX_HTML__;
const ICONS = { 192: '__ICON192__', 512: '__ICON512__' };
const b64bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
      return env.WORLD.get(env.WORLD.idFromName('world-1')).fetch(req);
    }
    if (url.pathname === '/' || url.pathname === '/index.html')
      return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    if (url.pathname === '/manifest.webmanifest') return new Response(JSON.stringify({
      name: 'LAST EXIT', short_name: 'LAST EXIT', start_url: '/', display: 'fullscreen', orientation: 'landscape',
      background_color: '#0b0820', theme_color: '#0b0820',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
    }), { headers: { 'content-type': 'application/manifest+json' } });
    if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png')
      return new Response(b64bin(ICONS[url.pathname.includes('512') ? 512 : 192]), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' } });
    if (url.pathname === '/sw.js') return new Response("self.addEventListener('fetch',()=>{});", { headers: { 'content-type': 'text/javascript' } });
    return new Response('not found', { status: 404 });
  }
};

const BOT_NAMES = ['Бублик', 'Пельмень', 'Зефир', 'Тапок', 'Кактус', 'Шпрота', 'Носок', 'Батон', 'Пончик', 'Кабачок', 'Вареник', 'Сырок', 'Чебурек', 'Плацинда', 'Брынза', 'Голубец'];
const NCHAR = 10;

export class World {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.clients = new Set(); this.timer = null; this.tick = 0;
    this.base = genWorld();
    this.toLobby();
  }
  toLobby() { this.phase = 0; this.lobbyT = -1; this.players = []; this.objs = this.base; this.loot = new Map(); this.comet = [0, 0, 1]; this.t = 0; for (const c of this.clients) c.pl = null; }
  async fetch(req) {
    const { 0: cli, 1: ws } = new WebSocketPair(); ws.accept();
    const c = { ws, name: null, char: 0, pl: null, spec: -1, joinedAt: Date.now() };
    if (this.clients.size >= 40) { ws.close(1013, 'full'); return new Response(null, { status: 101, webSocket: cli }); }
    this.clients.add(c);
    ws.addEventListener('message', e => this.onMsg(c, e.data));
    const bye = () => { this.clients.delete(c); if (c.pl && c.pl.alive && this.phase === 1) this.kill(c.pl, null, 0); if (c.pl) c.pl.c = null; this.lobbyList(); };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.loop(), 25); }
    return new Response(null, { status: 101, webSocket: cli });
  }
  send(c, m) { try { c.ws.send(typeof m === 'string' ? m : m); } catch (e) { } }
  sendAll(o) { const s = JSON.stringify(o); for (const c of this.clients) if (c.name) this.send(c, s); }
  lobbyList() { this.sendAll({ t: 'lb', n: [...this.clients].filter(c => c.name).map(c => c.name) }); }
  onMsg(c, data) {
    if (typeof data === 'string') {
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'join' && !c.name) {
        c.name = String(m.name || 'Игрок').replace(/[<>]/g, '').slice(0, 12).trim() || 'Игрок';
        c.char = Math.abs(m.char | 0) % NCHAR;
        this.send(c, JSON.stringify({ t: 'hi' }));
        if (this.phase > 0) this.send(c, JSON.stringify(this.matchMsg()));
        this.lobbyList();
      } else if (m.t === 'spec' && !(c.pl && c.pl.alive)) {
        const alive = this.players.filter(p => p.alive); if (alive.length) { const i = alive.findIndex(p => p.id === c.spec); c.spec = alive[(i + 1) % alive.length].id; }
      }
      return;
    }
    const pl = c.pl; if (!pl || !pl.alive || this.phase !== 1) return;
    const dv = new DataView(data); if (dv.byteLength < 2 || dv.getUint8(0) !== 1) return;
    const n = dv.getUint8(1);
    for (let i = 0, o = 2; i < n && o + 12 <= dv.byteLength; i++, o += 12) {
      if (pl.inputs.length > 30) pl.inputs.shift();
      pl.inputs.push({ seq: dv.getUint16(o, true), mv: [dv.getInt8(o + 2) / 127, dv.getInt8(o + 3) / 127, dv.getInt8(o + 4) / 127],
        aim: [dv.getInt8(o + 5), dv.getInt8(o + 6), dv.getInt8(o + 7)], fl: dv.getUint8(o + 8), vt: dv.getUint16(o + 9, true) + dv.getUint8(o + 11) / 256 });
    }
  }
  loop() {
    const now = Date.now(); this.acc += now - this.last; this.last = now;
    let n = 0; while (this.acc >= 1000 / TICK && n < 4) { this.acc -= 1000 / TICK; n++; this.step(); }
    if (this.acc > 500) this.acc = 0;
    if (!this.clients.size) { clearInterval(this.timer); this.timer = null; this.toLobby(); }
  }
  // ===== Матч =====
  matchMsg() {
    return { t: 'match', ph: this.phase, mt: this.t, comet: this.comet, plan: this.plan, ship: [this.shipS, this.shipD], pl: this.players.map(p => [p.id, p.name, p.char, p.bot ? 1 : 0, p.alive ? 1 : 0]),
      loot: [...this.loot.values()].map(lootArr), dead: this.objs.filter(o => o.dead).map(o => o.id) };
  }
  startMatch() {
    this.phase = 1; this.t = 0; this.tick = 0;
    const rnd = mkRng((Date.now() % 100000) + 7); this.rnd = rnd;
    this.objs = genWorld();
    this.comet = rndSphere(rnd); this.antip = mul(this.comet, -1); this.plan = makePlan(rnd, this.comet);
    this.shipS = rndSphere(rnd); this.shipD = anyTang(this.shipS); { const a = rnd() * 6.2832; this.shipD = norm(add(mul(this.shipD, Math.cos(a)), cross(this.shipS, this.shipD), Math.sin(a))); }
    this.z = zoneAt(0, this.comet, this.plan);
    this.loot = new Map(); this.lootId = 1; this.lAdd = []; this.lDel = [];
    const humans = [...this.clients].filter(c => c.name).slice(0, MAXP);
    const used = new Set(); this.players = [];
    const spawn = () => { for (let k = 0; k < 200; k++) { const p = rndSphere(rnd); if (this.players.every(q => angDist(q.p, p) * R > 420) && this.objs.every(o => angDist(o.p, p) * R > o.rad + 30)) return p; } return rndSphere(rnd); };
    for (let i = 0; i < MAXP; i++) {
      const c = humans[i];
      let name = c ? c.name : null;
      if (!c) { do { name = BOT_NAMES[Math.floor(rnd() * BOT_NAMES.length)]; } while (used.has(name)); }
      used.add(name);
      const p = this.shipS;
      const pl = { id: i, c: c || null, bot: !c, name, char: c ? c.char : Math.floor(rnd() * NCHAR), p, aim: anyTang(p), hp: 100, armor: 0, alive: true,
        slots: [{ w: 1, r: 0, mag: 12 }, null], cur: 0, ammo: [24, 0, 0, 0], meds: 1, relT: 0, cdT: 0, healT: 0, inputs: [], seq: 0,
        hist: new Array(32).fill(null), kills: 0, hm: [], skill: .35 + rnd() * .5, think: 0, goal: null, stuck: 0, side: rnd() < .5 ? 1 : -1, fireHeld: false, air: 1, fallT: 0, jumpAt: 1 + rnd() * (DROP_T - 2), glide: null };
      if (c) { c.pl = pl; c.spec = -1; }
      this.players.push(pl);
    }
    for (const c of this.clients) if (c.name && !c.pl) c.spec = 0;
    // лут на земле
    for (let i = 0; i < 130; i++) { const b = i < 60 ? BIOMES[i % BIOMES.length] : null; const p = b ? nearPt(rnd, b.c, b.r) : rndSphere(rnd); if (this.objs.some(o => angDist(o.p, p) * R < o.rad + 6)) continue; this.addLoot(this.randLoot(rnd), p, true); }
    this.lAdd = [];
    this.sendAll(this.matchMsg());
  }
  randLoot(rnd, rich) {
    const x = rnd();
    if (x < .38) { const w = [1, 2, 2, 3, 3, 4, 5, 5][Math.floor(rnd() * 8)]; const rr = rnd(); const r = rr < .4 ? 0 : rr < .68 ? 1 : rr < .86 ? 2 : rr < .96 ? 3 : 4; return { k: 0, x: w, r: Math.min(4, r + (rich ? 1 : 0)), n: WEAPONS[w].mag }; }
    if (x < .70) { const a = Math.floor(rnd() * 4); return { k: 1, x: a, r: 0, n: AMMO_PACK[a] }; }
    if (x < .88) return { k: 2, x: 0, r: 0, n: 1 };
    return { k: 3, x: 0, r: 0, n: 100 };
  }
  addLoot(it, p, silent) { it.id = this.lootId++; it.p = p; this.loot.set(it.id, it); if (!silent) this.lAdd.push(it); return it; }
  delLoot(it) { this.loot.delete(it.id); this.lDel.push(it.id); }
  dropNear(it, p, rnd) { const u = anyTang(p), v = cross(p, u), a = rnd() * 6.283; return this.addLoot(it, collide(this.objs, norm(add(add(p, u, Math.cos(a) * 26 / R), v, Math.sin(a) * 26 / R)))); }
  step() {
    this.tick++;
    if (this.phase === 0) {
      const n = [...this.clients].filter(c => c.name).length;
      if (n > 0) { if (this.lobbyT < 0) this.lobbyT = 15 * TICK; if (n >= MAXP) this.lobbyT = Math.min(this.lobbyT, 4 * TICK); if (--this.lobbyT <= 0) this.startMatch(); }
      else this.lobbyT = -1;
    } else if (this.phase === 1) this.play();
    else if (this.phase === 2) { if (--this.endT <= 0) { this.toLobby(); this.sendAll({ t: 'lobby' }); this.lobbyList(); } }
    this.broadcast();
  }
  play() {
    this.t += DT; this.z = zoneAt(this.t, this.comet, this.plan); this.theta = Math.PI - this.z.rho;
    this.shots = this.shots || [];
    for (const p of this.players) {
      if (p.bot) p.hm.length = 0;
      if (!p.alive) continue;
      p.cdT -= DT;
      if (p.relT > 0) { p.relT -= DT; if (p.relT <= 0) this.finishReload(p); }
      if (p.healT > 0) { p.healT -= DT; if (p.healT <= 0) { p.hp = Math.min(100, p.hp + 50); p.meds--; } }
      if (p.air === 1) { const [sp, sd] = shipPos(this.shipS, this.shipD, this.t); p.p = sp; p.aim = sd; if (this.t >= DROP_T || (p.bot && this.t >= p.jumpAt)) this.jump(p); }
      if (p.air === 2) { p.fallT -= DT; if (p.bot) { if (!p.glide) p.glide = anyTang(p.p); p.p = moveOn(p.p, tang(p.p, p.glide), SPEED * 1.8 * DT)[0]; } if (p.fallT <= 0) { p.air = 0; p.p = collide(this.objs, collide(this.objs, p.p)); } }
      if (p.bot) { if (!p.air) this.botStep(p); }
      else { const k = p.inputs.length > 4 ? 2 : 1; for (let i = 0; i < k && p.inputs.length; i++) this.applyInput(p, p.inputs.shift()); }
      if (!p.alive) continue;
      if (p.air) continue;
      // огонь
      if (outZone(p.p, this.z)) { this.damage(p, zoneDps(this.z) * DT, null, 0, true); p.fireAcc = (p.fireAcc || 0) + zoneDps(this.z) * DT; if (p.fireAcc >= 5) { p.hm.push([p.id, Math.round(p.fireAcc)]); p.fireAcc = 0; } }
      // автоподбор
      for (const it of this.loot.values()) if (dot(it.p, p.p) > .9995 && angDist(it.p, p.p) * R < PR + 14) this.pickup(p, it, false);
    }
    for (const p of this.players) p.hist[this.tick % 32] = p.p;
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1 && this.phase === 1) {
      this.phase = 2; this.endT = 9 * TICK;
      const w = alive[0]; this.sendAll({ t: 'end', w: w ? w.id : (this.lastDead ? this.lastDead.id : -1) });
    }
  }
  jump(p) { if (p.air !== 1) return; p.air = 2; p.fallT = FALL_T; if (p.bot) { const a = this.rnd() * 6.2832, u = anyTang(p.p); p.glide = norm(add(mul(u, Math.cos(a)), cross(p.p, u), Math.sin(a))); } }
  applyInput(p, inp) {
    p.seq = inp.seq;
    const fl = inp.fl;
    if (p.air === 1) { if (fl & (1 | 4 | 64)) this.jump(p); return; }
    if (p.air === 2) { const k = Math.min(1, Math.hypot(...inp.mv)); if (k > .05) p.p = moveOn(p.p, tang(p.p, inp.mv), SPEED * 1.8 * k * DT)[0]; return; }
    if (fl & 16) { const s = (fl >> 5) & 1; if (s !== p.cur && p.slots[s]) { p.cur = s; p.relT = 0; p.cdT = Math.max(p.cdT, .25); } }
    p.p = stepMove(this.objs, p.p, inp.mv, p.healT > 0 ? .5 : 1);
    if (inp.aim[0] || inp.aim[1] || inp.aim[2]) p.aim = tang(p.p, inp.aim); else p.aim = tang(p.p, p.aim);
    if (fl & 2) this.startReload(p);
    if (fl & 8) this.startHeal(p);
    if (fl & 4) { let best = null, bd = 1e9; for (const it of this.loot.values()) { const d = angDist(it.p, p.p) * R; if (d < PR + 30 && d < bd) { bd = d; best = it; } } if (best) this.pickup(p, best, true); }
    if (fl & 1) this.fire(p, inp.vt);
  }
  startReload(p) { const s = p.slots[p.cur]; if (!s || p.relT > 0) return; const W = WEAPONS[s.w]; if (s.mag >= W.mag || p.ammo[W.ammo] <= 0) return; p.relT = W.rel; p.healT = 0; }
  finishReload(p) { const s = p.slots[p.cur]; if (!s) return; const W = WEAPONS[s.w]; const take = Math.min(W.mag - s.mag, p.ammo[W.ammo]); s.mag += take; p.ammo[W.ammo] -= take; }
  startHeal(p) { if (p.meds > 0 && p.hp < 100 && p.healT <= 0) { p.healT = 2.5; p.relT = 0; } }
  pickup(p, it, manual) {
    if (it.k === 1) { const m = AMMO_MAX[it.x]; if (p.ammo[it.x] >= m) return; p.ammo[it.x] = Math.min(m, p.ammo[it.x] + it.n); }
    else if (it.k === 2) { if (p.meds >= 5) return; p.meds++; }
    else if (it.k === 3) { if (p.armor >= it.n) return; p.armor = it.n; }
    else {
      const empty = p.slots.findIndex(s => !s);
      if (empty >= 0) { p.slots[empty] = { w: it.x, r: it.r, mag: it.n }; p.cur = empty; p.relT = 0; }
      else if (manual) { const old = p.slots[p.cur]; p.slots[p.cur] = { w: it.x, r: it.r, mag: it.n }; p.relT = 0; this.delLoot(it); this.dropNear({ k: 0, x: old.w, r: old.r, n: old.mag }, p.p, this.rnd); return; }
      else return;
    }
    this.delLoot(it);
  }
  posAt(q, vt) { // позиция игрока в прошлом (для поправки на пинг)
    const a = Math.floor(vt), f = vt - a; const pa = q.hist[a % 32], pb = q.hist[(a + 1) % 32];
    if (!pa) return q.p; if (!pb || f <= 0) return pa; return slerpN(pa, pb, f);
  }
  fire(p, vt) {
    const s = p.slots[p.cur]; if (!s || p.relT > 0 || p.cdT > 0) return;
    if (p.healT > 0) p.healT = 0;
    const W = WEAPONS[s.w];
    if (s.mag <= 0) { this.startReload(p); return; }
    s.mag--; p.cdT = 1 / W.rate;
    // поправка на пинг: смотрим, где были цели в момент, который видел стрелок (не больше 300 мс назад)
    let rt = this.tick;
    if (!p.bot) { let v = (this.tick & ~0xffff) + vt; if (v > this.tick) v -= 65536; rt = Math.max(this.tick - 6, Math.min(this.tick, v)); }
    const side = cross(p.aim, p.p);
    const sk = p.bot ? (1 + (1 - p.skill) * 2.2) : 1;
    for (let k = 0; k < W.pel; k++) {
      const sp = W.spread * sk * (W.pel > 1 ? (k / (W.pel - 1) - .5) * 2 + (this.rnd() - .5) * .3 : (this.rnd() - .5) * 2);
      const d = norm(add(p.aim, side, sp));
      const h = this.hitscan(p, d, W.range, rt);
      this.shots.push([p.id, s.w | (s.r << 4), h.end]);
      const dmg = W.dmg * RMULT[s.r] * (W.pel > 1 ? Math.max(.35, 1 - h.dist / W.range * .6) : 1);
      if (h.pl) this.damage(h.pl, dmg, p, s.w);
      else if (h.obj && h.obj.hp) { h.obj.hp -= dmg; p.hm.push([255, Math.round(dmg)]); if (h.obj.hp <= 0) this.breakCrate(h.obj); }
    }
    if (s.mag <= 0) this.startReload(p);
  }
  hitscan(p, d, range, rt) {
    const from = p.p, cr = Math.cos(range / R + .08);
    const cands = this.objs.filter(o => !o.dead && OT[o.type] && dot(o.p, from) > cr && o.type !== 'snowman');
    const pls = []; for (const q of this.players) if (q.alive && q !== p && !q.air) { const qp = rt === this.tick ? q.p : this.posAt(q, rt); if (dot(qp, from) > cr) pls.push([q, qp]); }
    let pos = from, dir = d; const step = 8;
    for (let s = step; s <= range; s += step) {
      [pos, dir] = moveOn(pos, dir, step, dir);
      for (const o of cands) { if (dot(o.p, pos) < .995) continue; const rel = add(pos, o.p, -1), lx = dot(rel, o.u) * R, ly = dot(rel, o.v) * R;
        if (o.sh === 0 ? Math.hypot(lx, ly) < o.w / 2 * .85 : Math.abs(lx) < o.w / 2 && Math.abs(ly) < o.h / 2) return { end: pos, obj: o, dist: s }; }
      for (const [q, qp] of pls) if (angDist(qp, pos) * R < PR + 3) return { end: pos, pl: q, dist: s };
    }
    return { end: pos, dist: range };
  }
  breakCrate(o) {
    o.dead = true; this.sendAll({ t: 'cr', id: o.id });
    const n = 2 + (this.rnd() < .5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.dropNear(this.randLoot(this.rnd, i === 0), o.p, this.rnd);
  }
  damage(v, dmg, by, w, wave) {
    if (!v.alive) return;
    if (!wave && v.armor > 0) { const a = Math.min(v.armor, dmg * .6); v.armor -= a; dmg -= a; }
    v.hp -= dmg;
    if (by) by.hm.push([v.id, Math.max(1, Math.round(dmg))]);
    if (v.hp <= 0) this.kill(v, by, w);
  }
  kill(v, by, w) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; this.lastDead = v;
    const place = this.players.filter(p => p.alive).length + 1;
    if (by) by.kills++;
    for (const s of v.slots) if (s) this.dropNear({ k: 0, x: s.w, r: s.r, n: s.mag }, v.p, this.rnd);
    for (let a = 0; a < 4; a++) if (v.ammo[a] > 0) this.dropNear({ k: 1, x: a, r: 0, n: v.ammo[a] }, v.p, this.rnd);
    if (v.meds) this.dropNear({ k: 2, x: 0, r: 0, n: 1 }, v.p, this.rnd);
    this.sendAll({ t: 'k', k: by ? by.id : -1, v: v.id, w });
    if (v.c) { v.c.spec = by && by.alive ? by.id : -1; this.send(v.c, JSON.stringify({ t: 'dead', place, by: by ? by.id : -1 })); }
    for (const c of this.clients) if (c.spec === v.id) c.spec = by && by.alive ? by.id : -1;
  }
  // ===== Боты =====
  botStep(b) {
    const rnd = this.rnd;
    b.think--;
    const wpn = b.slots[b.cur], W = wpn ? WEAPONS[wpn.w] : null;
    // цель
    if (b.think <= 0) {
      b.think = 4 + Math.floor(rnd() * 4);
      let best = null, bd = 1e9;
      for (const q of this.players) if (q.alive && q !== b && !q.air) { const d = angDist(q.p, b.p) * R; if (d < bd) { bd = d; best = q; } }
      b.target = best && bd < 560 ? best : null; b.tdist = bd;
      if (b.target) { const h = this.hitscan(b, tang(b.p, b.target.p), Math.min(bd + 10, 900), this.tick); b.los = h.pl === b.target; }
      // лучшее оружие по ситуации
      let bs = b.cur, bv = -1;
      b.slots.forEach((s, i) => { if (!s) return; const X = WEAPONS[s.w]; if (s.mag <= 0 && b.ammo[X.ammo] <= 0) return; const v = (bd < X.range ? 1 : .3) * X.dmg * X.pel * X.rate * RMULT[s.r]; if (v > bv) { bv = v; bs = i; } });
      if (bs !== b.cur && b.slots[bs]) { b.cur = bs; b.relT = 0; b.cdT = .3; }
      // цель-лут
      b.goal = null;
      if (!b.target || !b.los) {
        let gd = 1e9;
        for (const it of this.loot.values()) {
          const d = angDist(it.p, b.p) * R; if (d > 650 || d > gd) continue;
          const want = it.k === 0 ? (!b.slots[1] || it.r > Math.min(...b.slots.map(s => s ? s.r : -1))) : it.k === 1 ? b.ammo[it.x] < 40 && b.slots.some(s => s && WEAPONS[s.w].ammo === it.x) : it.k === 2 ? b.meds < 3 : b.armor < 50;
          if (want && !(this.z.rho < Math.PI && angDist(it.p, this.z.c) > this.z.rho - .1)) { gd = d; b.goal = it; }
        }
      }
    }
    const t = b.target && b.target.alive ? b.target : null;
    let mv = null, fire = false;
    const z = this.z, nz = !z.mv && z.k < ZONE.length && !z.pre ? { c: this.plan[z.k], rho: ZONE[z.k][0] } : z;
    const danger = z.rho < Math.PI && angDist(b.p, z.c) > z.rho - .2;
    if (danger) mv = tang(b.p, z.c); else if (!t && !b.goal && z.rho < Math.PI && angDist(b.p, nz.c) > nz.rho - .1) mv = tang(b.p, nz.c);
    if (t) {
      const to = tang(b.p, t.p); const err = (1 - b.skill) * .25 * Math.sin(this.t * 2.3 + b.id);
      b.aim = norm(add(to, cross(to, b.p), err));
      const range = W ? W.range : 300;
      if (!danger) { const sd = cross(to, b.p); const want = range * .55; mv = norm(add(mul(to, b.tdist > want ? 1 : -.4), sd, b.side * .9)); if (rnd() < .01) b.side *= -1; }
      if (W && b.los && b.tdist < range * .95 && rnd() < .55 + b.skill * .4) fire = true;
    } else if (!danger && b.goal) { if (this.loot.has(b.goal.id)) { mv = tang(b.p, b.goal.p); if (angDist(b.goal.p, b.p) * R < PR + 26) this.pickup(b, b.goal, true); } else b.think = 0; }
    else if (!mv) { if (!b.wp || angDist(b.wp, b.p) < .05 || rnd() < .004) b.wp = nearPt(rnd, z.rho < Math.PI ? nz.c : b.p, Math.min(.7, Math.max(.05, nz.rho * .7))); mv = tang(b.p, b.wp); }
    if (!t && b.hp < 60 && b.meds > 0 && !danger) { this.startHeal(b); mv = null; }
    if (wpn && wpn.mag <= 0) this.startReload(b);
    if (mv) {
      if (b.stuck > 0) { mv = norm(add(mv, cross(mv, b.p), b.side * 1.6)); b.stuck--; }
      const np = stepMove(this.objs, b.p, mv, (b.healT > 0 ? .5 : .92));
      if (angDist(np, b.p) * R < SPEED * DT * .3) b.stuck = 12; b.p = np;
    }
    if (!t) b.aim = mv ? tang(b.p, mv) : tang(b.p, b.aim); else b.aim = tang(b.p, b.aim);
    if (fire) this.fire(b, 0);
  }
  // ===== Рассылка =====
  broadcast() {
    if (this.lAdd && (this.lAdd.length || this.lDel.length)) {
      const m = {}; if (this.lAdd.length) m.a = this.lAdd.map(lootArr); if (this.lDel.length) m.d = this.lDel;
      m.t = 'l'; this.sendAll(m); this.lAdd = []; this.lDel = [];
    }
    const shots = this.shots || []; this.shots = [];
    const named = [...this.clients].filter(c => c.name);
    const theta = Math.round((this.theta || 0) / Math.PI * 65535);
    for (const c of named) {
      const me = c.pl && this.phase > 0 ? c.pl : null;
      let cam = me && me.alive ? me : null;
      if (!cam && this.phase > 0) {
        cam = this.players[c.spec];
        if (!cam || !cam.alive) { cam = this.players.find(p => p.alive) || this.players[0]; if (cam) c.spec = cam.id; }
      }
      const ents = [];
      if (cam) for (const p of this.players) if (p.alive && (p === cam || p === me || (p.air !== 1 && dot(p.p, cam.p) > Math.cos(VIEW)))) ents.push(p);
      const sh = cam ? shots.filter(s => dot(s[2], cam.p) > Math.cos(VIEW + .3)) : [];
      const hm = me ? me.hm.splice(0) : [];
      const buf = new ArrayBuffer(36 + ents.length * 14 + sh.length * 8 + hm.length * 2), dv = new DataView(buf); let o = 0;
      const u8 = v => dv.setUint8(o++, Math.max(0, Math.min(255, Math.round(v))));
      const u16 = v => { dv.setUint16(o, v, true); o += 2; };
      const v3 = p => { dv.setInt16(o, i16(p[0]), true); dv.setInt16(o + 2, i16(p[1]), true); dv.setInt16(o + 4, i16(p[2]), true); o += 6; };
      u8(1); dv.setUint32(o, this.tick, true); o += 4; u8(this.phase);
      u16(this.phase === 0 ? (this.lobbyT < 0 ? 65535 : this.lobbyT) : this.phase === 2 ? this.endT : Math.min(65535, Math.round(this.t * 10)));
      u16(theta); u16(me ? me.seq : 0); u8(me ? me.id : 255); u8(cam ? cam.id : 255);
      u8(this.phase === 0 ? named.length : this.players.filter(p => p.alive).length);
      const P = me || cam;
      if (P) {
        u8(P.hp); u8(P.armor); u8(P.cur);
        for (let i = 0; i < 2; i++) { const s = P.slots[i]; u8(s ? s.w | (s.r << 4) : 0); u8(s ? s.mag : 0); }
        for (let a = 0; a < 4; a++) u8(P.ammo[a]); u8(P.meds); u8((P.relT > 0 ? 1 : 0) | (P.healT > 0 ? 2 : 0));
        const s = P.slots[P.cur]; u8(P.relT > 0 && s ? 255 * (1 - P.relT / WEAPONS[s.w].rel) : P.healT > 0 ? 255 * (1 - P.healT / 2.5) : 0); u8(P.kills);
      } else o += 15;
      u8(ents.length);
      for (const p of ents) { u8(p.id); v3(p.p); dv.setInt8(o++, i8(dot(p.aim, [1, 0, 0]))); dv.setInt8(o++, i8(p.aim[1])); dv.setInt8(o++, i8(p.aim[2])); u8(p.hp); u8(1 | (p.armor > 0 ? 2 : 0) | (p.relT > 0 ? 4 : 0) | (p.healT > 0 ? 8 : 0) | (p.air << 4)); const s = p.slots[p.cur]; u8(s ? s.w | (s.r << 4) : 0); }
      u8(sh.length); for (const s of sh) { u8(s[0]); u8(s[1]); v3(s[2]); }
      u8(hm.length); for (const h of hm) { u8(h[0]); u8(Math.min(255, h[1])); }
      this.send(c, buf.slice(0, o));
    }
  }
}
function lootArr(it) { return [it.id, it.k, it.x, it.r, it.n, +it.p[0].toFixed(5), +it.p[1].toFixed(5), +it.p[2].toFixed(5)]; }
