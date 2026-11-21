// ===== ЗОМБИ-КООП: сервер. Один Durable Object держит все комнаты (до 4 игроков в каждой) =====
const ZCODE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export class ZWorld {
  constructor(state, env) { this.state = state; this.clients = new Set(); this.rooms = new Map(); this.timer = null; this.tick = 0; this.t = 0; this.rnd = mkRng(Date.now() % 100000 + 3); }
  async fetch(req) {
    const { 0: cli, 1: ws } = new WebSocketPair(); ws.accept();
    const c = { ws, name: 'Игрок', room: null, p: null, lastIn: 0 };
    this.clients.add(c);
    ws.addEventListener('message', e => { try { this.onMsg(c, e.data); } catch (err) { } });
    const bye = () => { if (!this.clients.has(c)) return; this.clients.delete(c); this.leaveRoom(c); };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (!this.timer) this.timer = setInterval(() => this.loop(), 1000 / ZTICK);
    return new Response(null, { status: 101, webSocket: cli });
  }
  send(c, m) { try { c.ws.send(typeof m === 'string' || m instanceof ArrayBuffer ? m : JSON.stringify(m)); } catch (e) { } }
  toRoom(room, m, except) { const s = typeof m === 'string' ? m : JSON.stringify(m); for (const p of room.players) if (p.c !== except) this.send(p.c, s); }
  roomList() { return [...this.rooms.values()].map(r => ({ c: r.code, n: r.players.length, w: r.wave, st: r.st, names: r.players.map(p => p.name) })); }
  sendRooms(c) { this.send(c, { t: 'rooms', l: this.roomList() }); }
  // ===== комнаты =====
  newRoom() {
    let code; do { code = ''; for (let i = 0; i < 4; i++) code += ZCODE[Math.floor(this.rnd() * ZCODE.length)]; } while (this.rooms.has(code));
    const r = { code, st: 'wait', phase: 0, players: [], zs: new Map(), zid: 1, wave: 0, cyc: 0, toSpawn: 0, spAcc: 0, spRate: 1, timer: 0, kills: 0, items: new Map(), iid: 1, shots: [], best: 0 };
    this.rooms.set(code, r); return r;
  }
  onMsg(c, data) {
    if (typeof data !== 'string') return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'hello') { c.name = String(m.name || 'Игрок').slice(0, 12) || 'Игрок'; this.sendRooms(c); return; }
    if (m.t === 'create') { this.leaveRoom(c); this.joinRoom(c, this.newRoom()); return; }
    if (m.t === 'join') { const r = this.rooms.get(String(m.code || '').toUpperCase()); if (!r) return this.send(c, { t: 'err', s: 'Комната не найдена' }); if (r === c.room) return; if (r.players.length >= ZMAXP) return this.send(c, { t: 'err', s: 'Комната заполнена' }); this.leaveRoom(c); this.joinRoom(c, r); return; }
    if (m.t === 'quick') { // быстрый вход: комната со свободным местом (сначала ожидающие, потом с ранней волной)
      this.leaveRoom(c); const free = [...this.rooms.values()].filter(r => r.players.length < ZMAXP && r.st !== 'over').sort((a, b) => (a.st === 'wait' ? -1 : 0) - (b.st === 'wait' ? -1 : 0) || a.wave - b.wave);
      this.joinRoom(c, free[0] || this.newRoom()); return; }
    if (m.t === 'leave') { this.leaveRoom(c); this.sendRooms(c); return; }
    const r = c.room, p = c.p; if (!r || !p) return;
    if (m.t === 'start') { if (r.st === 'wait') this.startGame(r); return; }
    if (m.t === 'perk') { this.pickPerk(r, p, m.i | 0); return; }
    if (m.t === 'in') this.input(r, p, m);
  }
  joinRoom(c, r) {
    if (r.players.length >= ZMAXP) return;
    let id = 0; while (r.players.some(p => p.id === id)) id++;
    const p = this.newPlayer(c, id); c.room = r; c.p = p; r.players.push(p); r.players.sort((a, b) => a.id - b.id);
    if (r.st === 'play') { // вход посреди игры: рядом с командой, уровень почти как у команды, всё открытое оружие
      const mates = r.players.filter(q => q !== p && q.st === 0), m = mates[Math.floor(this.rnd() * mates.length)];
      p.p = m ? [m.p[0] + (this.rnd() - .5) * 60, m.p[1] + (this.rnd() - .5) * 60] : [0, 0]; p.inv = this.t + 3;
      const others = r.players.filter(q => q !== p), avg = others.reduce((s, q) => s + q.lvl, 0) / Math.max(1, others.length);
      const lv = Math.max(1, Math.round(avg) - 1); p.lvl = lv; p.pend = lv - 1;
      p.w = zUnlocked(r.wave).slice(-1)[0] || 0;
      if (r.phase === 1) { const add = Math.round(zWaveCount(r.wave, 1, r.cyc) * .5); r.toSpawn += add; }
    }
    this.send(c, { t: 'room', code: r.code, you: id, st: r.st, wave: r.wave, unl: zUnlocked(Math.max(1, r.wave)) });
    this.roster(r);
    if (p.pend > 0) this.offerPerk(p);
    this.toRoom(r, { t: 'msg', s: '👋 ' + p.name + ' в игре' }, c);
  }
  leaveRoom(c) {
    const r = c.room; if (!r) return;
    r.players = r.players.filter(p => p.c !== c); c.room = null; c.p = null;
    if (!r.players.length) { this.rooms.delete(r.code); return; }
    this.roster(r); this.toRoom(r, { t: 'msg', s: '🚪 игрок вышел' });
  }
  roster(r) { this.toRoom(r, { t: 'ros', pl: r.players.map(p => [p.id, p.name]), st: r.st }); }
  newPlayer(c, id) {
    return { c, id, name: c.name, p: [(id % 2 ? 1 : -1) * 30, (id > 1 ? 1 : -1) * 30], aim: [1, 0], hp: 100, maxHp: 100, st: 0, downT: 0, revT: 0, inv: 0, w: 0, fire: 0,
      lvl: 1, xp: 0, pend: 0, opts: null, pk: {}, wl: ZW.map(() => 1), kills: 0, regA: 0, lastT: 0 };
  }
  resetPlayer(p, i) { Object.assign(p, { p: [(i % 2 ? 1 : -1) * 30, (i > 1 ? 1 : -1) * 30], hp: 100, maxHp: 100, st: 0, downT: 0, revT: 0, inv: this.t + 3, w: 0, lvl: 1, xp: 0, pend: 0, opts: null, pk: {}, wl: ZW.map(() => 1), kills: 0 }); }
  startGame(r) {
    r.st = 'play'; r.phase = 0; r.wave = 0; r.cyc = 0; r.kills = 0; r.zs.clear(); r.items.clear(); r.timer = this.t + 3;
    r.players.forEach((p, i) => { this.resetPlayer(p, i); this.send(p.c, { t: 'pk', pk: p.pk, wl: p.wl, maxHp: p.maxHp }); });
    this.toRoom(r, { t: 'start' }); this.roster(r);
  }
  // ===== волны =====
  startWave(r) {
    r.wave++;
    if (r.wave > ZWAVES) { r.wave = 1; r.cyc++; this.toRoom(r, { t: 'msg', s: '🔁 Круг ' + (r.cyc + 1) + '! Зомби злее, оружие остаётся', big: 1 }); }
    const n = r.players.length; r.phase = 1;
    r.toSpawn = zWaveCount(r.wave, n, r.cyc); r.spRate = r.toSpawn / (12 + r.wave * .7); r.spAcc = 0;
    if (r.wave % 5 === 0) this.spawnZ(r, 4);
    for (const [i, p] of r.players.entries()) if (p.st === 2) { p.st = 0; p.hp = p.maxHp; p.p = [(i % 2 ? 1 : -1) * 30, (i > 1 ? 1 : -1) * 30]; p.inv = this.t + 3; this.toRoom(r, { t: 'msg', s: '✨ ' + p.name + ' вернулся' }); }
    const newW = ZW.map((w, i) => w.wave === r.wave && r.cyc === 0 ? i : -1).filter(i => i >= 0);
    this.toRoom(r, { t: 'wave', w: r.wave, n: r.toSpawn, cyc: r.cyc, boss: r.wave % 5 === 0 ? 1 : 0, unl: zUnlocked(r.wave), nw: newW });
  }
  spawnZ(r, type) {
    let p = null;
    for (let k = 0; k < 12; k++) { const a = this.rnd() * Math.PI * 2, q = [Math.cos(a) * ZA * 1.06, Math.sin(a) * ZA * 1.06]; if (r.players.every(pl => dist(pl.p, q) > 280)) { p = q; break; } p = q; }
    const T = ZT[type], hm = zHpMul(r.wave, r.players.length, r.cyc) * (type === 4 ? r.players.length * .6 + .4 : 1);
    const z = { id: r.zid, ty: type, p, hp: T.hp * hm, mhp: T.hp * hm, sp: T.sp * (.85 + this.rnd() * .3) * (1 + r.cyc * .12), r: T.r, atkT: 0, lost: 0, burn: 0, burnBy: null, tg: null, atk: 0 };
    r.zid = r.zid % 65000 + 1; r.zs.set(z.id, z); return z;
  }
  // ===== ввод игрока: позиция (доверяем, но ограничиваем скорость), оружие, попадания =====
  input(r, p, m) {
    const now = this.t, el = Math.min(.5, now - (p.lastT || now)) || ZDT; p.lastT = now;
    if (Array.isArray(m.p) && p.st !== 2) {
      const q = [Math.max(-ZA, Math.min(ZA, +m.p[0] || 0)), Math.max(-ZA, Math.min(ZA, +m.p[1] || 0))], d = dist(q, p.p), lim = ZSPEED * 1.6 * (p.st === 1 ? .4 : 1) * (1 + (p.pk.spd || 0) * .08) * el + 12;
      p.p = d <= lim ? q : add(p.p, norm(sub(q, p.p)), lim);
    }
    if (Array.isArray(m.a)) p.aim = norm([+m.a[0] || 1, +m.a[1] || 0]);
    if (m.w !== undefined && zUnlocked(Math.max(1, r.wave)).includes(m.w | 0)) p.w = m.w | 0;
    p.fire = m.f ? 1 : 0;
    if (r.st !== 'play' || p.st !== 0) return;
    const W = ZW[p.w], maxD = W.dmg * 6 * (W.boom ? 1.5 : 1);
    if (Array.isArray(m.h)) for (const h of m.h.slice(0, 80)) {
      const z = r.zs.get(h[0] | 0); if (!z) continue;
      const dmg = Math.min(maxD, Math.max(0, +h[1] || 0)); if (dist(z.p, p.p) > W.range + (W.boom || 0) + 120) continue;
      z.hp -= dmg; z.lastBy = p; z.lastDir = norm(sub(z.p, p.p));
      if (W.fire) { z.burn = 3; z.burnBy = p; }
      const g = W.gore;
      if (g >= 2 && dmg > z.mhp * .12 && this.rnd() < .1 * g) z.lost |= 1 << Math.floor(this.rnd() * (g >= 3 ? 3 : 2)); // отлетает рука (1,2) или ноги (4)
      if (z.hp <= 0) this.killZ(r, z, p, g + (dmg > z.mhp * .8 ? 1 : 0));
    }
    if (Array.isArray(m.s) && m.s.length) r.shots.push([p.id, p.w, m.s.slice(0, 30)]);
    if (Array.isArray(m.b)) for (const b of m.b.slice(0, 4)) r.shots.push([p.id, -1, [[+b[0] | 0, +b[1] | 0]]]); // взрывы гранат
  }
  killZ(r, z, by, gore, dir) {
    if (!r.zs.has(z.id)) return; r.zs.delete(z.id); r.kills++;
    const T = ZT[z.ty];
    this.toRoom(r, { t: 'k', z: z.id, x: Math.round(z.p[0]), y: Math.round(z.p[1]), d: (dir || z.lastDir || [1, 0]).map(v => Math.round(v * 100) / 100), g: Math.min(6, gore | 0), ty: z.ty, lost: z.lost, by: by ? by.id : -1 });
    if (by) { by.kills++; this.giveXp(r, by, T.xp); if (by.pk.vamp) by.hp = Math.min(by.maxHp, by.hp + by.pk.vamp); }
    for (const q of r.players) if (q !== by && q.st === 0) this.giveXp(r, q, T.xp * .35);
    if (this.rnd() < (z.ty >= 2 ? .25 : .022)) { const it = { id: r.iid++, k: 'med', p: [...z.p] }; r.items.set(it.id, it); this.toRoom(r, { t: 'it', id: it.id, x: Math.round(it.p[0]), y: Math.round(it.p[1]) }); }
  }
  giveXp(r, p, x) {
    p.xp += x;
    while (p.xp >= zXpNeed(p.lvl)) { p.xp -= zXpNeed(p.lvl); p.lvl++; p.pend++; }
    if (p.pend > 0 && !p.opts) this.offerPerk(p);
  }
  offerPerk(p) {
    const a = ZPERK.map((_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    p.opts = a.slice(0, 3); this.send(p.c, { t: 'lvl', lv: p.lvl, o: p.opts });
  }
  pickPerk(r, p, i) {
    if (!p.opts || i < 0 || i > 2) return; const k = ZPERK[p.opts[i]].k;
    p.pk[k] = (p.pk[k] || 0) + 1;
    if (k === 'hp') { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); }
    if (k === 'wlvl') p.wl[p.w]++;
    p.opts = null; p.pend--; this.send(p.c, { t: 'pk', pk: p.pk, wl: p.wl, maxHp: p.maxHp });
    if (p.pend > 0) this.offerPerk(p);
  }
  // ===== шаг мира =====
  loop() {
    if (!this.clients.size) { clearInterval(this.timer); this.timer = null; return; }
    this.tick++; this.t += ZDT;
    for (const r of this.rooms.values()) { if (r.st === 'play') this.step(r, ZDT); this.snap(r); }
    if (this.tick % (2 * ZTICK) === 0) { const l = JSON.stringify({ t: 'rooms', l: this.roomList() }); for (const c of this.clients) if (!c.room) this.send(c, l); }
  }
  step(r, dt) {
    const t = this.t;
    if (r.phase === 0 && t >= r.timer) this.startWave(r);
    if (r.phase === 1) {
      if (r.toSpawn > 0) { r.spAcc += r.spRate * dt; const cap = 140 + 30 * r.players.length; while (r.spAcc >= 1 && r.toSpawn > 0 && r.zs.size < cap) { r.spAcc--; r.toSpawn--; this.spawnZ(r, zPickType(r.wave, this.rnd)); } }
      else if (!r.zs.size) { r.phase = 0; r.timer = t + ZBREAK; this.toRoom(r, { t: 'clear', w: r.wave }); }
    }
    // игроки: упавший ползёт и ждёт помощи; рядом стоящий напарник лечит
    for (const p of r.players) {
      if (p.st === 0) { if (p.pk.regen) { p.regA += p.pk.regen * dt; if (p.regA >= 1) { p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.regA)); p.regA %= 1; } }
        for (const it of r.items.values()) if (dist(it.p, p.p) < 24) { r.items.delete(it.id); p.hp = Math.min(p.maxHp, p.hp + 40); this.toRoom(r, { t: 'itx', id: it.id, by: p.id }); } }
      else if (p.st === 1) {
        p.downT -= dt;
        const helper = r.players.find(q => q !== p && q.st === 0 && dist(q.p, p.p) < ZPR * 2 + 26);
        if (helper) { p.revT += dt; if (p.revT >= ZREV) { p.st = 0; p.hp = Math.round(p.maxHp * .5); p.inv = t + 2; p.revT = 0; this.toRoom(r, { t: 'msg', s: '💉 ' + helper.name + ' поднял ' + p.name }); } }
        else p.revT = Math.max(0, p.revT - dt * 2);
        if (p.st === 1 && p.downT <= 0) { p.st = 2; this.toRoom(r, { t: 'msg', s: '💀 ' + p.name + ' погиб — вернётся в начале волны' }); }
      }
    }
    if (!r.players.some(p => p.st === 0)) { this.gameOver(r); return; }
    // зомби: идут к ближайшему живому, расталкивают друг друга, кусают
    const G = new Map(), key = (x, y) => (Math.floor(x / 48) + 100) * 1000 + Math.floor(y / 48) + 100;
    for (const z of r.zs.values()) { const k = key(z.p[0], z.p[1]); let a = G.get(k); if (!a) G.set(k, a = []); a.push(z); }
    const targets = r.players.filter(p => p.st < 2);
    for (const z of r.zs.values()) {
      if (z.burn > 0) { z.burn -= dt; z.hp -= 14 * dt; if (z.hp <= 0) { this.killZ(r, z, z.burnBy, 1); continue; } }
      if (!z.tg || z.tg.st === 2 || !r.players.includes(z.tg) || this.tick % 15 === z.id % 15) { let bd = 1e9; z.tg = null; for (const p of targets) { const d = dist(p.p, z.p) * (p.st === 1 ? 1.3 : 1); if (d < bd) { bd = d; z.tg = p; } } }
      const T = z.tg; z.atk = 0; if (!T) continue;
      const d = dist(T.p, z.p), reach = z.r + ZPR + 5;
      if (d > reach) {
        const dir = norm(sub(T.p, z.p)), sp = z.sp * (z.lost & 4 ? .35 : 1) * (z.burn > 0 ? 1.2 : 1);
        z.p = add(z.p, dir, sp * dt);
      } else {
        z.atk = 1; z.atkT -= dt;
        if (z.atkT <= 0) { z.atkT = .85; if (t > T.inv) this.hurt(r, T, ZT[z.ty].dmg * (1 + r.cyc * .3) * ((z.lost & 3) === 3 ? .4 : 1)); }
      }
      const gx = Math.floor(z.p[0] / 48), gy = Math.floor(z.p[1] / 48);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) { const a = G.get((gx + ix + 100) * 1000 + gy + iy + 100); if (a) for (const o of a) { if (o === z) continue; const dd = dist(o.p, z.p), m = o.r + z.r; if (dd < m && dd > .01) { const push = (m - dd) * .5 * (ZT[o.ty].sc / (ZT[z.ty].sc + ZT[o.ty].sc)) * 2; z.p = add(z.p, norm(sub(z.p, o.p)), Math.min(push, 6)); } } }
      const L = ZA * 1.1; z.p[0] = Math.max(-L, Math.min(L, z.p[0])); z.p[1] = Math.max(-L, Math.min(L, z.p[1]));
    }
    // выстрелы других игроков — всем в комнате для трассеров
    if (r.shots.length) { this.toRoom(r, { t: 'sh', s: r.shots }); r.shots = []; }
  }
  hurt(r, p, dmg) {
    if (p.st === 0) { p.hp -= dmg; if (p.hp <= 0) { p.hp = 0; p.st = 1; p.downT = ZDOWN; p.revT = 0; this.toRoom(r, { t: 'msg', s: '🆘 ' + p.name + ' упал! Ползи к напарнику' }); } }
    else if (p.st === 1) p.downT -= dmg * .12;
  }
  gameOver(r) {
    r.st = 'over'; r.phase = 0; r.timer = this.t + 9;
    this.toRoom(r, { t: 'over', w: r.wave, cyc: r.cyc, kills: r.kills, pl: r.players.map(p => [p.name, p.kills, p.lvl]) });
    r.zs.clear(); r.items.clear();
    setTimeout(() => { if (this.rooms.get(r.code) === r && r.st === 'over') { r.st = 'wait'; r.wave = 0; this.roster(r); } }, 9000);
  }
  // ===== снапшот комнаты: двоичный, 20 раз в секунду =====
  snap(r) {
    const zs = r.st === 'play' ? [...r.zs.values()] : [], np = r.players.length;
    const buf = new ArrayBuffer(12 + np * ZSN_P + zs.length * ZSN_Z), v = new DataView(buf);
    v.setUint8(0, 1); v.setUint8(1, r.st === 'wait' ? 0 : r.st === 'play' ? 1 : 2); v.setUint8(2, r.phase); v.setUint8(3, Math.min(255, r.wave));
    v.setUint16(4, Math.min(65535, r.toSpawn + r.zs.size), true); v.setUint16(6, Math.max(0, Math.round((r.timer - this.t) * 10)), true); v.setUint8(8, np); v.setUint8(9, r.cyc); v.setUint16(10, zs.length, true);
    let o = 12;
    for (const p of r.players) {
      v.setUint8(o, p.id); v.setInt16(o + 1, Math.round(p.p[0] * 10), true); v.setInt16(o + 3, Math.round(p.p[1] * 10), true);
      v.setUint8(o + 5, Math.round((Math.atan2(p.aim[1], p.aim[0]) / (Math.PI * 2) + 1) % 1 * 255));
      v.setUint8(o + 6, Math.round(Math.max(0, p.hp / p.maxHp) * 255)); v.setUint8(o + 7, p.st | (p.fire << 2) | (this.t < p.inv ? 8 : 0) | (p.revT > 0 ? 16 : 0));
      v.setUint8(o + 8, p.w); v.setUint8(o + 9, Math.min(255, p.lvl)); v.setUint8(o + 10, Math.max(0, Math.ceil(p.downT))); v.setUint8(o + 11, Math.min(255, Math.round(p.xp / zXpNeed(p.lvl) * 255))); o += ZSN_P;
    }
    for (const z of zs) {
      v.setUint16(o, z.id, true); v.setInt16(o + 2, Math.round(z.p[0] * 10), true); v.setInt16(o + 4, Math.round(z.p[1] * 10), true);
      v.setUint8(o + 6, z.ty | (z.lost << 3)); v.setUint8(o + 7, Math.round(Math.max(0, z.hp / z.mhp) * 255)); v.setUint8(o + 8, z.atk | (z.burn > 0 ? 2 : 0)); o += ZSN_Z;
    }
    for (const p of r.players) this.send(p.c, buf);
  }
}
