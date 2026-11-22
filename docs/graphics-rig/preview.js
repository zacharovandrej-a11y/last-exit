import { createSuit } from './rig.js';

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
  const fill = new T.DirectionalLight(0x86a5d1, .40);
  fill.position.set(25, 22, -33);
  scene.add(fill);

  const floorTex = document.createElement('canvas');
  floorTex.width = floorTex.height = 256;
  const ctx = floorTex.getContext('2d');
  ctx.fillStyle = '#746d63'; ctx.fillRect(0,0,256,256);
  let seed = 211;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i=0; i<11500; i++) {
    const v = 77 + Math.floor(rand() * 69);
    ctx.fillStyle = `rgb(${v},${v-4},${v-9})`;
    ctx.fillRect(rand()*256,rand()*256,1+rand()*2,1+rand()*2);
  }
  const asphalt = new T.CanvasTexture(floorTex);
  asphalt.wrapS = asphalt.wrapT = T.RepeatWrapping;
  asphalt.repeat.set(13,15);
  const floor = new T.Mesh(new T.PlaneGeometry(255,240),new T.MeshLambertMaterial({map:asphalt}));
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);
  const rig = createSuit(T,data);
  scene.add(rig.mesh,rig.cap);

  const views = [[1,1,1], [.28,.47,1], [1,.35,.03], [-.48,.58,-1]];
  let view=0, capture=location.search.includes('capture');
  const cycle = 1.12, advance = 16;
  function resize(){
    renderer.setSize(Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight),false);
    const h=37, w=h*canvas.clientWidth/canvas.clientHeight;
    Object.assign(camera,{left:-w/2,right:w/2,top:h/2,bottom:-h/2,near:.1,far:400});
    camera.updateProjectionMatrix();
  }
  function render(t, angle=view){
    const [x,y,z] = views[angle];
    const phase = t / cycle % 1;
    const position = phase * advance;
    floor.position.z = -phase * advance;
    // The camera tracks the body; the ground moves at the same rate as the root.
    camera.position.set(x*75,y*75,z*75);
    camera.lookAt(0,8.8,-1.3);
    rig.begin();
    rig.pose(0,{id:1,time:t,walk:phase, yaw:0, z:0});
    rig.upload(1);
    renderer.render(scene,camera);
    return position;
  }
  for(const button of document.querySelectorAll('[data-view]')) button.onclick=()=>{
    view=Number(button.dataset.view);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',el===button));
    if(capture) render(.31);
  };
  window.addEventListener('resize',resize);
  resize();
  render(.31);
  window.suitPreview = { render, rig, renderer, cycle };
  if(!capture) renderer.setAnimationLoop(t=>render(t/1000));
} catch (err) {
  error.textContent = err.message;
  console.error(err);
}
