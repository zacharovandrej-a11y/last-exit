/* Procedural GPU skinning prototype. No animation data or textures are baked. */
export function createSuit(T, data, capacity = 400) {
  const count = data.bones.length;
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('jointIndices', new T.Uint8BufferAttribute(data.joints, 4));
  geometry.setAttribute('jointWeights', new T.Float32BufferAttribute(data.weights, 4));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();

  // Four RGBA32F texels form a column-major matrix; one row per instance.
  const palette = new Float32Array(capacity * count * 16);
  const texture = new T.DataTexture(palette, count * 4, capacity, T.RGBAFormat, T.FloatType);
  texture.minFilter = texture.magFilter = T.NearestFilter;
  texture.generateMipmaps = false;

  const vertex = `
    uniform highp sampler2D suitBones;
    attribute vec4 jointIndices;
    attribute vec4 jointWeights;
    varying vec3 suitBindPosition;
    mat4 jointMatrix(int joint) {
      int x = joint * 4, y = gl_InstanceID;
      return mat4(texelFetch(suitBones, ivec2(x, y), 0),
                  texelFetch(suitBones, ivec2(x + 1, y), 0),
                  texelFetch(suitBones, ivec2(x + 2, y), 0),
                  texelFetch(suitBones, ivec2(x + 3, y), 0));
    }
    mat4 suitSkin() {
      float sum = dot(jointWeights, vec4(1.0));
      return (jointMatrix(int(jointIndices.x)) * jointWeights.x +
              jointMatrix(int(jointIndices.y)) * jointWeights.y +
              jointMatrix(int(jointIndices.z)) * jointWeights.z +
              jointMatrix(int(jointIndices.w)) * jointWeights.w) / max(sum, .0001);
    }
  `;
  function installSkin(shader) {
    shader.uniforms.suitBones = { value: texture };
    shader.vertexShader = vertex + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat4 normalSkin = suitSkin(); objectNormal = mat3(normalSkin) * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsuitBindPosition=position; transformed=(suitSkin()*vec4(transformed,1.)).xyz;');
  }
  const material = new T.MeshPhongMaterial({
    color: 0xffffff, specular: 0x232934, shininess: 128, emissive: 0x090a0c
  });
  material.customProgramCacheKey = () => 'instanced-suit-phong';
  material.onBeforeCompile = shader => {
    installSkin(shader);
    shader.fragmentShader = 'varying vec3 suitBindPosition;\n' + shader.fragmentShader
      .replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        vec3 p = suitBindPosition;
        float rear = smoothstep(.45,1.6,-p.z);
        float zipper = (1.-smoothstep(.075,.22,abs(p.x))) * rear
          * smoothstep(-1.6,-.9,p.y) * (1.-smoothstep(10.5,11.1,p.y));
        float teeth = .58+.42*step(.44,fract(p.y*5.2));
        float tab = (1.-smoothstep(.14,.24,abs(p.x)))
          * (1.-smoothstep(.38,.54,abs(p.y+.82))) * rear;
        float hoodSeam = (1.-smoothstep(.06,.16,abs(p.x))) * smoothstep(21.,23.,p.y) * rear;
        float sideSeam = (1.-smoothstep(.09,.21,abs(p.z-.32))) * smoothstep(2.8,4.2,abs(p.x))
          * smoothstep(-17.,-12.,p.y) * (1.-smoothstep(3.2,5.,p.y));
        float rim = 1.0-max(dot(normal,normalize(vViewPosition)),0.0);
        gl_FragColor.rgb += vec3(.115,.145,.2)*rim*rim*rim*.19;
        gl_FragColor.rgb += vec3(.19,.181,.166)*(zipper*teeth*.53+tab*.36+hoodSeam*.13+sideSeam*.19);
      `);
  };
  const mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.setColorAt(0, new T.Color(0xffffff));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  depth.customProgramCacheKey = () => 'instanced-suit-depth';
  depth.onBeforeCompile = installSkin;
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.instanceColor.setUsage(T.DynamicDrawUsage);

  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const x = V(), y = V(), z = V(), ref = V();
  const front = V(0, 0, 1), down = V(0, -1, 0);
  const bind = data.bones.map(pair => pair.map(p => V(...p)));
  function frame(a, b, reference, out, scale = 1) {
    y.subVectors(b, a).normalize();
    z.copy(reference).addScaledVector(y, -reference.dot(y)).normalize();
    x.crossVectors(y, z);
    out.makeBasis(x, y.multiplyScalar(scale), z).setPosition(a);
    return out;
  }
  const inverse = bind.map(([a, b]) => frame(a, b, front, new T.Matrix4()).invert());
  const length = bind.map(([a, b]) => a.distanceTo(b));
  const bones = bind.map(() => new T.Matrix4());
  const pelvis = V(), waist = V(), chest = V(), neck = V(), face = V();
  const anchor = V(), mid = V(), end = V(), tip = V(), axis = V(), pole = V();
  const world = new T.Object3D(), color = new T.Color(), white = new T.Color(0xc5ccd6);
  const ice = new T.Color(0x76a5c3);

  // One possible cap per arm or head, shown only for the corresponding lost bit.
  const cap = new T.InstancedMesh(new T.SphereGeometry(1, 8, 4),
    new T.MeshLambertMaterial({ color: 0x46191a }), capacity * 5);
  cap.frustumCulled = false;
  cap.count = 0;
  const capPoint = V(), capSize = V(), capRotation = new T.Quaternion();
  const capMatrix = new T.Matrix4(), instance = new T.Matrix4();

  function write(bone, a, b, reference = front) {
    frame(a, b, reference, bones[bone], a.distanceTo(b) / length[bone]).multiply(inverse[bone]);
  }
  function solve(a, b, upper, lower, direction) {
    axis.subVectors(b, a);
    const span = axis.length();
    axis.multiplyScalar(1 / Math.max(span, .001));
    const reach = Math.max(.001, Math.min(span, upper + lower - .03));
    if (reach !== span) b.copy(a).addScaledVector(axis, reach);
    const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach);
    pole.copy(direction).addScaledVector(axis, -direction.dot(axis)).normalize();
    mid.copy(a).addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper ** 2 - along ** 2)));
  }
  function stump(point, width) {
    capPoint.copy(point);
    capSize.set(width, width * .65, width * .82);
    capMatrix.compose(capPoint, capRotation, capSize).premultiply(instance);
    cap.setMatrixAt(cap.count++, capMatrix);
  }

  function pose(index, state) {
    const { id = 1, time = 0, walk = 0, yaw = 0, attack = -1, backTurn = 0,
      hit = 0, fall = 0, impact = 1, blast = 0, lost = 0, frozen = false, burning = false,
      x: px = 0, z: pz = 0 } = state;
    const phase = walk + id * .13;
    const crouch = attack >= 0 && attack < .13 ? Math.sin(attack / .13 * Math.PI) * 2 : 0;
    const lunge = attack >= .13 ? Math.max(0, 1 - Math.abs((attack - .22) / .09)) : 0;
    const arch = Math.sin(phase * Math.PI * 4) * .52;
    const fallEase = fall * (2 - fall);
    const t = frozen ? (state.freezeTime ?? time) : time;
    const twitch = (t + id * .71) % (3.1 + (id % 7) * .37);
    const snap = twitch < .31 ? (1 - twitch / .31) ** 2 : 0;
    const reel = blast * 6, ground = (fallback, standing) => fallback * fallEase + standing * (1 - fallEase);
    const rear = backTurn * Math.PI;
    world.position.set(px, Math.sin(blast * Math.PI) * 4, pz);
    world.rotation.set(-blast * .5 * impact, yaw + rear, fallEase * 1.05 * impact + blast * .65 * impact, 'YXZ');
    world.updateMatrix();
    instance.copy(world.matrix);
    mesh.setMatrixAt(index, instance);

    pelvis.set(arch * .5, ground(4.7, 16.5 + arch), -10.6 - reel);
    waist.set(0, ground(3.9, 16.4 - arch * .42 - crouch), -7.8 - reel + lunge * 1.1);
    chest.set(-arch * .35, ground(3.6, 15.55 + arch * .38 - crouch), -2.2 - reel + lunge * 3);
    neck.set(arch * .45, ground(2.8, 15.05 - arch * .56 - crouch - hit * 1.2), 7.05 - reel + lunge * 7);
    face.copy(neck).add(ref.set((id % 2 ? -1 : 1) * snap * 3.4 + backTurn * 1.2,
      ground(1.5, 3.9 - snap * .8), 5.6));
    ref.set(0, -1, .1);
    write(0, pelvis, waist, ref);
    write(1, waist, chest, ref);
    write(2, chest, neck, ref);
    if (lost & 16) {
      bones[3].makeScale(0, 0, 0).setPosition(neck);
      stump(neck, 1.12);
    } else write(3, neck, face);

    // Stationary contact advances by exactly the inverse root motion during stance.
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex ? -1 : 1;
      for (let leg = 0; leg <= 1; leg++) {
        const i = 4 + sideIndex * 6 + leg * 3;
        anchor.copy(bind[i][0]).applyMatrix4(bones[leg ? 0 : 2]);
        if ((!leg && (lost & (sideIndex ? 2 : 1))) || (leg && (lost & 4))) {
          for (let k = i; k < i + 3; k++) bones[k].makeScale(0, 0, 0).setPosition(anchor);
          stump(anchor, leg ? 1.5 : 1.08);
          continue;
        }
        const diagonal = phase + ((sideIndex === leg) ? 0 : .5);
        const step = diagonal - Math.floor(diagonal), stance = .58;
        const swing = Math.max(0, (step - stance) / (1 - stance));
        const stride = step < stance ? 4.64 - step * 16 : -4.64 * Math.cos(swing * Math.PI);
        const lift = Math.sin(swing * Math.PI) * (leg ? 4.8 : 5.5);
        end.set(side * ((leg ? 5.4 : 7.7) + blast * 2),
          ground(1.9 + (side === impact ? .6 : 0), (leg ? 1.95 : 1.0) + lift + blast * 4 + (leg ? backTurn * 8 : 0)),
          (leg ? -16.4 : 11.5) + stride * (1 - fallEase) + (leg ? -backTurn * 8 : lunge * 9));
        ref.set(side * (leg ? .16 : .57), leg ? .75 : .33, leg ? .85 : -.82);
        solve(anchor, end, length[i] * 1.15, length[i + 1] * 1.15, ref);
        write(i, anchor, mid, front);
        write(i + 1, mid, end, front);
        tip.set(end.x + side * .48, Math.max(.62, end.y - (leg ? 1.14 : .35)), end.z + (leg ? 3.15 : 2.76));
        write(i + 2, end, tip, down);
      }
    }
    for (let i = 0; i < count; i++) bones[i].toArray(palette, (index * count + i) * 16);
    color.setHex(burning ? 0x1a1413 : 0x191b20);
    if (frozen) color.lerp(ice, .58);
    if (hit > 0) color.lerp(white, Math.min(.3, hit * .3));
    mesh.setColorAt(index, color);
  }
  return {
    mesh, cap, geometry, texture, pose,
    begin() { cap.count = 0; },
    upload(instances) {
      mesh.count = instances;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      cap.instanceMatrix.needsUpdate = true;
      texture.needsUpdate = true;
    }
  };
}
