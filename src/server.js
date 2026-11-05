// ===== LAST EXIT — сервер (Cloudflare Worker + Durable Object) =====
/*SHARED*/
const INDEX_HTML = __INDEX_HTML__;
const THREE_JS = __THREE__;
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
    if (url.pathname === '/three.min.js') return new Response(THREE_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=604800' } });
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
  toLobby() { this.phase = 0; this.lobbyT = -1; this.players = []; this.objs = this.base; this.loot = new Map(); this.plan = null; this.t = 0; for (const c of this.clients) c.pl = null; }
  async fetch(req) {
    const { 0: cli, 1: ws } = new WebSocketPair(); ws.accept();
    const c = { ws, name: null, char: 0, pl: null, spec: -1, joinedAt: Date.now() };
    if (this.clients.size >= 40) { ws.close(1013, 'full'); return new Response(null, { status: 101, webSocket: cli }); }
    this.clients.add(c);
    ws.addEventListener('message', e => this.onMsg(c, e.data));
    const bye = () => { if (!this.clients.has(c)) return; this.clients.delete(c); if (c.pl && c.pl.alive && this.phase === 1) this.kill(c.pl, null, 0); if (c.pl) c.pl.c = null; this.lobbyList(); };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.loop(), 25); }
    return new Response(null, { status: 101, webSocket: cli });
  }
  send(c, m) { try { c.ws.send(m); } catch (e) { } }
  sendAll(o) { const s = JSON.stringify(o); for (const c of this.clients) if (c.name) this.send(c, s); }
  humans() { return [...this.clients].filter(c => c.name); }
  lobbyList() { this.sendAll({ t: 'lb', n: this.humans().map(c => c.name) }); }
  onMsg(c, data) {
    if (typeof data === 'string') {
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'join' && !c.name) {
        c.name = String(m.name || 'Игрок').replace(/[<>]/g, '').slice(0, 12).trim() || 'Игрок';
        c.char = Math.abs(m.char | 0) % NCHAR;
        this.send(c, JSON.stringify({ t: 'hi' }));
        if (this.phase > 0) this.send(c, JSON.stringify(this.matchMsg()));
        this.lobbyList();
      } else if (m.t === 'restart' && this.phase !== 0 && this.humans().length === 1) { // живых людей больше нет — только боты: можно заново
        this.toLobby(); this.lobbyT = 3 * TICK; this.sendAll({ t: 'lobby' }); this.lobbyList();
      } else if (m.t === 'quit') { // вышел из игры
        if (c.pl && c.pl.alive && this.phase === 1) this.kill(c.pl, null, 0);
        if (c.pl) c.pl.c = null; c.pl = null; this.clients.delete(c); this.lobbyList(); try { c.ws.close(1000, 'quit'); } catch (e) { }
      } else if (m.t === 'spec' && !(c.pl && c.pl.alive)) {
        const alive = this.players.filter(p => p.alive); if (alive.length) { const i = alive.findIndex(p => p.id === c.spec); c.spec = alive[(i + 1) % alive.length].id; }
      }
      return;
    }
    const pl = c.pl; if (!pl || !pl.alive || this.phase !== 1) return;
    const dv = new DataView(data); if (dv.byteLength < 2 || dv.getUint8(0) !== 1) return;
    const n = dv.getUint8(1);
    for (let i = 0, o = 2; i < n && o + 10 <= dv.byteLength; i++, o += 10) {
      if (pl.inputs.length > 30) pl.inputs.shift();
      pl.inputs.push({ seq: dv.getUint16(o, true), mv: [dv.getInt8(o + 2) / 127, dv.getInt8(o + 3) / 127],
        aim: [dv.getInt8(o + 4), dv.getInt8(o + 5)], fl: dv.getUint8(o + 6), vt: dv.getUint16(o + 7, true) + dv.getUint8(o + 9) / 256 });
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
    return { t: 'match', ph: this.phase, mt: this.t, plan: this.plan, ship: [this.shipS, this.shipD], pl: this.players.map(p => [p.id, p.name, p.char, p.bot ? 1 : 0, p.alive ? 1 : 0]),
      loot: [...this.loot.values()].map(lootArr), dead: this.objs.filter(o => o.dead).map(o => o.id) };
  }
  startMatch() {
    this.phase = 1; this.t = 0; this.tick = 0;
    const rnd = mkRng((Date.now() % 100000) + 7); this.rnd = rnd;
    this.objs = genWorld();
    this.plan = makePlan(rnd);
    { const a = rnd() * 6.2832; this.shipD = [Math.cos(a), Math.sin(a)]; this.shipS = add(nearPt(rnd, [0, 0], 450), this.shipD, -SHIP_V * DROP_T / 2); }
    this.z = zoneAt(0, this.plan);
    this.loot = new Map(); this.lootId = 1; this.lAdd = []; this.lDel = [];
    const humans = this.humans().slice(0, MAXP);
    const used = new Set(); this.players = [];
    for (let i = 0; i < MAXP; i++) {
      const c = humans[i];
      let name = c ? c.name : null;
      if (!c) { do { name = BOT_NAMES[Math.floor(rnd() * BOT_NAMES.length)]; } while (used.has(name)); }
      used.add(name);
      const pl = { id: i, c: c || null, bot: !c, name, char: c ? c.char : Math.floor(rnd() * NCHAR), p: this.shipS, aim: this.shipD, hp: 100, armor: 0, alive: true,
        slots: [{ w: 1, r: 0, mag: 12 }, null], cur: 0, ammo: [24, 0, 0, 0], meds: 1, relT: 0, cdT: 0, healT: 0, inputs: [], seq: 0,
        hist: new Array(32).fill(null), kills: 0, hm: [], skill: .35 + rnd() * .5, think: 0, goal: null, stuck: 0, side: rnd() < .5 ? 1 : -1, air: 1, fallT: 0, jumpAt: 1 + rnd() * (DROP_T - 2), glide: null };
      if (c) { c.pl = pl; c.spec = -1; }
      this.players.push(pl);
    }
    for (const c of this.clients) if (c.name && !c.pl) c.spec = 0;
    // лут на земле
    for (let i = 0; i < 70; i++) { const b = i < 30 ? BIOMES[i % BIOMES.length] : null; const p = b ? nearPt(rnd, b.c, b.r) : rndMap(rnd); if (!inMap(p, 40) || this.objs.some(o => dist(o.p, p) < o.rad + 6)) continue; this.addLoot(this.randLoot(rnd), p, true); }
    for (const b of this.objs.blds) for (const r of b.rooms) { // лут по комнатам: в больших залах больше
      const n = r.hall ? 3 : rnd() < .75 ? 1 : 0;
      for (let i = 0, k = 0; i < n && k < 25; k++) { const lp = [r.x0 + 14 + rnd() * (r.x1 - r.x0 - 28), r.y0 + 14 + rnd() * (r.y1 - r.y0 - 28)], p = add(add(b.p, b.u, lp[0]), b.v, lp[1]);
        if (nearObjs(this.objs, p, 30).some(o => !o.dead && !o.nc && objPush(o, p, 8))) continue; this.addLoot(this.randLoot(rnd, rnd() < .3), p, true); i++; } }
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
  dropNear(it, p, rnd) { const a = rnd() * 6.2832; return this.addLoot(it, collide(this.objs, add(p, [Math.cos(a), Math.sin(a)], 26))); }
  step() {
    this.tick++;
    if (this.phase === 0) {
      const n = this.humans().length;
      if (n > 0) { if (this.lobbyT < 0) this.lobbyT = (n === 1 ? 5 : 15) * TICK; if (n >= MAXP) this.lobbyT = Math.min(this.lobbyT, 4 * TICK); if (--this.lobbyT <= 0) this.startMatch(); }
      else this.lobbyT = -1;
    } else if (this.phase === 1) this.play();
    else if (this.phase === 2) { if (--this.endT <= 0) { this.toLobby(); this.sendAll({ t: 'lobby' }); this.lobbyList(); } }
    this.broadcast();
  }
  play() {
    this.t += DT; this.z = zoneAt(this.t, this.plan);
    this.shots = this.shots || [];
    for (const p of this.players) {
      if (p.bot) p.hm.length = 0;
      if (!p.alive) continue;
      p.cdT -= DT;
      if (p.relT > 0) { p.relT -= DT; if (p.relT <= 0) this.finishReload(p); }
      if (p.healT > 0) { p.healT -= DT; if (p.healT <= 0) { p.hp = Math.min(100, p.hp + 50); p.meds--; } }
      if (p.air === 1) { p.p = shipPos(this.shipS, this.shipD, this.t); p.aim = this.shipD; if (this.t >= DROP_T || (p.bot && this.t >= p.jumpAt)) this.jump(p); }
      if (p.air === 2) { p.fallT -= DT; if (p.bot) p.p = clampMap(add(p.p, p.glide, SPEED * 1.8 * DT), 60); if (p.fallT <= 0) { p.air = 0; p.p = collide(this.objs, collide(this.objs, clampMap(p.p, 40))); } }
      if (p.bot) { if (!p.air) this.botStep(p); }
      else { const k = p.inputs.length > 4 ? 2 : 1; for (let i = 0; i < k && p.inputs.length; i++) this.applyInput(p, p.inputs.shift()); }
      if (!p.alive || p.air) continue;
      // шаги: раз в ~0.35 с, если бежит
      const mvd = p.lastP ? dist(p.p, p.lastP) : 0; if (mvd > 1.5) { p.mvDir = norm(sub(p.p, p.lastP)); p.stepT = (p.stepT || 0) + DT; if (p.stepT >= .35) { p.stepT = 0; p.step = 1; p.stepN = (p.stepN || 0) + 1; } } p.lastP = p.p;
      // огонь
      if (outZone(p.p, this.z)) { const d = zoneDps(this.z) * DT; this.damage(p, d, null, 0, true); p.fireAcc = (p.fireAcc || 0) + d; if (p.fireAcc >= 5) { p.hm.push([p.id, Math.round(p.fireAcc)]); p.fireAcc = 0; } }
      // автоподбор
      for (const it of this.loot.values()) if (dist(it.p, p.p) < PR + 14) this.pickup(p, it, false);
    }
    for (const p of this.players) { p.hist[this.tick % 32] = p.p; p.bi = p.air ? -1 : bldAt(this.objs.blds, p.p); }
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1 && this.phase === 1) {
      this.phase = 2; this.endT = 9 * TICK;
      const w = alive[0]; this.sendAll({ t: 'end', w: w ? w.id : (this.lastDead ? this.lastDead.id : -1) });
    }
  }
  jump(p) { if (p.air !== 1) return; p.air = 2; p.fallT = FALL_T; if (p.bot) { const a = this.rnd() * 6.2832; p.glide = [Math.cos(a), Math.sin(a)]; } }
  applyInput(p, inp) {
    p.seq = inp.seq;
    const fl = inp.fl;
    if (p.air === 1) { if (fl & (1 | 4 | 64)) this.jump(p); return; }
    if (p.air === 2) { const k = Math.min(1, len(inp.mv)); if (k > .05) p.p = clampMap(add(p.p, norm(inp.mv), SPEED * 1.8 * k * DT), 60); return; }
    if (fl & 16) { const s = (fl >> 5) & 1; if (s !== p.cur && p.slots[s]) { p.cur = s; p.relT = 0; p.cdT = Math.max(p.cdT, .25); } }
    p.p = stepMove(this.objs, p.p, inp.mv, p.healT > 0 ? .5 : 1);
    if (inp.aim[0] || inp.aim[1]) p.aim = norm(inp.aim);
    if (fl & 2) this.startReload(p);
    if (fl & 8) this.startHeal(p);
    if (fl & 4) { let best = null, bd = 1e9; for (const it of this.loot.values()) { const d = dist(it.p, p.p); if (d < PR + 30 && d < bd) { bd = d; best = it; } } if (best) this.pickup(p, best, true); }
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
      else if (manual) { const old = p.slots[p.cur]; p.slots[p.cur] = { w: it.x, r: it.r, mag: it.n }; p.relT = 0; this.delLoot(it); this.dropNear({ k: 0, x: old.w, r: old.r, n: old.mag, by: p.id }, p.p, this.rnd); return; }
      else return;
    }
    this.delLoot(it);
  }
  posAt(q, vt) { // позиция игрока в прошлом (для поправки на пинг)
    const a = Math.floor(vt), f = vt - a; const pa = q.hist[a % 32], pb = q.hist[(a + 1) % 32];
    if (!pa) return q.p; if (!pb || f <= 0) return pa; return lerp(pa, pb, f);
  }
  fire(p, vt) {
    const s = p.slots[p.cur]; if (!s || p.relT > 0 || p.cdT > 0) return;
    if (p.healT > 0) p.healT = 0;
    const W = WEAPONS[s.w];
    if (s.mag <= 0) { this.startReload(p); return; }
    s.mag--; p.cdT = 1 / W.rate;
    // поправка на пинг: где были цели в момент, который видел стрелок (не больше 300 мс назад)
    let rt = this.tick;
    if (!p.bot) { let v = (this.tick & ~0xffff) + vt; if (v > this.tick) v -= 65536; rt = Math.max(this.tick - 6, Math.min(this.tick, v)); }
    const side = perp(p.aim);
    const sk = p.bot ? (1.8 + (1 - p.skill) * 2.6) : 1;
    for (let k = 0; k < W.pel; k++) {
      const sp = W.spread * sk * (W.pel > 1 ? (k / (W.pel - 1) - .5) * 2 + (this.rnd() - .5) * .3 : (this.rnd() - .5) * 2);
      const d = norm(add(p.aim, side, sp));
      const h = this.hitscan(p, d, W.range, rt);
      this.shots.push([p.id, s.w | (s.r << 4), h.end, p.p]);
      const dmg = W.dmg * RMULT[s.r] * (W.pel > 1 ? Math.max(.35, 1 - h.dist / W.range * .6) : 1);
      if (h.pl) this.damage(h.pl, dmg, p, s.w);
      else if (h.obj && h.obj.hp) { h.obj.hp -= dmg; p.hm.push([255, Math.round(dmg)]); if (h.obj.hp <= 0) this.breakCrate(h.obj); }
    }
    if (s.mag <= 0) this.startReload(p);
  }
  hitscan(p, d, range, rt) {
    const from = p.p; let best = range, obj = null, pl = null;
    for (const o of rayObjs(this.objs, from, d, range)) {
      if (o.dead || o.pass || o.type === 'snowman') continue;
      const t = rayObj(from, d, o); if (t < best) { best = t; obj = o; }
    }
    for (const q of this.players) {
      if (!q.alive || q === p || q.air) continue; const qp = rt === this.tick ? q.p : this.posAt(q, rt);
      if (dist(qp, from) > range + PR + 3) continue;
      const t = rayCircle(from, d, qp, PR + 3); if (t < best) { best = t; pl = q; obj = null; }
    }
    return { end: add(from, d, best), obj, pl, dist: best };
  }
  breakCrate(o) {
    o.dead = true; this.sendAll({ t: 'cr', id: o.id });
    const n = 2 + (this.rnd() < .5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.dropNear(this.randLoot(this.rnd, i === 0), o.p, this.rnd);
  }
  damage(v, dmg, by, w, wave) {
    if (!v.alive) return;
    if (!wave && v.armor > 0) { const a = Math.min(v.armor, dmg * .6); v.armor -= a; dmg -= a; }
    v.hp -= dmg; if (by) v.hitAt = this.t;
    if (by) by.hm.push([v.id, Math.max(1, Math.round(dmg))]);
    if (v.hp <= 0) this.kill(v, by, w);
  }
  kill(v, by, w) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; this.lastDead = v;
    const place = this.players.filter(p => p.alive).length + 1;
    if (by) by.kills++;
    if (!v.air) {
      for (const s of v.slots) if (s) this.dropNear({ k: 0, x: s.w, r: s.r, n: s.mag }, v.p, this.rnd);
      for (let a = 0; a < 4; a++) if (v.ammo[a] > 0) this.dropNear({ k: 1, x: a, r: 0, n: v.ammo[a] }, v.p, this.rnd);
      if (v.meds) this.dropNear({ k: 2, x: 0, r: 0, n: 1 }, v.p, this.rnd);
    }
    this.sendAll({ t: 'k', k: by ? by.id : -1, v: v.id, w });
    if (v.c) { v.c.spec = by && by.alive ? by.id : -1; this.send(v.c, JSON.stringify({ t: 'dead', place, by: by ? by.id : -1 })); }
    for (const c of this.clients) if (c.spec === v.id) c.spec = by && by.alive ? by.id : -1;
  }
  // ===== Боты =====
  // путь к точке t с учётом зданий: заходим и выходим через двери
  nav(b, t) {
    const B = this.objs.blds, bt = bldAt(B, t), bb = b.bi ?? -1;
    if (bb < 0) { if (bt < 0) return t; const d = near(B[bt].doors, b.p); return dist(b.p, d.o) < 24 ? d.i : d.o; } // снаружи → к ближайшей двери
    const Bd = B[bb], lp = toLocal(Bd, b.p), rb = roomAt(Bd, lp);
    let goalRoom, exit = null;
    if (bt === bb) goalRoom = roomAt(Bd, toLocal(Bd, t)); else { exit = near(Bd.doors, t); goalRoom = exit.room; }
    if (rb === goalRoom) return exit ? (dist(b.p, exit.i) < 24 ? exit.o : exit.i) : t;
    // поиск пути по комнатам (BFS)
    const prev = new Map([[rb, -1]]), Q = [rb];
    while (Q.length) { const r = Q.shift(); if (r === goalRoom) break; for (const e of Bd.adj) { const n = e.a === r ? e.b : e.b === r ? e.a : -1; if (n >= 0 && !prev.has(n)) { prev.set(n, r); Q.push(n); } } }
    if (!prev.has(goalRoom)) return t;
    let r = goalRoom; while (prev.get(r) !== rb) r = prev.get(r);
    const e = Bd.adj.find(e => (e.a === rb && e.b === r) || (e.b === rb && e.a === r)), dp = toWorld(Bd, e.p);
    const R2 = Bd.rooms[r]; return dist(b.p, dp) < 20 ? toWorld(Bd, [(R2.x0 + R2.x1) / 2, (R2.y0 + R2.y1) / 2]) : dp;
  }
  botStep(b) {
    const rnd = this.rnd;
    b.think--;
    const wpn = b.slots[b.cur], W = wpn ? WEAPONS[wpn.w] : null;
    const z = this.z, nz = nextZone(z, this.plan) || z;
    if (b.think <= 0) {
      b.think = 4 + Math.floor(rnd() * 4);
      let best = null, bd = 1e9;
      for (const q of this.players) if (q.alive && q !== b && !q.air) { const d = dist(q.p, b.p); if (d < bd) { bd = d; best = q; } }
      const early = this.t < ZONE_T0 + 40, eng = early ? (b.hitAt && this.t - b.hitAt < 5 ? 420 : 130) : 380 + b.skill * 120; // в начале боты собирают лут и дерутся, только если их задели
      const nt = best && bd < eng ? best : null; if (nt && nt !== b.target) b.react = Math.round((.5 + (1 - b.skill) * .8) * TICK); b.target = nt; b.tdist = bd;
      if (b.target) { const h = this.hitscan(b, dirTo(b.p, b.target.p), Math.min(bd + 10, 900), this.tick); b.los = h.pl === b.target; }
      // лучшее оружие по ситуации
      const val = s => { if (!s) return -1; const X = WEAPONS[s.w]; if (s.mag <= 0 && b.ammo[X.ammo] <= 0) return 0; return (bd < X.range * .9 ? 1 : .3) * X.dmg * X.pel * X.rate * RMULT[s.r]; };
      const o = 1 - b.cur; if (b.slots[o] && this.t > (b.swT || 0) && val(b.slots[o]) > val(b.slots[b.cur]) * 1.3) { b.cur = o; b.relT = 0; b.cdT = .3; b.swT = this.t + 3; }
      // цель-лут
      b.goal = null;
      if (!b.target || !b.los) {
        let gd = 1e9;
        for (const it of this.loot.values()) {
          const d = dist(it.p, b.p); if (d > 650 || d > gd) continue;
          const want = it.by === b.id ? false : it.k === 0 ? (!b.slots[1] || it.r > Math.min(...b.slots.map(s => s ? s.r : -1))) : it.k === 1 ? b.ammo[it.x] < 40 && b.slots.some(s => s && WEAPONS[s.w].ammo === it.x) : it.k === 2 ? b.meds < 3 : b.armor < 50;
          if (want && dist(it.p, z.c) < z.rho - 90) { gd = d; b.goal = it; }
        }
      }
    }
    const t = b.target && b.target.alive && b.los ? b.target : null; // не видит — не гонится, а занимается своим
    let mv = null, fire = false;
    const danger = !z.pre && dist(b.p, z.c) > z.rho - 180;
    if (danger) mv = dirTo(b.p, this.nav(b, z.c)); else if (!t && !b.goal && dist(b.p, nz.c) > nz.rho - 90) mv = dirTo(b.p, this.nav(b, nz.c));
    if (t) {
      const to = dirTo(b.p, t.p); const err = (1 - b.skill) * .25 * Math.sin(this.t * 2.3 + b.id);
      b.aim = norm(add(to, perp(to), err));
      const range = W ? W.range : 300;
      if (!danger) { if (!b.los) mv = dirTo(b.p, this.nav(b, t.p)); else { const want = range * .55; mv = norm(add(mul(to, b.tdist > want ? 1 : -.4), perp(to), b.side * .7)); if (rnd() < .006) b.side *= -1; } }
      if (b.react > 0) b.react--;
      else if (W && b.los && b.tdist < range * .95 && rnd() < (this.t < ZONE_T0 + 40 ? .14 : .22) + b.skill * .25) fire = true;
    } else if (!danger && b.goal) { if (this.loot.has(b.goal.id)) { mv = dirTo(b.p, this.nav(b, b.goal.p)); if (dist(b.goal.p, b.p) < PR + 26) this.pickup(b, b.goal, true); } else b.think = 0; }
    else if (!mv) { if (!b.wp || dist(b.wp, b.p) < 45 || rnd() < .004) b.wp = clampMap(nearPt(rnd, nz.c, Math.min(630, Math.max(45, nz.rho * .7))), 80); mv = dirTo(b.p, this.nav(b, b.wp)); }
    if (!t && b.hp < 60 && b.meds > 0 && !danger) { this.startHeal(b); mv = null; }
    if (wpn && wpn.mag <= 0) this.startReload(b);
    if (mv) {
      if (b.stuck > 0) { mv = norm(add(mv, perp(mv), b.side * 1.6)); b.stuck--; }
      const np = stepMove(this.objs, b.p, mv, (b.healT > 0 ? .5 : .92));
      if (dist(np, b.p) < SPEED * DT * .3) { b.stuck = 12; if (rnd() < .3) b.side *= -1; } b.p = np;
    }
    if (!t && mv) b.aim = norm(lerp(b.aim, norm(mv), .15));
    if (fire) this.fire(b, 0);
  }
  // ===== Рассылка =====
  broadcast() {
    if (this.lAdd && (this.lAdd.length || this.lDel.length)) {
      const m = {}; if (this.lAdd.length) m.a = this.lAdd.map(lootArr); if (this.lDel.length) m.d = this.lDel;
      m.t = 'l'; this.sendAll(m); this.lAdd = []; this.lDel = [];
    }
    const shots = this.shots || []; this.shots = [];
    const named = this.humans();
    for (const c of named) {
      const me = c.pl && this.phase > 0 ? c.pl : null;
      let cam = me && me.alive ? me : null;
      if (!cam && this.phase > 0) {
        cam = this.players[c.spec];
        if (!cam || !cam.alive) { cam = this.players.find(p => p.alive) || this.players[0]; if (cam) c.spec = cam.id; }
      }
      const ents = [];
      // видимость: стены и крыши закрывают; невидимых только «слышно» (шаги, выстрелы)
      const seen = new Set(), noise = [];
      if (cam) for (const p of this.players) {
        if (!p.alive) continue;
        const vis = p === cam || p === me || (p.air !== 1 && dist(p.p, cam.p) < VIEWD && (p.air || cam.air || canSee(this.objs, cam.p, p.p, cam.bi ?? -1, p.bi ?? -1)));
        if (vis) { ents.push(p); seen.add(p.id); }
        else if (p.step && !p.air && dist(p.p, cam.p) < HEAR) noise.push([1 | ((p.stepN & 1) << 4), p.p, p.mvDir || [0, 1]]);
      }
      const sh = [];
      if (cam) { const heard = new Set(); for (const s of shots) { if (seen.has(s[0])) { if (dist(s[2], cam.p) < VIEWD + 300) sh.push(s); } else if (!heard.has(s[0]) && dist(s[3], cam.p) < HEAR * 1.8) { heard.add(s[0]); noise.push([2, s[3], [0, 0]]); } } }
      const hm = me ? me.hm.splice(0) : [];
      const buf = new ArrayBuffer(42 + ents.length * 10 + sh.length * 6 + hm.length * 2 + noise.length * 7), dv = new DataView(buf); let o = 0;
      const u8 = v => dv.setUint8(o++, Math.max(0, Math.min(255, Math.round(v))));
      const u16 = v => { dv.setUint16(o, v, true); o += 2; };
      const v2 = p => { dv.setInt16(o, q16(p[0]), true); dv.setInt16(o + 2, q16(p[1]), true); o += 4; };
      u8(1); dv.setUint32(o, this.tick, true); o += 4; u8(this.phase);
      u16(this.phase === 0 ? (this.lobbyT < 0 ? 65535 : this.lobbyT) : this.phase === 2 ? this.endT : Math.min(65535, Math.round(this.t * 10)));
      u16(me ? me.seq : 0); u8(me ? me.id : 255); u8(cam ? cam.id : 255);
      u8(this.phase === 0 ? named.length : this.players.filter(p => p.alive).length);
      const P = me || cam;
      if (P) {
        u8(P.hp); u8(P.armor); u8(P.cur);
        for (let i = 0; i < 2; i++) { const s = P.slots[i]; u8(s ? s.w | (s.r << 4) : 0); u8(s ? s.mag : 0); }
        for (let a = 0; a < 4; a++) u8(P.ammo[a]); u8(P.meds); u8((P.relT > 0 ? 1 : 0) | (P.healT > 0 ? 2 : 0));
        const s = P.slots[P.cur]; u8(P.relT > 0 && s ? 255 * (1 - P.relT / WEAPONS[s.w].rel) : P.healT > 0 ? 255 * (1 - P.healT / 2.5) : 0); u8(P.kills);
      } else o += 15;
      u8(ents.length);
      for (const p of ents) { u8(p.id); v2(p.p); dv.setInt8(o++, i8(p.aim[0])); dv.setInt8(o++, i8(p.aim[1])); u8(p.hp); u8(1 | (p.armor > 0 ? 2 : 0) | (p.relT > 0 ? 4 : 0) | (p.healT > 0 ? 8 : 0) | (p.air << 4)); const s = p.slots[p.cur]; u8(s ? s.w | (s.r << 4) : 0); }
      u8(sh.length); for (const s of sh) { u8(s[0]); u8(s[1]); v2(s[2]); }
      u8(hm.length); for (const h of hm) { u8(h[0]); u8(Math.min(255, h[1])); }
      u8(noise.length); for (const n of noise) { u8(n[0]); v2(n[1]); dv.setInt8(o++, i8(n[2][0])); dv.setInt8(o++, i8(n[2][1])); }
      this.send(c, buf.slice(0, o));
    }
    for (const p of this.players) p.step = 0;
  }
}
const near = (ds, q) => ds.reduce((m, d) => dist(d.o, q) < dist(m.o, q) ? d : m);
const toLocal = (b, p) => { const r = sub(p, b.p); return [dot(r, b.u), dot(r, b.v)]; };
const toWorld = (b, l) => add(add(b.p, b.u, l[0]), b.v, l[1]);
function roomAt(b, l) { let best = 0, bd = 1e9; b.rooms.forEach((r, i) => { const dx = Math.max(r.x0 - l[0], 0, l[0] - r.x1), dy = Math.max(r.y0 - l[1], 0, l[1] - r.y1), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } }); return best; }
function lootArr(it) { return [it.id, it.k, it.x, it.r, it.n, Math.round(it.p[0] * 10) / 10, Math.round(it.p[1] * 10) / 10]; }
