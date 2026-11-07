const vm=require('vm'),fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../src/shared.js'),'utf8');
const c={assert,console};vm.createContext(c);vm.runInContext(src+`
const w=genWorld(), w2=genWorld();
assert.equal(JSON.stringify(w),JSON.stringify(w2));
assert.equal(JSON.stringify(w.blds),JSON.stringify(w2.blds));
const positions=[[-1400,-1400],[-1400,1400],[1400,-1400],[1400,1400]];
assert.equal(w.churches.length,4);
for(const [s,id] of w.churches.entries()) {
 const b=w.blds[id],d=b.doors[0],v=norm(sub(d.o,d.i)),side=perp(v);
 assert.deepEqual(b.p,positions[s]); assert.equal(b.sect,s); assert(b.altar!==undefined); assert(b.box!==undefined);
 // Художественный поворот зала Тапка: вход смотрит к центру с отклонением до 20° и открывает боковой фасад.
 assert(dot(v,norm(mul(b.p,-1))) > (s === 0 ? Math.cos(Math.PI / 9) : .99));
 if (s === 0) {
  assert.equal(b.rooms.length, 1, 'The meeting hall must remain one room');
  const rel = sub(d.i, b.p), aisle = add(b.p, b.u, dot(rel, b.u));
  const altar = w[b.altar], end = add(altar.p, b.u, -(altar.w / 2 + PR + 3));
  for (const [a, z] of [[d.i, aisle], [aisle, end]]) for (let t = 0; t <= 1; t += .02) {
   const p = lerp(a, z, t); assert(dist(p, collide(w, p)) < .01, 'Blocked route to altar');
  }
 }
 for(let t=0;t<=260;t+=5) for(let off=-44;off<=44;off+=11){const p=add(add(d.o,v,t),side,off);assert(dist(p,collide(w,p))<.01,'blocked approach '+s+' '+t+' '+off);}
 for(let t=0;t<=dist(d.i,d.o);t+=2){const p=add(d.i,v,t);assert(dist(p,collide(w,p))<.01,'blocked door '+s);}
 console.log('HQ',s,JSON.stringify(b.p),'door and approach clear');
}
console.log('Determinism OK; buildings',w.blds.length,'objects',w.length);
`,c);
