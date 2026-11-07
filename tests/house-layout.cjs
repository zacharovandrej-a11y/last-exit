const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../src/shared.js'), 'utf8');
vm.runInNewContext(source + `
const world = genWorld(), houses = world.blds.filter(b => b.kind === 'house');
assert(houses.length > 0);
for (const b of houses) {
  assert(b.doors.length > 0);
  const step = 6, margin = 42, x0 = -b.w / 2 - margin, y0 = -b.h / 2 - margin;
  const nx = Math.ceil((b.w + margin * 2) / step), ny = Math.ceil((b.h + margin * 2) / step);
  const obstacles = b.walls.concat(b.furn).map(i => world[i]);
  const seen = new Set([0]), queue = [0], reached = new Set();
  while (queue.length) {
    const k = queue.pop(), x = k % nx, y = Math.floor(k / nx);
    const local = [x0 + x * step, y0 + y * step];
    b.rooms.forEach((r, i) => { if (local[0] > r.x0 && local[0] < r.x1 && local[1] > r.y0 && local[1] < r.y1) reached.add(i); });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, kk = yy * nx + xx;
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny || seen.has(kk)) continue;
      const p = add(add(b.p, b.u, x0 + xx * step), b.v, y0 + yy * step);
      if (obstacles.some(o => objPush(o, p, PR + 1))) continue;
      seen.add(kk); queue.push(kk);
    }
  }
  assert.equal(reached.size, b.rooms.length, 'Unreachable room in house ' + b.id);
  assert(b.furn.every(i => world[i].bid === b.id));
  assert(b.doors.every(d => bldAt(world.blds, d.i) === b.id));
}
console.log('All rooms reachable in', houses.length, 'houses');
`, { assert, console });
