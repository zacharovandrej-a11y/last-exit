// ===== СЕКТЫ (бывший LAST EXIT) — сервер (Cloudflare Worker + Durable Object) =====
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
      name: 'СЕКТЫ', short_name: 'СЕКТЫ', start_url: '/', display: 'fullscreen', orientation: 'landscape',
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

const AGENT_NAMES = ['Брат Пётр', 'Сестра Ада', 'Магистр', 'Агент Икс', 'Пророк', 'Дьякон', 'Сектант', 'Адепт', 'Инквизитор', 'Связной', 'Апостол', 'Оракул'];
const RANDN = (rnd, a) => a[Math.floor(rnd() * a.length)];

export class World {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.clients = new Set(); this.timer = null; this.tick = 0; this.t = 0;
    this.rnd = mkRng((Date.now() % 100000) + 7);
    this.objs = genWorld(); this.hq = sectHQ(this.objs);
    this.loot = new Map(); this.lootId = 1; this.lAdd = []; this.lDel = []; this.shots = [];
    this.ents = []; // все люди мира: игроки (h), агенты сект (a), жители (r); индекс = id
    this.box = [60, 60, 60, 60]; this.desT = [0, 0, 0, 0]; this.alarm = [null, null, null, null]; // ящики пожертвований, осквернение, тревога
    this.svc = [0, 1, 2, 3].map(s => ({ st: 0, T: 50 + s * 35, n: 0 })); // службы в церквях: 0 нет, 1 скоро, 2 идёт
    this.spawnWorld();
  }
  // ===== мир: жители по домам, агенты сект, лут =====
  spawnWorld() {
    const rnd = this.rnd, B = this.objs.blds;
    // комнаты для жителей (кроме штабов)
    const rooms = []; for (const b of B) if (!this.hq.includes(b.id)) b.rooms.forEach((r, ri) => rooms.push([b, ri]));
    for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }
    for (let i = 0; i < NRES && i < rooms.length * 2; i++) { const [b, ri] = rooms[i % rooms.length]; this.addResident(ID_R + i, b, ri); }
    // у каждой секты в начале немного сторонников рядом со штабом
    for (let s = 0; s < 4; s++) { const hp = B[this.hq[s]].p; this.ents.filter(e => e && e.kind === 'r' && e.sect < 0).sort((a, c) => dist(a.p, hp) - dist(c.p, hp)).slice(0, 6).forEach(e => { e.sect = s; e.slots[0] = { w: 1, r: 0, mag: 12 }; }); }
    for (let s = 0; s < 4; s++) for (let k = 0; k < 3; k++) this.addAgent(ID_A + s * 3 + k, s);
    // лут: патроны, аптечки, броня, редкое оружие; свечи Ордена — на улице, улики Заговора — в домах
    for (let i = 0; i < 90; i++) { const p = rndMap(rnd); if (!inMap(p, 40) || nearObjs(this.objs, p, 40).some(o => !o.nc && objPush(o, p, 8))) continue; this.addLoot(this.randLoot(rnd), p, true); }
    for (let i = 0; i < 45; i++) this.spawnPigeon(true);
    for (const b of B) for (const r of b.rooms) { if (rnd() > .5) continue; const p = this.roomPt(b, r, rnd); if (nearObjs(this.objs, p, 30).some(o => !o.nc && objPush(o, p, 8))) continue; this.addLoot(rnd() < .45 ? { k: 4, x: 2, r: 0, n: 2 } : this.randLoot(rnd), p, true); }
    this.lAdd = [];
  }
  // голубь: садится на улице (не в доме)
  spawnPigeon(silent, near_) {
    for (let k = 0; k < 20; k++) { const p = near_ ? clampMap(nearPt(this.rnd, near_, 300), 80) : rndMap(this.rnd, 80); if (bldAt(this.objs.blds, p) >= 0 || nearObjs(this.objs, p, 30).some(o => !o.nc && objPush(o, p, 8))) continue; return this.addLoot({ k: 4, x: 1, r: 0, n: 1 }, p, silent); }
  }
  roomPt(b, r, rnd) { return toWorld(b, [r.x0 + 14 + rnd() * Math.max(1, r.x1 - r.x0 - 28), r.y0 + 14 + rnd() * Math.max(1, r.y1 - r.y0 - 28)]); }
  newEnt(id, kind, name, ch, sect, p) {
    return this.ents[id] = { id, kind, name, ch, sect, p, aim: [0, 1], hp: 100, armor: 0, alive: true, slots: [null, null], cur: 0, ammo: [24, 0, 0, 0], meds: 0, relT: 0, cdT: 0, healT: 0,
      inputs: [], seq: 0, hist: new Array(32).fill(null), hm: [], kills: 0, hostile: new Map(), think: 0, stuck: 0, side: this.rnd() < .5 ? 1 : -1, skill: .3 + this.rnd() * .5, bloom: 0, actT: 0, act: -1 };
  }
  addResident(id, b, ri) {
    const rnd = this.rnd, kind = Math.floor(rnd() * CIVK.length), K = CIVK[kind];
    const e = this.newEnt(id, 'r', RANDN(rnd, K.names), 100 + kind, -1, this.roomPt(b, b.rooms[ri], rnd));
    e.pc = pickW(rnd, CHARS); e.home = b.id; e.room = ri; e.aff = K.aff.map(a => Math.max(0, Math.min(1, a + (rnd() - .5) * .3))); e.cool = 0; e.by = -1; e.lead = -1; e.wait = rnd() * 6;
    return e;
  }
  addAgent(id, s) {
    const B = this.objs.blds, d = B[this.hq[s]].doors[0];
    const e = this.newEnt(id, 'a', AGENT_NAMES[(id - ID_A) % AGENT_NAMES.length], CH_SECT + s, s, add(d.o, [this.rnd() * 40 - 20, this.rnd() * 40 - 20]));
    e.slots[0] = { w: 2, r: 0, mag: 30 }; e.ammo = [24, 90, 0, 0]; e.meds = 1;
  }
  spawnPt(s) { const d = this.objs.blds[this.hq[s]].doors[0]; return collide(this.objs, add(d.o, [this.rnd() * 50 - 25, this.rnd() * 50 - 25])); }
  // ===== сеть =====
  async fetch(req) {
    const { 0: cli, 1: ws } = new WebSocketPair(); ws.accept();
    const c = { ws, name: null, pl: null };
    if (this.clients.size >= 16) { ws.close(1013, 'full'); return new Response(null, { status: 101, webSocket: cli }); }
    this.clients.add(c);
    ws.addEventListener('message', e => this.onMsg(c, e.data));
    const bye = () => { if (!this.clients.has(c)) return; this.clients.delete(c); this.leave(c); };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.loop(), 25); }
    return new Response(null, { status: 101, webSocket: cli });
  }
  leave(c) { const p = c.pl; if (!p) return; this.ents[p.id] = null; for (const e of this.ents) if (e && e.lead === p.id) e.lead = -1; this.sendAll({ t: 'x', id: p.id }); c.pl = null; }
  send(c, m) { try { c.ws.send(typeof m === 'string' || m instanceof ArrayBuffer ? m : JSON.stringify(m)); } catch (e) { } }
  sendAll(o) { const s = JSON.stringify(o); for (const c of this.clients) if (c.pl) this.send(c, s); }
  toast(p, s, col) { if (p && p.c) this.send(p.c, { t: 'm', s, c: col || '#fff' }); }
  entArr(e) { return [e.id, e.name, e.ch, e.kind === 'h' ? 0 : e.kind === 'a' ? 1 : 2, e.pc || 0]; }
  onMsg(c, data) {
    if (typeof data === 'string') {
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'join' && !c.pl) {
        let id = -1; for (let i = ID_H; i < ID_A; i++) if (!this.ents[i]) { id = i; break; } if (id < 0) return;
        const s = Math.abs(m.sect | 0) % 4, name = String(m.name || 'Игрок').replace(/[<>]/g, '').slice(0, 12).trim() || 'Игрок';
        const p = this.newEnt(id, 'h', name, CH_SECT + s, s, this.spawnPt(s)); p.c = c; c.pl = p;
        p.slots[0] = { w: 1, r: 0, mag: 12 }; p.ammo = [36, 0, 0, 0]; p.meds = 1; p.money = 60; p.xp = 0; p.trust = 100; p.res = 10;
        this.send(c, { t: 'w', me: id, hq: this.hq, ents: this.ents.filter(Boolean).map(e => this.entArr(e)), loot: [...this.loot.values()].map(lootArr), dead: this.objs.filter(o => o.dead).map(o => o.id), ob: this.objs.filter(o => o.smoke || o.burnt).map(o => [o.id, o.burnt ? 2 : 1]), gl: this.objs.filter(o => o.broken).map(o => o.id) });
        this.sendAll({ t: 'e', a: [this.entArr(p)] }); this.score(true); this.svcSend(p.sect, p); this.desT.forEach((T, s) => { if (T > this.t) this.send(c, { t: 'des', s, T: Math.round(T - this.t) }); });
        this.toast(p, 'Ты в секте «' + SECTS[s].n + '». Вербуй жителей!', SECTS[s].col);
      } else if (m.t === 'buy' && c.pl && c.pl.alive) this.buy(c.pl, m.i | 0);
      else if (m.t === 'quit') { this.clients.delete(c); this.leave(c); try { c.ws.close(1000, 'quit'); } catch (e) { } }
      return;
    }
    const pl = c.pl; if (!pl || !pl.alive) return;
    const dv = new DataView(data); if (dv.byteLength < 2 || dv.getUint8(0) !== 1) return;
    const n = dv.getUint8(1);
    for (let i = 0, o = 2; i < n && o + 10 <= dv.byteLength; i++, o += 10) {
      if (pl.inputs.length > 30) pl.inputs.shift();
      pl.inputs.push({ seq: dv.getUint16(o, true), mv: [dv.getInt8(o + 2) / 127, dv.getInt8(o + 3) / 127], aim: [dv.getInt8(o + 4), dv.getInt8(o + 5)], fl: dv.getUint8(o + 6), vt: dv.getUint16(o + 7, true) + dv.getUint8(o + 9) / 256 });
    }
  }
  loop() {
    const now = Date.now(); this.acc += now - this.last; this.last = now;
    let n = 0; while (this.acc >= 1000 / TICK && n < 4) { this.acc -= 1000 / TICK; n++; this.step(); }
    if (this.acc > 500) this.acc = 0;
    if (!this.clients.size) { clearInterval(this.timer); this.timer = null; } // никого нет — мир спит
  }
  // ===== магазин в штабе =====
  atHQ(p) { const b = this.objs.blds[this.hq[p.sect]]; return p.bi === b.id || b.doors.some(d => dist(d.o, p.p) < 70); }
  buy(p, i) {
    const it = SHOP[i]; if (!it || !this.atHQ(p)) return;
    if (p.money < it.p) { this.toast(p, 'Не хватает денег', '#ff8787'); return; }
    if (it.noOrden && p.sect === 1) { this.toast(p, '🕊 Голубей не продают — лови на улице!', '#a259ff'); return; }
    if (it.n === 'res') p.res += 10; else if (it.n === 'Аптечка') { if (p.meds >= 5) return; p.meds++; } else if (it.n === 'Бронежилет') { if (p.armor >= 100) return; p.armor = 100; }
    else if (it.n === 'Патроны') { for (const s of p.slots) if (s) { const a = WEAPONS[s.w].ammo; p.ammo[a] = Math.min(AMMO_MAX[a], p.ammo[a] + AMMO_PACK[a] * 2); } }
    else if (it.w) { const W = WEAPONS[it.w], k = p.slots[1] ? p.cur : 1; p.slots[k] = { w: it.w, r: 1, mag: W.mag }; p.cur = k; p.ammo[W.ammo] = Math.min(AMMO_MAX[W.ammo], p.ammo[W.ammo] + AMMO_PACK[W.ammo] * 2); }
    p.money -= it.p; this.toast(p, it.i + ' куплено', '#69db7c');
  }
  randLoot(rnd) {
    const x = rnd();
    if (x < .1) { const WL = [1, 9, 2, 3, 5, 6, 8], w = WL[Math.floor(rnd() * WL.length)]; return { k: 0, x: w, r: Math.floor(rnd() * 3), n: WEAPONS[w].mag }; }
    if (x < .6) { const a = Math.floor(rnd() * 4); return { k: 1, x: a, r: 0, n: AMMO_PACK[a] }; }
    if (x < .85) return { k: 2, x: 0, r: 0, n: 1 };
    return { k: 3, x: 0, r: 0, n: 100 };
  }
  addLoot(it, p, silent) { it.id = this.lootId++; it.p = p; this.loot.set(it.id, it); if (!silent) this.lAdd.push(it); return it; }
  delLoot(it) { this.loot.delete(it.id); this.lDel.push(it.id); }
  dropNear(it, p) { const a = this.rnd() * 6.2832; return this.addLoot(it, collide(this.objs, add(p, [Math.cos(a), Math.sin(a)], 22))); }
  // ===== шаг мира =====
  step() {
    this.tick++; this.t += DT;
    for (const p of this.ents) {
      if (!p) continue;
      if (!p.alive) { if (p.kind !== 'r' && this.t > p.respT) this.respawn(p); continue; }
      p.cdT -= DT;
      if (p.relT > 0) { p.relT -= DT; if (p.relT <= 0) this.finishReload(p); }
      if (p.healT > 0) { p.healT -= DT; if (p.healT <= 0) { p.hp = Math.min(100, p.hp + 50); p.meds--; } }
      if (p.actT > 0) this.actStep(p);
      if (p.kind === 'h') { const k = p.inputs.length > 4 ? 2 : 1; for (let i = 0; i < k && p.inputs.length; i++) this.applyInput(p, p.inputs.shift()); }
      else if (p.kind === 'a') this.agentStep(p); else this.resStep(p);
      if (!p.alive) continue;
      const mvd = p.lastP ? dist(p.p, p.lastP) : 0; p.moving = mvd > 2;
      { const s_ = p.slots[p.cur]; p.bloom = Math.max(0, (p.bloom || 0) - (s_ ? WEAPONS[s_.w].rec : .5) * DT * (p.moving ? .5 : 1)); }
      if (mvd > 1.5) { p.mvDir = norm(sub(p.p, p.lastP)); p.stepT = (p.stepT || 0) + DT; if (p.stepT >= .35) { p.stepT = 0; p.step = 1; p.stepN = (p.stepN || 0) + 1; } } p.lastP = p.p;
      if (p.kind !== 'r') for (const it of this.loot.values()) if (dist(it.p, p.p) < PR + 14) this.pickup(p, it, false);
    }
    for (const p of this.ents) if (p) { p.hist[this.tick % 32] = p.p; p.bi = bldAt(this.objs.blds, p.p); }
    // пожертвования: раз в 20 с каждый завербованный тобой платит $1
    if (this.tick % (20 * TICK) === 0) for (const r of this.ents) if (r && r.kind === 'r' && r.alive && r.by >= 0) { const h = this.ents[r.by]; if (h && h.kind === 'h' && h.sect === r.sect) h.money += 1; }
    // новые жители вместо погибших
    if (this.tick % TICK === 0) this.svcStep();
    if (this.later && this.later.length) { const now_ = this.later.filter(l => l[0] <= this.t); this.later = this.later.filter(l => l[0] > this.t); for (const [, o, by] of now_) this.objHurt(o, by); }
    if (this.tick % (5 * TICK) === 0) for (const o of this.objs) { // восстановление: бочки, ящики, сгоревшие машины
      if (!o.fixT || this.t < o.fixT) continue;
      if (this.ents.some(e => e && e.alive && dist(e.p, o.p) < o.rad + PR + 4)) continue;
      o.fixT = 0; o.hp = OT[o.type].hp; if (o.dead) { o.dead = false; this.sendAll({ t: 'rv', id: o.id }); } if (o.burnt || o.smoke) { o.burnt = o.smoke = 0; this.sendAll({ t: 'ob', id: o.id, s: 0 }); } }
    if (this.tick % (15 * TICK) === 0) { const free = []; for (let i = ID_R; i < ID_R + NRES; i++) if (!this.ents[i] || !this.ents[i].alive) free.push(i); if (free.length) { const B = this.objs.blds.filter(b => !this.hq.includes(b.id)), b = B[Math.floor(this.rnd() * B.length)]; const e = this.addResident(free[0], b, Math.floor(this.rnd() * b.rooms.length)); this.sendAll({ t: 'e', a: [this.entArr(e)] }); } }
    if (this.tick % (2 * TICK) === 0) this.score();
    // голуби: пугаются бегущих людей и улетают; новых подсаживаем
    if (this.tick % 3 === 0) for (const it of [...this.loot.values()]) { if (it.k !== 4 || it.x !== 1) continue;
      for (const c of this.clients) { const h = c.pl; if (h && h.alive && h.moving && dist(h.p, it.p) < 70 && this.rnd() < (h.sect === 1 ? .05 : .25)) { this.delLoot(it); this.spawnPigeon(false, it.p); this.flyT = (this.flyT || 0) + 1; break; } } }
    if (this.tick % (8 * TICK) === 0 && [...this.loot.values()].filter(it => it.k === 4 && it.x === 1).length < 45) this.spawnPigeon(false);
    this.broadcast();
  }
  respawn(p) {
    p.alive = true; p.hp = 100; p.armor = 0; p.p = this.spawnPt(p.sect); p.relT = p.healT = p.actT = 0; p.hostile.clear(); p.bloom = 0;
    if (!p.slots[0]) p.slots[0] = { w: p.kind === 'a' ? 2 : 1, r: 0, mag: p.kind === 'a' ? 30 : 12 };
    if (p.kind === 'a') p.ammo = [24, 90, 0, 0]; else { p.ammo[0] = Math.max(p.ammo[0], 24); p.meds = Math.max(p.meds, 1); }
    this.sendAll({ t: 'rs', id: p.id });
  }
  // счёт сект и чьи дома
  score(force) {
    const n = [0, 0, 0, 0], own = this.objs.blds.map(() => [0, 0, 0, 0, 0]);
    for (const e of this.ents) if (e && e.alive && e.kind === 'r') { if (e.sect >= 0) n[e.sect]++; own[e.home][e.sect + 1]++; }
    const b = own.map((c, i) => { if (this.hq.includes(i)) return this.hq.indexOf(i); let best = -1, bv = 0; for (let s = 0; s < 4; s++) if (c[s + 1] > bv) { bv = c[s + 1]; best = s; } const tot = c.reduce((a, x) => a + x, 0); return bv * 2 > tot ? best : -1; });
    const key = n.join() + b.join(); if (!force && key === this.lastScore) return; this.lastScore = key;
    this.sendAll({ t: 'sc', n, b });
  }
  // ===== игрок =====
  applyInput(p, inp) {
    p.seq = inp.seq; const fl = inp.fl;
    if (fl & 16) { const s = (fl >> 5) & 1; if (s !== p.cur && p.slots[s]) { p.cur = s; p.relT = 0; p.cdT = Math.max(p.cdT, .25); } }
    const np = stepMove(this.objs, p.p, inp.mv, p.healT > 0 || p.actT > 0 ? .4 : 1); p.p = np;
    if (inp.aim[0] || inp.aim[1]) p.aim = norm(inp.aim);
    if (fl & 2) this.startReload(p);
    if (fl & 8) this.startHeal(p);
    if (fl & 4) this.useAction(p);
    if (fl & 64) this.desecrateStart(p);
    if (fl & 1) this.fire(p, inp.vt);
  }
  // кнопка «действие»: вербовать ближайшего жителя, иначе подобрать
  useAction(p) {
    if (p.actT > 0) return;
    // у алтаря: в чужой церкви — сменить веру, в своей — помолиться
    if (p.kind === 'h') { const cb = this.altarNear(p.p, 50);
      if (cb && this.desT[cb.sect] > this.t) { if (cb.sect === p.sect) { p.act = -7; p.actT = 5; p.actDur = 5; p.relT = 0; p.healT = 0; this.toast(p, '🛠 Восстанавливаешь алтарь…', SECTS[p.sect].col); } else this.toast(p, '💥 Алтарь осквернён', '#adb5bd'); return; }
      const xb = this.boxNear(p.p, 40); if (xb && !cb) { if (xb.sect === p.sect) this.toast(p, '📦 В ящике пожертвований $' + this.box[xb.sect], SECTS[p.sect].col); else if (this.box[xb.sect] < 5) this.toast(p, '📦 Ящик пуст', '#adb5bd'); else { p.act = -5; p.actT = 4; p.actDur = 4; p.relT = 0; p.healT = 0; p.robS = xb.sect; this.toast(p, '💰 Взламываешь ящик…', '#ffd43b'); } return; }
      if (cb) { if (cb.sect !== p.sect) { p.act = -3; p.actT = 3; p.actDur = 3; p.prayS = cb.sect; p.relT = 0; p.healT = 0; this.toast(p, '🙏 Молишься у алтаря «' + SECTS[cb.sect].n + '»…', SECTS[cb.sect].col); }
        else if (p.prayT > this.t) this.toast(p, '🙏 Ты уже молился — приходи позже или на службу', '#adb5bd');
        else { p.act = -4; p.actT = 2; p.actDur = 2; p.relT = 0; p.healT = 0; }
        return; } }
    // Тёмный Орден: ритуал — съесть голубя на людях; вербует сразу нескольких, остальные в ужасе
    if (p.kind === 'h' && p.sect === 1 && p.res > 0 && this.ents.some(r => r && r.kind === 'r' && r.alive && r.sect !== 1 && dist(r.p, p.p) < 140)) {
      p.actT = SECTS[1].rec; p.actDur = p.actT; p.act = -2; p.relT = 0; p.healT = 0;
      for (const r of this.ents) if (r && r.kind === 'r' && r.alive && dist(r.p, p.p) < 140) { r.talkBy = p.id; r.talkT = this.t + p.actT + .5; }
      return; }
    let best = null, bd = 1e9;
    for (const r of this.ents) if (r && r.kind === 'r' && r.alive && r.sect !== p.sect) { const d = dist(r.p, p.p); if (d < 50 && d < bd) { bd = d; best = r; } }
    if (best) {
      if (this.t < best.cool) { this.toast(p, best.name + ' не хочет разговаривать', '#ffa94d'); return; }
      if (p.kind === 'h' && p.res <= 0) { this.toast(p, 'Нет: ' + SECTS[p.sect].res + ' ' + SECTS[p.sect].ri, '#ff8787'); return; }
      p.actT = SECTS[p.sect].rec; p.actDur = p.actT; p.act = best.id; best.talkBy = p.id; best.talkT = this.t + p.actT + .5; p.relT = 0; p.healT = 0; return;
    }
    let li = null; bd = 1e9; for (const it of this.loot.values()) { const d = dist(it.p, p.p); if (d < PR + 30 && d < bd) { bd = d; li = it; } } if (li) this.pickup(p, li, true);
  }
  actStep(p) {
    if (p.act === -2) { p.actT -= DT; if (p.actT <= 0) this.ritual(p); return; }
    if (p.act === -5) { const xb = this.boxNear(p.p, 70); if (!xb) { p.actT = 0; return; } p.aim = dirTo(p.p, this.objs[xb.box].p); p.actT -= DT; if (p.actT <= 0) this.rob(p, xb.sect); return; }
    if (p.act === -6 || p.act === -7) { const cb = this.altarNear(p.p, 75); if (!cb) { p.actT = 0; return; } p.aim = dirTo(p.p, this.objs[cb.altar].p); p.actT -= DT; if (p.actT > 0) return;
      if (p.act === -6) this.desecrate(p, cb.sect); else this.restoreAltar(p, cb.sect); return; }
    if (p.act === -3 || p.act === -4) { const cb = this.altarNear(p.p, 75); if (!cb) { p.actT = 0; return; } p.aim = dirTo(p.p, this.objs[cb.altar].p); p.actT -= DT; if (p.actT > 0) return;
      if (p.act === -3) this.convert(p, p.prayS); else { p.prayT = this.t + 90; p.trust = Math.min(100, p.trust + 8); p.xp += 5; this.toast(p, '🙏 Вера крепнет: доверие +8', SECTS[p.sect].col); } return; }
    const r = this.ents[p.act];
    if (!r || !r.alive || dist(r.p, p.p) > 75 || r.sect === p.sect) { p.actT = 0; return; }
    p.aim = dirTo(p.p, r.p); r.aim = dirTo(r.p, p.p); r.talkT = this.t + .5;
    p.actT -= DT; if (p.actT > 0) return;
    this.recruitRoll(p, r); if (p.kind === 'a') p.restT = this.t + 12 + this.rnd() * 14; // агенту — передышка
  }
  ritual(p) {
    p.res--; let yes = 0, scared = 0; const s = p.sect, lvl = lvlOf(p.xp);
    for (const r of this.ents) {
      if (!r || r.kind !== 'r' || !r.alive || r.sect === s || dist(r.p, p.p) > 140 || !canSee(this.objs, p.p, r.p, p.bi ?? -1, r.bi ?? -1)) continue;
      const ch = (.12 + r.aff[s] * .45 + lvl * .02 - (r.sect >= 0 ? .15 : 0)) * (p.trust < 50 ? .7 : 1);
      if (this.rnd() < ch) { r.sect = s; r.by = p.id; r.cool = this.t + 5; r.hostile.clear(); if (!r.slots[0]) { r.slots[0] = { w: 1, r: 0, mag: 12 }; r.ammo[0] = 24; } yes++; this.say(r, '🕊 Тьма приняла меня!'); }
      else if (this.rnd() < .6) { r.aff[s] = Math.max(0, r.aff[s] - .08); r.panic = this.t + 6; r.cool = this.t + 10; scared++; this.say(r, '😱 Он ест голубя!'); }
    }
    p.money += yes * 12; const l0 = lvlOf(p.xp); p.xp += yes * 15;
    this.toast(p, '🕊 Ритуал: ' + (yes ? '+' + yes + ' в Орден' : 'никто не вступил') + (scared ? ', ' + scared + ' в ужасе' : ''), yes ? SECTS[s].col : '#ffa94d');
    if (lvlOf(p.xp) > l0) this.toast(p, '⭐ Уровень ' + lvlOf(p.xp) + '!', '#ffd43b');
    this.sendAll({ t: 'rit', p: [Math.round(p.p[0]), Math.round(p.p[1])] });
  }
  // фраза над головой (видят все рядом)
  say(e, s) { const m = JSON.stringify({ t: 'say', id: e.id, s }); for (const c of this.clients) if (c.pl && dist(c.pl.p, e.p) < VIEWD) this.send(c, m); }
  recruitRoll(p, r) {
    const s = p.sect, lvl = p.kind === 'h' ? lvlOf(p.xp) : 1;
    if (p.kind === 'h') p.res--;
    let ch = .2 + r.aff[s] * .55 + lvl * .03 - (r.sect >= 0 ? .2 : 0);
    if (p.kind === 'h' && p.trust < 50) ch -= .15;
    if (r.pc === 5 && r.sect >= 0) ch -= .3;
    if (r.faithT > this.t && r.sect >= 0) ch -= .2; // недавно был на службе // фанатика чужой секты почти не переманить
    if (this.rnd() < ch) {
      const old = r.sect; r.sect = s; r.by = p.id; r.lead = -1; r.cool = this.t + 5; r.aff[s] = Math.min(1, r.aff[s] + .1); r.hostile.clear();
      if (!r.slots[0]) { r.slots[0] = { w: 1, r: 0, mag: 12 }; r.ammo[0] = 24; }
      if (p.kind === 'h') { p.money += 15; const l0 = lvlOf(p.xp); p.xp += 20; this.toast(p, '✔ ' + r.name + ' вступил(а)! +$15', SECTS[s].col); if (lvlOf(p.xp) > l0) this.toast(p, '⭐ Уровень ' + lvlOf(p.xp) + '!', '#ffd43b'); }
      // переманил чужого — его секта рядом злится
      if (old >= 0) for (const a of this.ents) if (a && a.alive && a.sect === old && a.kind !== 'r' && dist(a.p, r.p) < 350) a.hostile.set(p.id, this.t + 25);
    } else {
      r.cool = this.t + 18; r.aff[s] = Math.max(0, r.aff[s] - .05);
      if (p.kind === 'h') {
        if (r.bi >= 0 && r.bi === p.bi && this.rnd() < .35) { const b = this.objs.blds[r.bi], d = near(b.doors, p.p); p.p = collide(this.objs, d.o); this.toast(p, '🚪 ' + r.name + ' выгнал(а) тебя из дома!', '#ffa94d'); for (const o of this.ents) if (o && o.kind === 'r' && o.home === b.id) o.aff[s] = Math.max(0, o.aff[s] - .04); }
        else this.toast(p, '✖ ' + r.name + ': «Не интересно»', '#ffa94d');
      }
    }
  }
  startReload(p) { const s = p.slots[p.cur]; if (!s || p.relT > 0) return; const W = WEAPONS[s.w]; if (s.mag >= W.mag || p.ammo[W.ammo] <= 0) return; p.relT = W.rel; p.healT = 0; }
  finishReload(p) { const s = p.slots[p.cur]; if (!s) return; const W = WEAPONS[s.w]; const take = Math.min(W.mag - s.mag, p.ammo[W.ammo]); s.mag += take; p.ammo[W.ammo] -= take; }
  startHeal(p) { if (p.meds > 0 && p.hp < 100 && p.healT <= 0) { p.healT = 2.5; p.relT = 0; p.actT = 0; } }
  pickup(p, it, manual) {
    if (it.k === 4) { if (p.kind !== 'h' || p.sect !== it.x) return; p.res += it.n; this.toast(p, it.x === 1 ? '🕊 Поймал голубя!' : SECTS[p.sect].ri + ' +' + it.n, SECTS[p.sect].col); }
    else if (it.k === 1) { const m = AMMO_MAX[it.x]; if (p.ammo[it.x] >= m) return; p.ammo[it.x] = Math.min(m, p.ammo[it.x] + it.n); }
    else if (it.k === 2) { if (p.meds >= 5) return; p.meds++; }
    else if (it.k === 3) { if (p.armor >= it.n) return; p.armor = it.n; }
    else if (it.k === 5) { if (p.kind !== 'h') return; p.money += it.n; this.toast(p, '💵 +$' + it.n, '#69db7c'); }
    else {
      const empty = p.slots.findIndex(s => !s);
      if (empty >= 0) { p.slots[empty] = { w: it.x, r: it.r, mag: it.n }; p.cur = empty; p.relT = 0; }
      else if (manual) { const old = p.slots[p.cur]; p.slots[p.cur] = { w: it.x, r: it.r, mag: it.n }; p.relT = 0; this.delLoot(it); this.dropNear({ k: 0, x: old.w, r: old.r, n: old.mag, by: p.id }, p.p); return; }
      else return;
    }
    this.delLoot(it);
  }
  posAt(q, vt) { const a = Math.floor(vt), f = vt - a; const pa = q.hist[a % 32], pb = q.hist[(a + 1) % 32]; if (!pa) return q.p; if (!pb || f <= 0) return pa; return lerp(pa, pb, f); }
  fire(p, vt) {
    const s = p.slots[p.cur]; if (!s || p.relT > 0 || p.cdT > 0) return;
    p.healT = 0; p.actT = 0;
    const W = WEAPONS[s.w];
    if (s.mag <= 0) { this.startReload(p); return; }
    s.mag--; p.cdT = 1 / W.rate;
    let rt = this.tick;
    if (p.kind === 'h') { let v = (this.tick & ~0xffff) + vt; if (v > this.tick) v -= 65536; rt = Math.max(this.tick - 6, Math.min(this.tick, v)); }
    const side = perp(p.aim), sk = p.kind === 'h' ? 1 : (1.8 + (1 - p.skill) * 2.6), spr = curSpread(W, p.bloom || 0, p.moving);
    for (let k = 0; k < W.pel; k++) {
      const sp = spr * sk * (W.pel > 1 ? (k / (W.pel - 1) - .5) * 2 + (this.rnd() - .5) * .3 : (this.rnd() - .5) * 2);
      const d = norm(add(p.aim, side, sp)), h = this.hitscan(p, d, W.range, rt);
      this.shots.push([p.id, s.w | (s.r << 4) | (h.pl ? 128 : 0), h.end, p.p]);
      const dmg = W.dmg * RMULT[s.r] * (1 - W.fall * Math.max(0, (h.dist / W.range - .4) / .6));
      if (h.pl) this.damage(h.pl, dmg, p, s.w);
      else if (h.obj && h.obj.hp > 0) { h.obj.hp -= dmg; p.hm.push([255, Math.round(dmg)]); this.objHurt(h.obj, p); }
      for (const o of rayObjs(this.objs, p.p, d, h.dist)) if (o.win && !o.broken && rayObj(p.p, d, o) < h.dist) { o.broken = 1; this.sendAll({ t: 'gl', id: o.id }); } // стёкла бьются
    }
    p.bloom = Math.min(W.maxB, (p.bloom || 0) + W.bloom);
    // выстрел пугает жителей рядом
    for (const r of this.ents) if (r && r.kind === 'r' && r.alive) { const d = dist(r.p, p.p); if (r.pc === 4 ? d < 480 : !r.slots[r.cur] && d < 300) r.panic = Math.max(r.panic || 0, this.t + (r.pc === 4 ? 12 : 6)); }
    if (s.mag <= 0) this.startReload(p);
  }
  hitscan(p, d, range, rt) {
    const from = p.p; let best = range, obj = null, pl = null;
    for (const o of rayObjs(this.objs, from, d, range)) { if (o.dead || o.pass || o.type === 'snowman') continue; const t = rayObj(from, d, o); if (t < best) { best = t; obj = o; } }
    for (const q of this.ents) {
      if (!q || !q.alive || q === p) continue; const qp = rt === this.tick ? q.p : this.posAt(q, rt);
      if (Math.abs(qp[0] - from[0]) > range + 20 || Math.abs(qp[1] - from[1]) > range + 20) continue;
      const t = rayCircle(from, d, qp, PR + 3); if (t < best && (t > 4 || dist(qp, from) > PR)) { best = t; pl = q; obj = null; }
    }
    return { end: add(from, d, best), obj, pl, dist: best };
  }
  // повреждение предметов: ящик ломается, бочка взрывается, машина дымит, горит и взрывается
  objHurt(o, by) {
    if (o.type === 'crate') { if (o.hp <= 0) this.breakCrate(o); return; }
    if (o.type === 'car' || o.type === 'truck') {
      if (o.hp < OT[o.type].hp * .5 && !o.smoke && !o.burnt) { o.smoke = 1; this.sendAll({ t: 'ob', id: o.id, s: 1 }); }
      if (o.hp <= 0 && !o.burnt) { o.burnt = 1; o.fixT = this.t + 180; this.sendAll({ t: 'ob', id: o.id, s: 2 }); this.explode(o.p, by, 130, 110); }
      return; }
    if (o.type === 'barrel' && o.hp <= 0 && !o.dead) { o.dead = true; o.fixT = this.t + 120; this.sendAll({ t: 'cr', id: o.id, boom: 1 }); this.explode(o.p, by, 110, 95); }
  }
  // взрыв: урон по радиусу, цепная реакция бочек и машин, ящики разлетаются
  explode(c, by, R, dmg) {
    this.sendAll({ t: 'boom', p: [Math.round(c[0]), Math.round(c[1])], r: R });
    for (const e of this.ents) if (e && e.alive) { const d = dist(e.p, c); if (d < R) { const k = 1 - d / R; this.damage(e, dmg * k * k + 8, by && by.alive !== undefined ? by : null, 0); if (e.kind === 'r') e.panic = this.t + 10; } }
    for (const r of this.ents) if (r && r.alive && r.kind === 'r' && dist(r.p, c) < 500) r.panic = Math.max(r.panic || 0, this.t + 6);
    for (const o of nearObjs(this.objs, c, R)) { if (o.dead || !(o.hp > 0) || dist(o.p, c) > R * .8) continue; if (o.type === 'barrel' || o.type === 'crate') { o.hp = 0; (this.later = this.later || []).push([this.t + .15 + this.rnd() * .2, o, by]); } else if ((o.type === 'car' || o.type === 'truck') && !o.burnt) { o.hp -= dmg * .8; (this.later = this.later || []).push([this.t + .3, o, by]); } }
  }
  breakCrate(o) { o.dead = true; o.fixT = this.t + 150; this.sendAll({ t: 'cr', id: o.id }); for (let i = 0; i < 2; i++) this.dropNear(this.randLoot(this.rnd), o.p); if (this.rnd() < .5) this.dropNear({ k: 5, x: 0, r: 0, n: 5 + Math.floor(this.rnd() * 15) }, o.p); }
  damage(v, dmg, by, w) {
    if (!v.alive) return;
    if (v.armor > 0) { const a = Math.min(v.armor, dmg * .6); v.armor -= a; dmg -= a; }
    v.hp -= dmg;
    if (by) {
      by.hm.push([v.id, Math.max(1, Math.round(dmg))]);
      // враждебность: пострадавший и его секта рядом запоминают обидчика
      v.hostile.set(by.id, this.t + 30); v.panic = this.t + 5;
      if (v.sect >= 0) for (const a of this.ents) if (a && a.alive && a !== by && a.sect === v.sect && dist(a.p, v.p) < 350) a.hostile.set(by.id, this.t + 20);
      // доверие: стреляешь по своим — оно падает, свои перебегают
      if (by.kind === 'h' && v.sect === by.sect && v !== by) {
        by.trust = Math.max(0, by.trust - dmg * .5);
        if (v.kind === 'r' && v.hp > 0) this.ownHurt(by, v);
        if (by.trust < 40) for (const r of this.ents) if (r && r.alive && r.kind === 'r' && r.sect === by.sect && r.by === by.id && r.pc !== 5 && dist(r.p, by.p) < 260 && this.rnd() < .25) { r.sect = -1; r.by = -1; r.lead = -1; }
      }
    }
    if (v.hp <= 0) this.kill(v, by, w);
  }
  boxNear(q, r) { for (const bi of this.hq) { const b = this.objs.blds[bi]; if (b.box !== undefined && dist(this.objs[b.box].p, q) < r) return b; } return null; }
  // тревога: вся секта охотится за обидчиком
  raise(s, p, sec) {
    for (const a of this.ents) if (a && a.alive && a.sect === s && a.kind !== 'h') { if (a.kind === 'a' || a.slots[a.cur]) { a.hostile.set(p.id, this.t + sec); a.hunt = p.id; a.huntT = this.t + sec; } else a.panic = this.t + 8; }
    this.alarm[s] = { id: p.id, until: this.t + sec };
    this.toast(p, '🚨 Вся секта «' + SECTS[s].n + '» охотится за тобой!', '#ff6b6b');
  }
  rob(p, s) {
    const m = this.box[s]; this.box[s] = 0; p.money += m; p.xp += 15;
    this.toast(p, '💰 Украл $' + m + ' из ящика «' + SECTS[s].n + '»', '#ffd43b');
    for (const c of this.clients) if (c.pl && c.pl.sect === s) this.toast(c.pl, '🚨 ' + p.name + ' ограбил(а) нашу церковь! Догони!', '#ff6b6b');
    this.raise(s, p, 90);
  }
  desecrateStart(p) {
    if (p.kind !== 'h' || p.actT > 0) return; const cb = this.altarNear(p.p, 50);
    if (!cb || cb.sect === p.sect) return; if (this.desT[cb.sect] > this.t) { this.toast(p, '💥 Алтарь уже осквернён', '#adb5bd'); return; }
    p.act = -6; p.actT = 3; p.actDur = 3; p.relT = 0; p.healT = 0; this.toast(p, '💥 Оскверняешь алтарь…', '#ff6b6b');
  }
  desecrate(p, s) {
    this.desT[s] = this.t + 180; const S = this.svc[s]; S.st = 0; S.T = this.desT[s] + 20; S.n = 0; for (const r of this.ents) if (r && r.svc === s) { r.svc = -1; r.svcP = null; r.wp = null; }
    const pool = this.ents.filter(r => r && r.kind === 'r' && r.alive && r.sect === s && r.pc !== 5); let lost = 0;
    for (const r of pool) if (lost < 8 && this.rnd() < .15) { lost++; r.sect = -1; r.by = -1; r.lead = -1; if (lost <= 2) this.say(r, '💔 Святыня осквернена… я ухожу'); }
    const l0 = lvlOf(p.xp); p.xp += 40; p.money += 25;
    this.toast(p, '💥 Алтарь «' + SECTS[s].n + '» осквернён! ' + (lost ? lost + ' потеряли веру' : 'паства держится'), '#ff6b6b'); if (lvlOf(p.xp) > l0) this.toast(p, '⭐ Уровень ' + lvlOf(p.xp) + '!', '#ffd43b');
    for (const c of this.clients) if (c.pl && c.pl.sect === s) this.toast(c.pl, '💥 ' + p.name + ' осквернил(а) наш алтарь! Восстанови его и отомсти!', '#ff6b6b');
    this.sendAll({ t: 'des', s, T: 180 }); this.svcSend(s); this.raise(s, p, 120);
  }
  restoreAltar(p, s) {
    this.desT[s] = 0; this.svc[s].T = Math.min(this.svc[s].T, this.t + 30); const l0 = lvlOf(p.xp); p.xp += 20; p.trust = Math.min(100, p.trust + 10);
    this.sendAll({ t: 'des', s, T: 0 }); for (const c of this.clients) if (c.pl && c.pl.sect === s) this.toast(c.pl, '🛠 ' + p.name + ' восстановил(а) алтарь!', SECTS[s].col); if (lvlOf(p.xp) > l0) this.toast(p, '⭐ Уровень ' + lvlOf(p.xp) + '!', '#ffd43b');
  }
  altarNear(q, r) { for (const bi of this.hq) { const b = this.objs.blds[bi]; if (b.altar !== undefined && dist(this.objs[b.altar].p, q) < r) return b; } return null; }
  // смена веры: молитва у алтаря чужой церкви
  convert(p, s) {
    const old = p.sect; if (s === old) return;
    p.sect = s; p.ch = CH_SECT + s; p.trust = 50; p.res = 0;
    for (const a of this.ents) if (a && a.alive && a.sect === old && a.kind !== 'h' && (a.kind === 'a' || a.slots[a.cur])) a.hostile.set(p.id, this.t + 60);
    for (const r of this.ents) if (r && r.by === p.id) r.by = -1;
    this.sendAll({ t: 'e', a: [this.entArr(p)] });
    this.toast(p, '🙏 Теперь ты в «' + SECTS[s].n + '»', SECTS[s].col); this.toast(p, '⚠ Старая секта «' + SECTS[old].n + '» теперь считает тебя предателем!', '#ff6b6b');
    for (const c of this.clients) if (c.pl && c.pl !== p && c.pl.sect === old) this.toast(c.pl, '⚠ ' + p.name + ' предал(а) нас и ушёл в «' + SECTS[s].n + '»', '#ff6b6b');
    this.svcSend(s);
  }
  // службы: раз в ~3 минуты; сторонники идут в церковь, игрок на службе получает награду
  svcSend(s, only) { const S = this.svc[s], m = { t: 'svc', st: S.st, T: Math.max(0, Math.round(S.T - this.t)), n: S.n }; for (const c of this.clients) if (c.pl && c.pl.sect === s && (!only || c.pl === only)) this.send(c, m); }
  svcStep() {
    for (let s = 0; s < 4; s++) {
      if (this.desT[s] && this.t > this.desT[s]) { this.desT[s] = 0; this.sendAll({ t: 'des', s, T: 0 }); }
      if (this.tick % (30 * TICK) === 0) { const n = this.ents.filter(r => r && r.alive && r.kind === 'r' && r.sect === s).length; this.box[s] = Math.min(500, this.box[s] + Math.round(n * .6)); }
      const A = this.alarm[s]; if (A) { const q = this.ents[A.id]; if (this.t > A.until || !q || !q.alive) this.alarm[s] = null; else for (const c of this.clients) if (c.pl && c.pl.sect === s && c.pl !== q) this.send(c, { t: 'wit', id: q.id, p: [Math.round(q.p[0]), Math.round(q.p[1])], i: '🚨' }); }
    }
    this.svc.forEach((S, s) => {
      const b = this.objs.blds[this.hq[s]];
      if (S.st === 0 && this.desT[s] > this.t) return; // осквернённый алтарь — служб нет
      if (S.st === 2) { S.n = this.ents.filter(r => r && r.kind === 'r' && r.alive && r.svc === s && r.bi === b.id).length; if (this.tick % (5 * TICK) === 0) this.svcSend(s); }
      if (this.t < S.T) return;
      if (S.st === 0) { S.st = 1; S.T = this.t + 20; S.n = 0;
        for (const r of this.ents) if (r && r.kind === 'r' && r.alive && r.sect === s && !r.gossip && dist(r.p, b.p) < 1300 && this.rnd() < (r.pc === 5 ? 1 : r.pc === 4 ? .45 : .75)) { r.svc = s; r.svcP = null; r.wp = null; }
        for (const c of this.clients) if (c.pl && c.pl.sect === s) this.toast(c.pl, '⛪ Через 20 с служба в церкви — приходи!', SECTS[s].col);
      } else if (S.st === 1) { S.st = 2; S.T = this.t + 40;
        for (const c of this.clients) if (c.pl && c.pl.sect === s) this.toast(c.pl, '⛪ Служба началась', SECTS[s].col);
      } else {
        const att = this.ents.filter(r => r && r.kind === 'r' && r.alive && r.svc === s && r.bi === b.id); let said = 0; this.box[s] = Math.min(500, this.box[s] + 5 * att.length);
        for (const r of att) { r.aff[s] = Math.min(1, r.aff[s] + .1); r.faithT = this.t + 300; if (said < 3 && this.rnd() < .4) { said++; this.say(r, RANDN(this.rnd, SECTS[s].hi)); } }
        for (const r of this.ents) if (r && r.svc === s) { r.svc = -1; r.svcP = null; r.wp = null; r.wait = this.rnd() * 3; }
        for (const c of this.clients) { const h = c.pl; if (!h || !h.alive || h.sect !== s) continue;
          if (h.bi === b.id) { const n = att.length, l0 = lvlOf(h.xp); h.money += 10 + 4 * n; h.xp += 10 + 6 * n; h.trust = Math.min(100, h.trust + 10); h.prayT = 0;
            this.toast(h, '⛪ Служба: ' + n + ' прихожан · +$' + (10 + 4 * n) + ' · доверие +10', SECTS[s].col); if (lvlOf(h.xp) > l0) this.toast(h, '⭐ Уровень ' + lvlOf(h.xp) + '!', '#ffd43b'); }
          else this.toast(h, '⛪ Служба прошла без тебя (' + att.length + ' прихожан)', '#adb5bd'); }
        S.st = 0; S.T = this.t + 150 + this.rnd() * 40; S.n = 0;
      }
      this.svcSend(s);
    });
  }
  // свой игрок выстрелил по своему жителю: реакция зависит от характера
  ownHurt(by, v) {
    const nm = v.name, leave = () => { v.sect = -1; v.by = -1; v.lead = -1; };
    switch (v.pc) {
      case 1: leave(); v.gossip = { by: by.id, sect: by.sect, n: 0, until: this.t + 45, told: [], tgt: -1, sayT: 0 }; v.hostile.clear();
        this.say(v, '🗣 Он стреляет в своих!'); this.toast(by, '🗣 ' + nm + ' бежит рассказать соседям! Догони!', '#ff6b6b'); break;
      case 2: { const ns = (by.sect + 1 + Math.floor(this.rnd() * 3)) % 4; v.sect = ns; v.by = -1; v.lead = -1; v.hostile.set(by.id, this.t + 120); v.panic = 0;
        if (!v.slots[0]) { v.slots[0] = { w: 1, r: 0, mag: 12 }; v.ammo[0] = 36; } this.say(v, '😠 Ты пожалеешь!'); this.toast(by, '😠 ' + nm + ' ушёл(ла) в «' + SECTS[ns].n + '» и мстит!', '#ff6b6b'); break; }
      case 3: leave(); this.say(v, '😐 Да ну вас всех…'); this.toast(by, '😐 ' + nm + ' ушёл(ла) из секты', '#ffa94d'); break;
      case 4: leave(); v.panic = this.t + 20; v.hostile.clear(); this.say(v, '😰 Не стреляй!!'); this.toast(by, '😰 ' + nm + ' в ужасе сбежал(а) из секты', '#ffa94d'); break;
      case 5: v.hostile.delete(by.id); v.panic = 0; this.say(v, '🔥 Прощаю тебя, брат!'); break;
      default: if (this.rnd() < (90 - by.trust) / 90) { const ns = (by.sect + 1 + Math.floor(this.rnd() * 3)) % 4; v.sect = ns; v.by = -1; v.lead = -1; v.hostile.set(by.id, this.t + 60); this.toast(by, '⚠ ' + nm + ' перешёл(шла) в «' + SECTS[ns].n + '»!', '#ff6b6b'); }
    }
  }
  // кто-то видел убийство — может стать новым свидетелем
  witness(by, v) {
    let best = null, bd = 230;
    for (const r of this.ents) if (r && r.kind === 'r' && r.alive && r !== v && r.pc !== 5 && !r.gossip && r.sect === by.sect) { const d = dist(r.p, v.p); if (d < bd && canSee(this.objs, r.p, v.p, r.bi ?? -1, v.bi ?? -1)) { bd = d; best = r; } }
    if (!best || this.rnd() > .6) return;
    best.sect = -1; best.by = -1; best.lead = -1; best.gossip = { by: by.id, sect: by.sect, n: 0, until: this.t + 45, told: [], tgt: -1, sayT: 0 };
    this.say(best, '👀 Я всё видел(а)!'); this.toast(by, '👀 ' + best.name + ' всё видел(а) и бежит рассказать!', '#ff6b6b');
  }
  // болтун бегает по соседям своей бывшей секты и рассказывает — те уходят
  gossipStep(r) {
    const G = r.gossip; if (this.t > G.until || G.n >= 3) { r.gossip = null; return false; }
    let T = this.ents[G.tgt];
    if (!T || !T.alive || T.sect !== G.sect) { G.tgt = -1; let bd = 520; for (const o of this.ents) if (o && o.kind === 'r' && o.alive && o !== r && o.sect === G.sect && !G.told.includes(o.id)) { const d = dist(o.p, r.p); if (d < bd) { bd = d; G.tgt = o.id; } } T = this.ents[G.tgt]; if (!T) { r.gossip = null; return false; } }
    if (this.tick % 8 === 0) { const h = this.ents[G.by]; if (h && h.c) this.send(h.c, { t: 'wit', id: r.id, p: [Math.round(r.p[0]), Math.round(r.p[1])] }); }
    if (this.t > G.sayT) { G.sayT = this.t + 3.5; this.say(r, '🗣 ' + RANDN(this.rnd, ['Он стреляет в своих!', 'Все сюда! Беда!', 'Не верьте ему!'])); }
    if (dist(T.p, r.p) < 38) {
      G.told.push(T.id); G.n++; T.aim = dirTo(T.p, r.p); T.wait = 2;
      if (T.pc === 5) this.say(T, '🔥 Враньё! Не верю!');
      else if (this.rnd() < .75) { T.sect = -1; T.by = -1; T.lead = -1; this.say(T, '😨 Правда?! Я ухожу!'); const h = this.ents[G.by]; if (h && h.alive) { h.trust = Math.max(0, h.trust - 5); this.toast(h, '🗣 ' + T.name + ' узнал(а) и ушёл(ла) из секты', '#ff6b6b'); } }
      else this.say(T, '🤔 Хм… не может быть');
      G.tgt = -1;
    } else this.move(r, T.p, 1);
    return true;
  }
  kill(v, by, w) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; v.actT = 0; v.respT = this.t + (v.kind === 'h' ? 5 : 30);
    if (by) by.kills++;
    for (const s of v.slots) if (s && v.kind !== 'h') this.dropNear({ k: 0, x: s.w, r: s.r, n: s.mag }, v.p);
    if (v.kind === 'h') { const lost = Math.floor(v.money * .3); v.money -= lost; if (lost > 0) this.dropNear({ k: 5, x: 0, r: 0, n: lost }, v.p); }
    if (v.kind === 'a') this.dropNear({ k: 5, x: 0, r: 0, n: 15 + Math.floor(this.rnd() * 20) }, v.p);
    if (v.meds) this.dropNear({ k: 2, x: 0, r: 0, n: 1 }, v.p);
    if (by && by.kind === 'h') {
      if (v.kind === 'a' && v.sect !== by.sect) { by.xp += 10; }
      if (v.kind === 'r' && v.sect < 0) { for (const r of this.ents) if (r && r.kind === 'r' && r.alive && dist(r.p, v.p) < 320) r.aff[by.sect] = Math.max(0, r.aff[by.sect] - .1); this.toast(by, '😨 Жители боятся тебя', '#ff8787'); }
      if (v.sect === by.sect) by.trust = Math.max(0, by.trust - 25);
      if (v.kind === 'r' && v.gossip && v.gossip.by === by.id) { this.toast(by, '🤫 ' + v.name + ' уже никому не расскажет', '#adb5bd'); this.witness(by, v); }
      else if (v.kind === 'r' && v.sect === by.sect) this.witness(by, v);
    }
    this.sendAll({ t: 'k', k: by ? by.id : -1, v: v.id, w });
    if (v.kind === 'h' && v.c) this.send(v.c, { t: 'dead', by: by ? by.id : -1 });
  }
  // ===== цели и бой для агентов и жителей =====
  enemyOf(e) {
    let best = null, bd = 1e9;
    for (const [id, until] of e.hostile) { if (until < this.t) { e.hostile.delete(id); continue; } const q = this.ents[id]; if (!q || !q.alive) continue; const d = dist(q.p, e.p); if (d < bd) { bd = d; best = q; } }
    // свита: враги лидера — мои враги
    if (e.lead >= 0) { const L = this.ents[e.lead]; if (L) for (const [id, until] of L.hostile) { if (until < this.t) continue; const q = this.ents[id]; if (q && q.alive) { const d = dist(q.p, e.p); if (d < bd) { bd = d; best = q; } } } }
    return best && (bd < 520 || (e.hunt === best.id && e.huntT > this.t)) ? best : null;
  }
  shootAt(e, t, W) {
    const to = dirTo(e.p, t.p), err = (1 - e.skill) * .25 * Math.sin(this.t * 2.3 + e.id);
    e.aim = norm(add(to, perp(to), err));
    const h = this.hitscan(e, to, Math.min(dist(e.p, t.p) + 10, 900), this.tick), los = h.pl === t;
    if (e.react > 0) { e.react--; return los; }
    if (W && los && dist(e.p, t.p) < W.range * .95 && this.rnd() < .18 + e.skill * .2) this.fire(e, 0);
    return los;
  }
  move(e, target, speed = .9) {
    if (!target) return;
    let mv = dirTo(e.p, this.nav(e, target)); if (dist(e.p, target) < 4) return;
    if (e.stuck > 0) { mv = norm(add(mv, perp(mv), e.side * 1.6)); e.stuck--; }
    // плавно: разгон и поворот по дуге (боты не дёргаются)
    if (this.tick - (e.mvTick || 0) > 2) { e.spd = 0; e.mvd = mv; } e.mvTick = this.tick;
    { const m = lerp(e.mvd || mv, mv, e.stuck > 0 ? .7 : .38); e.mvd = len(m) > .05 ? norm(m) : mv; }
    e.spd = (e.spd || 0) + (speed - (e.spd || 0)) * .3;
    const np = stepMove(this.objs, e.p, e.mvd, e.spd); mv = e.mvd;
    if (e.spd > speed * .6 && dist(np, e.p) < SPEED * DT * e.spd * .3) { e.stuck = 12; if (this.rnd() < .3) e.side *= -1; } e.p = np;
    if (!e.fight) e.aim = norm(lerp(e.aim, mv, .2));
  }
  agentStep(a) {
    const s = a.slots[a.cur], W = s ? WEAPONS[s.w] : null;
    if (s && s.mag <= 0) this.startReload(a);
    const t = this.enemyOf(a); a.fight = !!t;
    if (t) { if (a.tgt !== t.id) a.react = Math.round((.4 + (1 - a.skill) * .6) * TICK); a.tgt = t.id; const los = this.shootAt(a, t, W);
      const d = dist(a.p, t.p); if (!los) this.move(a, t.p); else if (d > (W ? W.range * .55 : 200)) this.move(a, t.p, .7); return; }
    if (a.hp < 60 && a.meds > 0) this.startHeal(a);
    if (a.actT > 0) return;
    // вербовка: ближайший подходящий житель
    if (!a.goal || --a.think <= 0) {
      a.think = 40; let best = null, bd = 1e9;
      for (const r of this.ents) if (r && r.kind === 'r' && r.alive && r.sect !== a.sect && this.t >= r.cool && !(r.talkT > this.t)) { const d = dist(r.p, a.p) / (.3 + r.aff[a.sect]) * (r.sect >= 0 ? 1.6 : 1); if (d < bd) { bd = d; best = r; } }
      a.goal = best ? best.id : -1;
      if (!best && (!a.wp || dist(a.wp, a.p) < 40)) a.wp = clampMap(nearPt(this.rnd, a.p, 500), 100);
    }
    const g = this.ents[a.goal];
    if (g && g.alive && g.sect !== a.sect && this.t >= g.cool && !(a.restT > this.t)) { if (dist(g.p, a.p) < 42) { a.actT = SECTS[a.sect].rec * 1.6; a.actDur = a.actT; a.act = g.id; g.talkBy = a.id; g.talkT = this.t + a.actT + .5; } else this.move(a, g.p, .8); }
    else { a.goal = -1; this.move(a, a.wp, .6); }
  }
  resStep(r) {
    if (r.talkT > this.t) return; // с ним разговаривают
    const s = r.slots[r.cur], W = s ? WEAPONS[s.w] : null;
    if (s && s.mag <= 0) this.startReload(r);
    if (r.gossip && this.gossipStep(r)) return;
    const t = W && r.pc !== 4 ? this.enemyOf(r) : null; r.fight = !!t;
    if (t) { if (r.tgt !== t.id) r.react = Math.round((.6 + (1 - r.skill)) * TICK / 2); r.tgt = t.id; const los = this.shootAt(r, t, W); if (!los) this.move(r, t.p, .8); return; }
    // паника: бежит домой
    const home = this.objs.blds[r.home];
    if (r.panic > this.t && (!W || r.pc === 4)) { if (r.bi !== r.home) this.move(r, home.rooms[r.room] ? this.roomCenter(home, r.room) : home.p, 1); return; }
    // свой игрок проходит мимо — поздороваться и немного пройтись рядом
    if (r.sect >= 0 && !(r.greetT > this.t)) for (const c of this.clients) { const h = c.pl; if (h && h.alive && h.sect === r.sect && dist(h.p, r.p) < 90 && canSee(this.objs, r.p, h.p, r.bi ?? -1, h.bi ?? -1)) { r.greetT = this.t + 50 + this.rnd() * 40; r.lead = h.id; r.leadT = this.t + 4 + this.rnd() * 3; this.say(r, RANDN(this.rnd, SECTS[r.sect].hi)); break; } }
    if (r.lead >= 0) { const L = this.ents[r.lead]; if (!L || !L.alive || this.t > r.leadT) r.lead = -1; else { const d = dist(L.p, r.p); if (d > 50) this.move(r, add(L.p, dirTo(L.p, r.p), 36), .9); return; } }
    // служба: идёт в церковь и стоит в проходе лицом к алтарю
    if (r.svc >= 0) { const S = this.svc[r.svc];
      if (r.sect !== r.svc || !S || S.st === 0) r.svc = -1;
      else { const b = this.objs.blds[this.hq[r.svc]], R = b.rooms[0];
        if (!r.svcP) r.svcP = toWorld(b, [R.x0 + 30 + this.rnd() * (R.x1 - R.x0 - 80), (R.y0 + R.y1) / 2 + (this.rnd() - .5) * 26]);
        if (dist(r.p, r.svcP) > 12 && r.stuck < 80) this.move(r, r.svcP, .75); else if (b.altar !== undefined) r.aim = dirTo(r.p, this.objs[b.altar].p);
        return; } }
    // иногда сторонник идёт в свою церковь
    if (r.sect >= 0 && !r.wp && this.rnd() < .002) { const hb = this.objs.blds[this.hq[r.sect]]; r.wp = this.roomPt(hb, hb.rooms[Math.floor(this.rnd() * hb.rooms.length)], this.rnd); }
    // к нему подошёл человек из другой секты — останавливается и слушает
    for (const c of this.clients) { const h = c.pl; if (h && h.alive && h.sect !== r.sect && dist(h.p, r.p) < 55) { r.wp = null; r.wait = Math.max(r.wait, 1.5); r.aim = dirTo(r.p, h.p); return; } }
    // обычная жизнь: стоит, ходит по своим комнатам, иногда выходит на улицу
    r.wait -= DT; if (r.wait > 0 && !r.wp) return;
    if (!r.wp) { if (this.rnd() < .25) { const d = home.doors[Math.floor(this.rnd() * home.doors.length)]; r.wp = clampMap(nearPt(this.rnd, d.o, 110), 80); } else { const ri = Math.floor(this.rnd() * home.rooms.length); r.wp = this.roomPt(home, home.rooms[ri], this.rnd); } }
    this.move(r, r.wp, .45);
    if (dist(r.p, r.wp) < 12 || r.stuck > 40) { r.wp = null; r.wait = 2 + this.rnd() * 7; r.stuck = 0; }
  }
  // обход зданий снаружи: если прямой путь упирается в дом — идём через ближний угол
  around(a, t) {
    const B = this.objs.blds, d = dist(a, t), n = Math.min(10, Math.ceil(Math.min(d, 320) / 32)); let hit = -1;
    for (let i = 1; i <= n; i++) { const q = lerp(a, t, Math.min(1, i * 32 / d)); hit = bldAt(B, q); if (hit >= 0) break; }
    if (hit < 0) return t;
    const b = B[hit], X = b.w / 2 + 26, Y = b.h / 2 + 26, cs = [[X, Y], [-X, Y], [X, -Y], [-X, -Y]].map(([x, y]) => add(add(b.p, b.u, x), b.v, y));
    const clear = (p, q) => { const L = dist(p, q); for (let k = 1; k < 6; k++) if (bldAt(B, lerp(p, q, k / 6)) === hit) return false; return L > 6; };
    let best = null, bd = 1e9; for (const c of cs) { if (!clear(a, c)) continue; const v = dist(a, c) + dist(c, t); if (v < bd) { bd = v; best = c; } }
    return best || t;
  }
  roomCenter(b, ri) { const R = b.rooms[ri]; return toWorld(b, [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2]); }
  // путь к точке t с учётом зданий: заходим и выходим через двери, внутри — по комнатам
  nav(b, t) {
    const B = this.objs.blds, bt = bldAt(B, t), bb = b.bi ?? -1;
    if (bb < 0) { if (bt < 0) return this.around(b.p, t); const d = near(B[bt].doors, b.p); const go = dist(b.p, d.o) < 24 || dist(b.p, d.i) < dist(d.o, d.i) ? d.i : d.o; return go === d.o ? this.around(b.p, d.o) : go; }
    const Bd = B[bb], lp = toLocal(Bd, b.p);
    // комната «липкая»: в дверном проёме считаемся там, откуда пришли (иначе дёргается туда-сюда)
    let rb = Bd.rooms.findIndex(r => lp[0] > r.x0 && lp[0] < r.x1 && lp[1] > r.y0 && lp[1] < r.y1);
    if (rb < 0) rb = b.navB === bb && b.navR >= 0 ? b.navR : roomAt(Bd, lp); b.navB = bb; b.navR = rb;
    let goalRoom, exit = null;
    if (bt === bb) goalRoom = roomAt(Bd, toLocal(Bd, t)); else { exit = near(Bd.doors, t); goalRoom = exit.room; }
    if (rb === goalRoom) return exit ? (dist(b.p, exit.i) < 24 || dist(b.p, exit.o) < dist(exit.i, exit.o) ? exit.o : exit.i) : t;
    const prev = new Map([[rb, -1]]), Q = [rb];
    while (Q.length) { const r = Q.shift(); if (r === goalRoom) break; for (const e of Bd.adj) { const n = e.a === r ? e.b : e.b === r ? e.a : -1; if (n >= 0 && !prev.has(n)) { prev.set(n, r); Q.push(n); } } }
    if (!prev.has(goalRoom)) return t;
    let r = goalRoom; while (prev.get(r) !== rb) r = prev.get(r);
    const e = Bd.adj.find(e => (e.a === rb && e.b === r) || (e.b === rb && e.a === r)), dp = toWorld(Bd, e.p);
    return dist(b.p, dp) < 20 ? this.roomCenter(Bd, r) : dp;
  }
  // ===== рассылка =====
  broadcast() {
    if (this.lAdd.length || this.lDel.length) { const m = { t: 'l' }; if (this.lAdd.length) m.a = this.lAdd.map(lootArr); if (this.lDel.length) m.d = this.lDel; this.sendAll(m); this.lAdd = []; this.lDel = []; }
    const shots = this.shots; this.shots = [];
    for (const c of this.clients) {
      const me = c.pl; if (!me) continue;
      const cam = me, ents = [], seen = new Set(), noise = [];
      const cand = [];
      for (const p of this.ents) {
        if (!p || !p.alive) continue;
        const d = dist(p.p, cam.p);
        if (p === me || (d < VIEWD && canSee(this.objs, cam.p, p.p, cam.bi ?? -1, p.bi ?? -1))) cand.push([d, p]);
        else if (p.step && p.kind !== 'r' && d < HEAR) noise.push([1 | ((p.stepN & 1) << 4), p.p, p.mvDir || [0, 1]]);
      }
      cand.sort((a, b) => a[0] - b[0]); for (const [, p] of cand.slice(0, 60)) { ents.push(p); seen.add(p.id); } // не больше 60 ближайших
      const sh = []; { const heard = new Set(); for (const s of shots) { if (seen.has(s[0])) { if (dist(s[2], cam.p) < VIEWD + 300) sh.push(s); } else if (!heard.has(s[0]) && dist(s[3], cam.p) < HEAR * 1.8) { heard.add(s[0]); noise.push([2, s[3], [0, 0]]); } } }
      const hm = me.hm.splice(0);
      const buf = new ArrayBuffer(64 + ents.length * 10 + sh.length * 6 + hm.length * 2 + noise.length * 7), dv = new DataView(buf); let o = 0;
      const u8 = v => dv.setUint8(o++, Math.max(0, Math.min(255, Math.round(v))));
      const u16 = v => { dv.setUint16(o, Math.max(0, Math.min(65535, Math.round(v))), true); o += 2; };
      const v2 = p => { dv.setInt16(o, q16(p[0]), true); dv.setInt16(o + 2, q16(p[1]), true); o += 4; };
      u8(1); dv.setUint32(o, this.tick, true); o += 4; u8(me.alive ? 1 : 2); u16(Math.round(this.t * 10) % 65536);
      u16(me.seq); u8(me.id); u8(me.id); u8(ents.length);
      const P = me, cs = P.slots[P.cur];
      u8(P.hp); u8(P.armor); u8(P.cur);
      for (let i = 0; i < 2; i++) { const s = P.slots[i]; u8(s ? s.w | (s.r << 4) : 0); u8(s ? s.mag : 0); }
      for (let a = 0; a < 4; a++) u8(P.ammo[a]); u8(P.meds); u8((P.relT > 0 ? 1 : 0) | (P.healT > 0 ? 2 : 0) | (P.actT > 0 ? 4 : 0));
      u8(P.relT > 0 && cs ? 255 * (1 - P.relT / WEAPONS[cs.w].rel) : P.healT > 0 ? 255 * (1 - P.healT / 2.5) : P.actT > 0 ? 255 * (1 - P.actT / P.actDur) : 0); u8(P.kills); u8((P.bloom || 0) * 1000); u8(P.moving ? 1 : 0);
      u16(P.money); u16(P.xp); u8(P.trust); u8(P.res); u8(this.ents.filter(e => e && e.lead === P.id).length); u8(P.sect); u8(this.atHQ(P) ? 1 : 0);
      for (const p of ents) { u8(p.id); v2(p.p); dv.setInt8(o++, i8(p.aim[0])); dv.setInt8(o++, i8(p.aim[1])); u8(p.hp); u8(1 | (p.armor > 0 ? 2 : 0) | (p.relT > 0 ? 4 : 0) | (p.healT > 0 ? 8 : 0) | ((p.sect + 1) << 4) | ((p.actT > 0 || p.talkT > this.t) ? 128 : 0)); const s = p.slots[p.cur]; u8(s ? s.w | (s.r << 4) : 0); }
      u8(sh.length); for (const s of sh) { u8(s[0]); u8(s[1]); v2(s[2]); }
      u8(hm.length); for (const h of hm) { u8(h[0]); u8(Math.min(255, h[1])); }
      u8(Math.min(255, noise.length)); for (const n of noise.slice(0, 255)) { u8(n[0]); v2(n[1]); dv.setInt8(o++, i8(n[2][0])); dv.setInt8(o++, i8(n[2][1])); }
      this.send(c, buf.slice(0, o));
    }
    for (const p of this.ents) if (p) p.step = 0;
  }
}

const near = (ds, q) => ds.reduce((m, d) => dist(d.o, q) < dist(m.o, q) ? d : m);
const toLocal = (b, p) => { const r = sub(p, b.p); return [dot(r, b.u), dot(r, b.v)]; };
const toWorld = (b, l) => add(add(b.p, b.u, l[0]), b.v, l[1]);
function roomAt(b, l) { let best = 0, bd = 1e9; b.rooms.forEach((r, i) => { const dx = Math.max(r.x0 - l[0], 0, l[0] - r.x1), dy = Math.max(r.y0 - l[1], 0, l[1] - r.y1), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } }); return best; }
function lootArr(it) { return [it.id, it.k, it.x, it.r, it.n, Math.round(it.p[0] * 10) / 10, Math.round(it.p[1] * 10) / 10]; }
