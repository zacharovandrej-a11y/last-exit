import { createSuit, SUIT_STRIDE_LENGTH, suitStride } from './rig.js';

const T = THREE;
const canvas = document.querySelector('#scene');
const error = document.querySelector('#error');
try {
  const context = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: location.search.includes('capture') });
  if (!context) throw new Error('Для просмотра нужен браузер с WebGL 2.');
  const response = await fetch('./model.json');
  if (!response.ok) throw new Error('Не удалось загрузить модель.');
  const data = await response.json();
  const renderer = new T.WebGLRenderer({ canvas, context, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0x332e2a);
  const camera = new T.OrthographicCamera();
  scene.add(new T.HemisphereLight(0xa9b9cf, 0x645749, 1.15));
  const sun = new T.DirectionalLight(0xf7d2a4, 1.10);
  sun.position.set(-47, 48, 36);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left:-38, right:38, top:38, bottom:-38, near:.1, far:170 });
  sun.shadow.normalBias = .35;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xb1bdcc, .43);
  fill.position.set(25, 22, -33);
  scene.add(fill);

  const floorTex = document.createElement('canvas');
  floorTex.width = floorTex.height = 256;
  const ctx = floorTex.getContext('2d');
  ctx.fillStyle = '#454448'; ctx.fillRect(0,0,256,256);
  let seed = 211;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i=0; i<11500; i++) {
    const v = 52 + Math.floor(rand() * 25);
    ctx.fillStyle = `rgb(${v},${v-1},${v-1})`;
    ctx.fillRect(rand()*256,rand()*256,1+rand()*2,1+rand()*2);
  }
  const asphalt = new T.CanvasTexture(floorTex);
  asphalt.wrapS = asphalt.wrapT = T.RepeatWrapping;
  asphalt.repeat.set(62,62);
  const floor = new T.Mesh(new T.PlaneGeometry(1200,1200),new T.MeshLambertMaterial({map:asphalt}));
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);
  const mobileFloor = new T.Mesh(new T.PlaneGeometry(1500, 1500),
    new T.MeshLambertMaterial({ color: 0x454447 }));
  mobileFloor.rotation.x = floor.rotation.x;
  mobileFloor.receiveShadow = true;
  scene.add(mobileFloor);
  const rig = createSuit(T,data);
  scene.add(rig.mesh,rig.cap);

  const views = [[1,1,1], [.18,.21,1], [1,.35,.03], [-.48,.58,-1]];
  let view=0;
  const capture=location.search.includes('capture');
  const cycle = .86;
  function resize(){
    renderer.setSize(Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight),false);

  }
  function render(t, angle=view){
    const [x,y,z] = views[angle === 4 ? 0 : angle];
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const shorterSide = angle === 4 ? 470 : 37;
    const w = shorterSide * Math.max(1, aspect), h = shorterSide / Math.min(1, aspect);
    Object.assign(camera,{left:-w/2,right:w/2,top:h/2,bottom:-h/2,near:-1400,far:2200});
    camera.updateProjectionMatrix();
    const phase = suitStride(t / cycle, 1);
    floor.position.z = -(phase * SUIT_STRIDE_LENGTH % 240);
    floor.visible = angle !== 4;
    mobileFloor.visible = angle === 4;
    mobileFloor.position.z = -(phase * SUIT_STRIDE_LENGTH % 240);
    // The camera tracks the body; the ground moves at the same rate as the root.
    camera.position.set(x*75,y*75,z*75);
    camera.lookAt(0,8.8,-1.3);
    rig.begin();
    rig.pose(0,{id:1,time:t,walk:phase, yaw:0, z:0});
    rig.upload(1);
    renderer.render(scene,camera);

  }
  for(const button of document.querySelectorAll('[data-view]')) button.onclick=()=>{
    view=Number(button.dataset.view);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',el===button));
    if(capture) render(.31);
  };
  window.addEventListener('resize',resize);
  resize();
  render(.31);
  window.suitPreview = { render, rig, renderer, cycle: cycle * 2 / .944 };
  if(!capture) renderer.setAnimationLoop(t=>render(t/1000));
} catch (err) {
  error.textContent = err.message;
  console.error(err);
}
