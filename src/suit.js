const RaiderSuit = (() => {
// Up to two diagonal steps, with a short hold before the next burst.
const SUIT_STRIDE_LENGTH = 13;

function suitStride(clock, id) {
  const sequence = clock * (1 + ((id % 7) - 3) * .028) / 2;
  const progress = Math.min(1, (sequence - Math.floor(sequence)) / (id % 3 ? .82 : .73));
  return 2 * (Math.floor(sequence) + progress * progress * (3 - 2 * progress));
}

/* Procedural GPU skinning prototype. No animation data or textures are baked. */
function createSuit(T, data, capacity = 400) {
  const count = data.bones.length;
  const geometry = new T.BufferGeometry();
  const positions = [...data.positions], joints = [...data.joints];
  const weights = [...data.weights], indices = [...data.indices];
  const eyeFlags = Array(positions.length / 3).fill(0);
  const globe = new T.SphereGeometry(1, 8, 4);
  for (const [cx, cy, cz] of data.eyes) {
    const base = positions.length / 3;
    const points = globe.attributes.position;
    for (let i = 0; i < points.count; i++) {
      positions.push(cx + points.getX(i) * .63, cy + points.getY(i) * .61,
        cz + .12 + points.getZ(i) * .90);
      joints.push(3, 0, 0, 0);
      weights.push(1, 0, 0, 0);
      eyeFlags.push(1);
    }
    for (const i of globe.index.array) indices.push(base + i);
  }
  globe.dispose();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('jointIndices', new T.Uint8BufferAttribute(joints, 4));
  geometry.setAttribute('jointWeights', new T.Float32BufferAttribute(weights, 4));
  geometry.setAttribute('eyeSurface', new T.Uint8BufferAttribute(eyeFlags, 1));
  geometry.setIndex(indices);
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
    attribute float eyeSurface;
    varying float suitEye;
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
      mat4 result = jointMatrix(int(jointIndices.x)) * jointWeights.x;
      if (jointWeights.y > 0.) result += jointMatrix(int(jointIndices.y)) * jointWeights.y;
      if (jointWeights.z > 0.) result += jointMatrix(int(jointIndices.z)) * jointWeights.z;
      if (jointWeights.w > 0.) result += jointMatrix(int(jointIndices.w)) * jointWeights.w;
      return result / max(sum, .0001);
    }
  `;
  const mask = `
    varying float suitEye;
    varying vec3 suitBindPosition;
    vec2 eyeOpening(vec3 p) {
      return vec2((abs(p.x)-.96)/.64, (p.y-21.91-(abs(p.x)-.96)*.12)/.33);
    }
  `;
  function installSkin(shader) {
    shader.uniforms.suitBones = { value: texture };
    shader.vertexShader = vertex + shader.vertexShader
      .replace(/void main\s*\(\s*\)\s*\{/, '$&\nmat4 skin = suitSkin();')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = mat3(skin) * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsuitEye=eyeSurface; suitBindPosition=position; transformed=(skin*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = mask + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      if (suitEye < .5 && suitBindPosition.z > 3.95 && length(eyeOpening(suitBindPosition)) < 1.) discard;
    `);
  }
  const material = new T.MeshPhongMaterial({
    color: 0xffffff, specular: 0x121212, shininess: 105, emissive: 0x070709
  });
  material.customProgramCacheKey = () => 'instanced-suit-phong';
  material.onBeforeCompile = shader => {
    installSkin(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        vec3 p = suitBindPosition;
        vec2 opening = eyeOpening(p);
        if (suitEye > .5) {
          float iris = length((opening - vec2(.08, .03))*vec2(1.25,.76));
          float ring = smoothstep(.37,.46,iris);
          float pupil = smoothstep(.16,.22,iris);
          vec3 eyeball = mix(mix(vec3(.037,.031,.028),vec3(.23,.18,.13),pupil),vec3(.37,.32,.27),ring);
          float inMaskShadow = smoothstep(.05,.95,opening.y) * .42;
          gl_FragColor.rgb = eyeball * (.64+.20*max(normal.z,0.)) * (1.-inMaskShadow);
          gl_FragColor.rgb += vec3(.18)*(1.-smoothstep(.06,.13,length(opening-vec2(-.05,.24))));
        }
        float lip = suitEye < .5 && p.z > 3.95
          ? smoothstep(1.,1.10,length(opening))*(1.-smoothstep(1.10,1.29,length(opening)))
          : 0.;
        gl_FragColor.rgb += vec3(.038,.037,.035) * lip * (.35+.65*max(normal.y,0.));
        float rim = 1.0-max(dot(normal,normalize(vViewPosition)),0.0);
        gl_FragColor.rgb += vec3(.15,.16,.18)*rim*rim*.40;
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
  const inverse = bind.map(([a, b], i) => {
    const contact = i === 6 || i === 9 || i === 12 || i === 15;
    return frame(a, b, contact ? down : front, new T.Matrix4()).invert();
  });
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
      x: px = 0, z: pz = 0, scale = 1, lift = 0 } = state;
    const phase = walk + id * .13;
    const crouch = attack >= 0 && attack < .13 ? Math.sin(attack / .13 * Math.PI) * 2 : 0;
    const lunge = attack >= .13 ? Math.max(0, 1 - Math.abs((attack - .22) / .09)) : 0;
    const stance = .58;
    const strideAngle = phase * Math.PI * 2;
    const roll = Math.sin(strideAngle);
    const landingPhase = phase * 2 - Math.floor(phase * 2);
    // Cushion each landing, then carry the chest over the planted diagonal.
    const weight = Math.sin(Math.PI * Math.min(1, landingPhase / .54));
    const supportSide = Math.sin(strideAngle) >= 0 ? 1 : -1;
    const transfer = supportSide * weight;
    const arch = Math.sin(strideAngle * 2) * .44;
    const fallEase = fall * (2 - fall);
    const t = frozen ? (state.freezeTime ?? time) : time;
    const twitch = (t + id * .71) % (3.1 + (id % 7) * .37);
    const snap = twitch < .23 ? Math.sin(twitch * 45) * (1 - twitch / .23) ** 2 : 0;
    const reel = blast * 6, ground = (fallback, standing) => fallback * fallEase + standing * (1 - fallEase);
    const rear = backTurn * Math.PI;
    const drop = Math.sin(fallEase * Math.PI / 2);
    world.position.set(px, lift + (Math.sin(blast * Math.PI) * 4 + drop * 4.4) * scale, pz);
    world.scale.setScalar(scale);
    world.rotation.set(-blast * .5 * impact, yaw + rear, fallEase * 1.40 * impact + blast * .65 * impact, 'YXZ');
    world.updateMatrix();
    instance.copy(world.matrix);
    mesh.setMatrixAt(index, instance);

    pelvis.set(-transfer * .66, ground(4.7, 17.95 + arch - weight * .27), -10.6 - reel);
    waist.set(transfer * .19, ground(3.9, 16.9 - arch * .55 - weight * .50 - crouch), -7.8 - reel + lunge * 1.1);
    chest.set(transfer * .91, ground(3.6, 15.8 + arch * .62 - weight * .82 - crouch * 1.9), -2.2 - reel + lunge * 3);
    neck.set(transfer * .36, ground(2.8, 15.05 - arch * .56 - weight * .48 - crouch - hit * 1.2), 7.05 - reel + lunge * 7);
    face.copy(neck).add(ref.set((id % 2 ? -1 : 1) * snap * 3.4 + backTurn * 1.2,
      ground(1.5, 6.5 - snap * 1.65), 3.4));
    ref.set(0, -1, .1);
    // Rotate the pelvis without stretching the rear contour along the spine.
    frame(pelvis, waist, ref, bones[0]).multiply(inverse[0]);
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
        if (!leg) anchor.y -= (side * transfer * .62 + side * roll * .28) * (1 - fallEase);
        const diagonal = phase + ((sideIndex === leg) ? 0 : .5);
        const step = diagonal - Math.floor(diagonal);
        const swing = Math.max(0, (step - stance) / (1 - stance));
        const reach = SUIT_STRIDE_LENGTH * stance / 2;
        const stride = step < stance ? reach - step * SUIT_STRIDE_LENGTH : -reach * Math.cos(swing * Math.PI);
        // Raise the heel before lift-off; the toes stay down through the push.
        const heel = leg && step < stance ? Math.max(0, (step - .38) / (stance - .38)) : 0;
        const heelLift = Math.sin(heel * Math.PI) * (1 - fallEase);
        const lift = Math.sin(swing * Math.PI) * (leg ? 4.8 : 5.5);
        end.set(side * ((leg ? 5.8 : 8.1 + crouch * 1.4) + blast * 2),
          ground(1.9 + (side === impact ? .6 : 0), (leg ? 2.25 : .85) + heelLift + lift + blast * 4 + (leg ? backTurn * 8 : 0)),
          (leg ? -16.4 : 11.5) + stride * (1 - fallEase) + (leg ? -backTurn * 8 : lunge * 9));
        ref.set(side * (leg ? .16 : .57), leg ? .75 : .33, leg ? .85 : -.82);
        solve(anchor, end, length[i] * (leg ? 1 : 1.25), length[i + 1] * (leg ? 1 : 1.15), ref);
        write(i, anchor, mid, front);
        write(i + 1, mid, end, front);
        tip.set(end.x + side * .48, Math.max(.62, end.y - (leg ? 1.55 + heelLift : .64)), end.z + (leg ? 4.05 : 3.1));
        write(i + 2, end, tip, down);
      }
    }
    for (let i = 0; i < count; i++) bones[i].toArray(palette, (index * count + i) * 16);
    color.setHex(burning ? 0x1a1413 : 0x0b0b0e);
    if (frozen) color.lerp(ice, .58);
    if (hit > 0) color.lerp(white, Math.min(.3, hit * .3));
    mesh.setColorAt(index, color);
  }
  return {
    mesh, cap, geometry, texture, pose,
    begin() { cap.count = 0; },
    upload(instances) {
      mesh.count = instances;
      if (instances) {
        mesh.instanceMatrix.updateRange.count = instances * 16;
        mesh.instanceColor.updateRange.count = instances * 3;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        texture.needsUpdate = true;
      }
      if (cap.count) {
        cap.instanceMatrix.updateRange.count = cap.count * 16;
        cap.instanceMatrix.needsUpdate = true;
      }
    }
  };
}

return { createSuit, SUIT_STRIDE_LENGTH, suitStride };
})();
