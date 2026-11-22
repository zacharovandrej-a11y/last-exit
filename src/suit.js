const RaiderSuit = (() => {
// Up to two diagonal steps, with a short hold before the next burst.
const SUIT_STRIDE_LENGTH = 13;

function suitStride(clock, id) {
  const sequence = clock * (1 + ((id % 7) - 3) * .028) / 2;
  const progress = Math.min(1, (sequence - Math.floor(sequence)) / (id % 3 ? .82 : .73));
  return 2 * (Math.floor(sequence) + progress * progress * (3 - 2 * progress));
}

/* Procedural GPU skinning prototype. No animation data or textures are baked. */
function createSuit(T, data, capacity = 400, outfit = null) {
  const bearer = outfit === "bearer", street = outfit !== null;
  const count = data.bones.length;
  const geometry = new T.BufferGeometry();
  const positions = [...data.positions], joints = [...data.joints];
  const weights = [...data.weights], indices = [...data.indices];
  const eyeFlags = Array(positions.length / 3).fill(0);
  if (street) {
    for (let i = 0; i < positions.length; i += 3) {
      const [px, py, pz] = data.positions.slice(i, i + 3);
      const shirt = py > 5 && py < 17 && Math.abs(px) < 7.9;
      const shorts = py > -5.5 && py < 4.7;
      if (shirt || shorts) {
        const center = shorts && py < 0 ? Math.sign(px) * 3.3 : 0;
        positions[i] += (px - center) * (shirt ? .045 : .075);
        positions[i + 2] = pz * 1.075;
      }
      if (py > 23.2 && (pz < 1 || py > 24.1)) {
        positions[i + 1] += Math.min(1.25, (py - 23.2) * .55) * (1 + .17 * px);
      }
    }
  }
  if (bearer) {
    for (let i = 0; i < positions.length; i += 3) {
      const py = positions[i + 1], px = positions[i];
      const torso = Math.max(0, 1 - Math.abs(py - 7) / 16) * Math.max(0, 1 - Math.max(0, Math.abs(px) - 5) / 5);
      positions[i] *= 1 + torso * .34;
      positions[i + 2] *= 1 + torso * .48;
      // Fuller swept-back hair profile, still continuous with the head.
      if (py > 21 && positions[i + 2] < .7) positions[i + 2] -= Math.min(1.7, (py - 21) * .5);
    }
    // Remove the body surface fully covered by the skirt to prevent poke-through.
    let visible = 0;
    const covered = i => {
      const py = positions[i * 3 + 1];
      return py > -11.5 && py < 3 && Math.abs(positions[i * 3]) < 9;
    };
    for (let i = 0; i < indices.length; i += 3) {
      if (covered(indices[i]) && covered(indices[i + 1]) && covered(indices[i + 2])) continue;
      for (let j = 0; j < 3; j++) indices[visible++] = indices[i + j];
    }
    indices.length = visible;
    const start = positions.length / 3, segments = 24;
    const shape = [[3, 7.3, 5.65], [-1, 8.7, 6.5], [-7, 9.5, 7.7], [-13, 10.9, 9.0], [-15, 11.35, 9.6]];
    for (let row = 0; row < shape.length; row++) {
      const [height, width, depth] = shape[row];
      for (let n = 0; n < segments; n++) {
        const angle = n * 2 * Math.PI / segments;
        const px = Math.cos(angle), pz = Math.sin(angle);
        const pleat = 1 + Math.cos(angle * 8) * row * .009;
        positions.push(px * width * pleat, height + Math.cos(angle * 8) * row * .09, pz * depth * pleat + Math.max(0, pz) * row * 1.25);
        joints.push(0, px < 0 ? 13 : 7, 0, 0);
        const follow = row * .072 * (.55 + .45 * Math.abs(px));
        weights.push(1 - follow, follow, 0, 0);
        eyeFlags.push(2);
        if (row) {
          const top = start + (row - 1) * segments, next = (n + 1) % segments;
          indices.push(top + n, top + next, top + n + segments,
            top + next, top + next + segments, top + n + segments);
        }
      }
    }
  }
  const globe = new T.SphereGeometry(1, 8, 4);
  for (const [cx, cy, cz] of (street ? [] : data.eyes)) {
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
      if (${street ? "false" : "suitEye < .5"} && suitBindPosition.z > 3.95 && length(eyeOpening(suitBindPosition)) < 1.) discard;
    `);
  }
  const material = new T.MeshPhongMaterial({
    color: 0xffffff, specular: 0x121212, shininess: street ? 8 : 105, emissive: 0x070709
  });
  material.customProgramCacheKey = () => street ? 'instanced-' + outfit + '-phong' : 'instanced-suit-phong';
  material.onBeforeCompile = shader => {
    installSkin(shader);
    if (bearer) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 p = suitBindPosition;
        float neckline = 17.05 - (1.-smoothstep(.35,3.8,abs(p.x))) * smoothstep(.7,3.8,p.z) * 2.2;
        float bodice = smoothstep(-2.,1.,p.y) * (1.-smoothstep(neckline,neckline+.3,p.y))
          * (1.-smoothstep(8.4,8.65,abs(p.x)));
        float skirt = step(1.5,suitEye);
        float cloth = max(bodice,skirt);
        float trim = (1.-smoothstep(.24,.49,abs(p.y-2.1))) * cloth;
        trim += smoothstep(13.7,14.5,-p.y) * skirt * (1.-smoothstep(14.5,15.,-p.y));
        vec3 tone = mix(vec3(.65,.43,.34),vec3(.39,.14,.22),cloth);
        tone = mix(tone,vec3(.54,.34,.22),clamp(trim,0.,1.)*.74);
        float hair = smoothstep(21.2,22.1,p.y) *
          (1.-smoothstep(-.3,.85,p.z) + smoothstep(23.4,24.25,p.y)*smoothstep(-.1,.6,p.z));
        tone = mix(tone,vec3(.22,.115,.10),clamp(hair,0.,1.));
        tone = mix(tone,vec3(.15,.12,.17),1.-smoothstep(-21.6,-20.5,p.y));
        diffuseColor.rgb *= tone;
      `);
      return;
    }
    if (street) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 p = suitBindPosition;
        float x = abs(p.x);
        float front = smoothstep(1.5,3.5,p.z);
        float collar = smoothstep(13.0,17.0,p.y);
        float open = front * (1.-smoothstep(.36,.65,x-collar*2.25));
        float torso = smoothstep(5.1,5.35,p.y) * (1.-smoothstep(16.6,18.5,p.y)) *
          (1.-smoothstep(7.35,7.62,x));
        float sleeve = smoothstep(11.0,11.28,p.y) * (1.-smoothstep(7.55,7.8,x));
        float shirt = max(torso,sleeve * (1.-smoothstep(16.6,17.6,p.y))) * (1.-open);
        float shorts = smoothstep(-5.6,-5.35,p.y) * (1.-smoothstep(4.6,4.82,p.y));
        float seam = (1.-smoothstep(.08,.24,abs(x-6.0))) * shorts;
        float hem = (1.-smoothstep(.05,.27,abs(p.y+5.05))) * shorts;
        float shoes = 1.-smoothstep(-20.95,-20.68,p.y);
        float sole = 1.-smoothstep(-24.25,-23.82,p.y);
        float hair = smoothstep(22.0+front*1.8,22.5+front*1.8,p.y);
        vec3 tone = mix(vec3(.66,.42,.29),vec3(.82,.28,.22),shirt);
        tone = mix(tone,vec3(.16,.28,.46)+vec3(.19)*max(seam,hem),shorts);
        tone = mix(tone,mix(vec3(.16,.15,.18),vec3(.77,.75,.70),sole),shoes);
        tone = mix(tone,vec3(.12,.62,.73),hair);
        diffuseColor.rgb *= tone;
      `);
      return;
    }
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
  depth.customProgramCacheKey = () => street ? 'instanced-' + outfit + '-depth' : 'instanced-suit-depth';
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
    return frame(a, b, contact && (!street || i === 9 || i === 15) ? down : front, new T.Matrix4()).invert();
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
  function poseStreet(index, state) {
    const { walk, yaw, x: px, z: pz, scale, fall, attack, hit, lost, burning, frozen, backTurn, lift, grip, wave = 0 } = state;
    const sway = Math.cos(walk), strike = attack * (1 - fall);
    const turn = 1 - backTurn * 2, crossing = (1 - strike) * (1 - backTurn);
    const bob = Math.abs(Math.sin(walk)) * (bearer ? .65 : .85);
    const crouch = (lost & 4) ? 1 : 0;
    const root = (25.2 + bob - strike * 1.6) * (1 - crouch * .63);
    world.position.set(px, lift + fall * 4 * scale, pz);
    world.rotation.set(-fall * 1.49 + crouch * .65, yaw + Math.PI * backTurn, 0, 'YXZ');
    world.scale.setScalar(scale);
    world.updateMatrix();
    instance.copy(world.matrix);
    mesh.setMatrixAt(index, instance);

    pelvis.set(sway * 1.05 * crossing, root + bind[0][0].y, -.8);
    waist.set(sway * .56 * crossing, root + bind[1][0].y, -.65);
    chest.set(-sway * .48 * crossing, root + bind[2][0].y, .8 + strike * 2);
    neck.set(-sway * .72 * crossing, root + bind[3][0].y - strike, 2.5 + strike * 6);
    face.copy(neck).add(ref.set(sway * .32, 7.4, 1.0 + strike * 1.2));
    write(0, pelvis, waist);
    write(1, waist, chest);
    write(2, chest, neck);
    if (lost & 16) {
      bones[3].makeScale(0, 0, 0).setPosition(neck);
      stump(neck, 1.15);
    } else write(3, neck, face);

    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex ? -1 : 1;
      const stride = Math.sin(walk) * side;
      const flagHand = bearer && side < 0 && grip;
      for (let leg = 0; leg < 2; leg++) {
        const i = 4 + sideIndex * 6 + leg * 3;
        anchor.copy(bind[i][0]).applyMatrix4(bones[leg ? 0 : 2]);
        if (lost & (leg ? 4 : (sideIndex ? 2 : 1))) {
          for (let k = i; k < i + 3; k++) bones[k].makeScale(0, 0, 0).setPosition(anchor);
          stump(anchor, leg ? 1.5 : 1.08);
          continue;
        }
        if (leg) {
          end.set(side * (bearer ? 4.75 : 4.2 - crossing * (1.4 + Math.max(0, stride) * 1.23)),
            2.9 + Math.max(0, stride) * 2.5, stride * (bearer ? 4.6 : 6.1) * turn);
          ref.set(side * .17, 0, 1);
        } else if (flagHand) {
          end.set(-8.4 - wave * 1.6, anchor.y - 6.9 + strike * 1.8, 7.0 + wave * 2.4 + strike * 2);
          ref.set(-.7, -1, -.24);
        } else {
          end.set(side * 7.4 + sway * crossing * 1.2, anchor.y - 12.1 + strike * 3.6,
            1.7 - stride * 3.9 * turn + strike * (side > 0 ? 10.4 : 7.4));
          ref.set(side * .47, -.12, -1);
        }
        solve(anchor, end, length[i] * 1.05, length[i + 1] * 1.05, ref);
        write(i, anchor, mid);
        write(i + 1, mid, end);
        if (leg) tip.set(end.x - side * .26, end.y - 1.63, end.z + 4.85);
        else if (flagHand) {
          tip.set(end.x - .45, end.y + .08, end.z + 2.85);
          grip.copy(end).lerp(tip, .53);
        } else tip.set(end.x + side * sway * crossing * .92, end.y - 3 + strike * 2.6,
          end.z + .75 - stride * .75 + strike * 2.2);
        write(i + 2, end, tip, ref.set(0, leg ? -1 : 0, leg ? 0 : 1));
      }
    }
    for (let i = 0; i < count; i++) bones[i].toArray(palette, (index * count + i) * 16);
    color.setHex(burning ? 0xffa56e : 0xffffff);
    if (frozen) color.lerp(ice, .58);
    if (hit > 0) color.lerp(white, Math.min(.3, hit * .3));
    mesh.setColorAt(index, color);
  }
  return {
    mesh, cap, geometry, texture, pose: street ? poseStreet : pose,
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
