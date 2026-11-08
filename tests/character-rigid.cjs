const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const T = require('../assets/three.min.js');
const source = fs.readFileSync(path.join(__dirname, '../src/render3d.js'), 'utf8');
const helper = source.slice(source.indexOf('  const rigidCharCache'), source.indexOf('  const faceTex'));
const context = { T }; vm.createContext(context); vm.runInContext(helper + '\nglobalThis.merge = mergeRigidChar;', context);
const box = new T.BoxGeometry(1, 1, 1);
function fixture() {
  const root = new T.Group(), joint = new T.Group(), skin = new T.MeshLambertMaterial({color: 0xc89975}), cloth = new T.MeshLambertMaterial({vertexColors:true});
  root.position.set(4,1,8); root.rotation.y=.4; joint.position.set(3,-2,-1); joint.rotation.x=.3; root.add(joint);
  const add = (parent, color, x, y) => { const m=new T.Mesh(box,new T.MeshLambertMaterial({color})); m.position.set(x,y,0);m.scale.set(2,3,1);parent.add(m);return m; };
  add(root,0xff0000,0,2);add(root,0x0000ff,1,3);add(joint,0x00ff00,0,1);add(joint,0xffffff,2,2);
  const head=new T.Mesh(box,skin);head.position.y=4;root.add(head);
  const face=add(root,0x222222,0,4);face.userData.noMerge=true;
  return {root,joint,skin,cloth,face};
}
function vertices(root) {
  root.updateMatrixWorld(true);const out=[];
  root.traverse(o=>{if(o.isMesh){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);const p=g.attributes.position;for(let i=0;i<p.count;i++)out.push([p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(4)).join(','));g.dispose();}});
  return out.sort();
}
const a=fixture(), before=vertices(a.root);context.merge(a.root,a.skin,a.cloth);
assert.deepEqual(vertices(a.root),before,'Merging moved geometry');
assert.equal(a.joint.parent,a.root,'Animated joint was removed');assert.equal(a.face.parent,a.root,'Facial decal was merged');
const b=fixture();context.merge(b.root,b.skin,b.cloth);
const ma=a.root.children.find(o=>o.isMesh&&o.material===a.cloth),mb=b.root.children.find(o=>o.isMesh&&o.material===b.cloth);
assert.equal(ma.geometry,mb.geometry,'Repeated models do not share cached geometry');assert.notEqual(ma.material,mb.material);
a.joint.rotation.x=.8;assert.notDeepEqual(vertices(a.root),before,'Joint cannot animate after merging');
assert.equal(b.joint.rotation.x,.3,'Animation leaked to another model');
console.log('Rigid character merge: transforms, joints, decals, cache and instance independence OK');
