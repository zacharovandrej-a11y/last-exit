const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.join(__dirname, '..'), render = fs.readFileSync(path.join(root, 'src/render3d.js'), 'utf8');
const planner = render.slice(render.indexOf('function planStreets'), render.indexOf('const G3'));
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/shared.js'), 'utf8') + '\n' + planner + `
const world = genWorld(), plan = planStreets(world);
const segD = (p, [a, b]) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-6, dot(ab, ab)))); return dist(p, add(a, ab, t)); };
assert(world.roads.length >= 8, 'Road network is missing');
// иерархия: трасса шире улицы, улица шире грунтовки; машина (60) помещается в полосу
const W = {}; for (const r of world.roads) W[r.k] = r.w;
assert(W.main > W.street && W.street > W.dirt, 'Road hierarchy');
assert(W.street / 2 >= 70 && W.dirt >= 100, 'Lane narrower than a car');
// связность: каждая дорога касается другой дороги (или уходит за край карты)
const segs = plan.segs, touch = (r, q) => segs.some(s => s[4] === q && segs.some(t => { if (t[4] !== r) return false; const n = Math.ceil(dist(t[0], t[1]) / 10); for (let i = 0; i <= n; i++) if (segD(lerp(t[0], t[1], i / n), s) < s[2] / 2 + 4) return true; return false; }));
const seen = new Set([0]), queue = [0];
while (queue.length) { const r = queue.pop(); for (let q = 0; q < world.roads.length; q++) if (!seen.has(q) && touch(r, q)) { seen.add(q); queue.push(q); } }
assert.equal(seen.size, world.roads.length, 'Road network must be connected: ' + world.roads.map((r, i) => seen.has(i) ? '' : i + r.k + JSON.stringify(r.pts[0])).join(' '));
assert(plan.junctions.length >= 8, 'Too few crossroads');
// дома стоят у дорог: каждый дом (кроме бункеров и штабов) в пределах 420 от дороги
for (const b of world.blds) if (!/^ch|bunker/.test(b.kind)) assert(segs.some(s => segD(b.p, s) - s[2] / 2 < 420 + b.rad), 'Building far from roads: ' + b.kind + ' ' + b.id);
// здания не стоят на дорогах
for (const s of segs) for (let t = 0; t <= 1; t += .02) assert(bldAt(world.blds, lerp(s[0], s[1], t)) < 0, 'Road through building');
// дорожки от дверей не проходят сквозь здания
for (const walk of plan.walks) { const [a, b] = walk.points.slice(-2); for (let t = .1; t <= 1; t += .05) assert(bldAt(world.blds, lerp(a, b, t)) < 0, 'Walk through building ' + walk.bid); }
console.log('Roads:', world.roads.length, 'segments:', segs.length, 'crossroads:', plan.junctions.length, 'walks:', plan.walks.length);
for (const o of world) if (o.hp) o.dead = true;
assert.deepEqual(planStreets(world), plan, 'Street layout changes with destruction state');
`, { console, assert });
