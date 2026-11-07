const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.join(__dirname, '..'), render = fs.readFileSync(path.join(root, 'src/render3d.js'), 'utf8');
const planner = render.slice(render.indexOf('function planStreets'), render.indexOf('const G3'));
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/shared.js'), 'utf8') + '\n' + planner + `
const world = genWorld(), plan = planStreets(world);
assert.deepEqual(plan.missed, [], 'Every door needs a street connection');
assert.equal(plan.walks.length, world.blds.reduce((n, b) => n + b.doors.length, 0));
const key = p => p.join(','), graph = new Map();
for (const [a, b] of plan.roads) for (const [p, q] of [[a,b],[b,a]]) {
  const k = key(p); if (!graph.has(k)) graph.set(k, []); graph.get(k).push(key(q));
}
const first = graph.keys().next().value, seen = new Set([first]), queue = [first];
while (queue.length) for (const k of graph.get(queue.pop())) if (!seen.has(k)) { seen.add(k); queue.push(k); }
assert.equal(seen.size, graph.size, 'Street network must be connected');
for (const walk of plan.walks) {
  assert(seen.has(key(walk.points[walk.points.length - 1])), 'Walk ends in grass');
  for (let i = 1; i < walk.points.length; i++) {
    const a = walk.points[i-1], b = walk.points[i], n = Math.max(1, Math.ceil(dist(a,b)/6));
    for (let j = 0; j <= n; j++) {
      const p = lerp(a,b,j/n);
      assert(!nearObjs(world,p,PR).some(o => !o.dead && !o.nc && objPush(o,p,PR)), 'Blocked walk at building '+walk.bid);
    }
  }
}
for (const [a,b] of plan.roads) for (let i=0;i<=6;i++) {
 const p=lerp(a,b,i/6);
 assert(!nearObjs(world,p,26).some(o=>!o.dead&&!o.nc&&objPush(o,p,26)), 'Street crosses an obstacle');
 for(const b of world.blds) if(b.yard){const r=sub(p,b.p);assert(Math.abs(dot(r,b.u))>=b.yard[0]/2||Math.abs(dot(r,b.v))>=b.yard[1]/2,'Public street crosses a private yard');}
}
console.log('Connected streets:',plan.walks.length,'doors,',plan.roads.length,'segments; all paths clear');
// Разрушенные объекты не должны менять рисунок улиц у вновь подключившихся игроков.
for (const o of world) if (o.hp) o.dead = true;
assert.deepEqual(planStreets(world), plan, 'Street layout changes with destruction state');
`, { console, assert });
