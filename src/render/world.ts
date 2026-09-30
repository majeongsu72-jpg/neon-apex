import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { angleDifference, seededRandom } from '../game/math';
import type { TrackDefinition } from '../game/types';
import { createAsphalt, createFacade, createGlowTexture, signTexture, textureFromCanvas } from './textures';

export interface World {
  root: THREE.Group;
  chunks: { group: THREE.Group; x: number; z: number }[];
  water: THREE.ShaderMaterial;
}

function roadRibbon(track: TrackDefinition, left: number, right: number, y: number, start = 0, end = track.length) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const count = Math.ceil((end - start) / 5);
  for (let i = 0; i <= count; i++) {
    const s = start + (end - start) * i / count;
    const p = track.sample(s);
    positions.push(p.x + p.nx * left, y, p.z + p.nz * left, p.x + p.nx * right, y, p.z + p.nz * right);
    uv.push(0, s / 18, 1, s / 18);
    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function wallRibbon(track: TrackDefinition, offset: number, bottom: number, top: number, start = 0, end = track.length) {
  const positions: number[] = [], indices: number[] = [];
  const count = Math.ceil((end - start) / 5);
  for (let i = 0; i <= count; i++) {
    const p = track.sample(start + (end - start) * i / count);
    positions.push(p.x + p.nx * offset, bottom, p.z + p.nz * offset, p.x + p.nx * offset, top, p.z + p.nz * offset);
    if (i < count) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function instances(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); if (colors) mesh.setColorAt(i, colors[i]); });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function transform(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
}

export function createWorld(track: TrackDefinition): World {
  const root = new THREE.Group();
  const random = seededRandom(90731);
  const chunks: World['chunks'] = [];
  const coastStart = track.length * .32, coastEnd = track.length * .455;
  const coastSamples = Array.from({ length: 45 }, (_, i) => track.sample(coastStart + (coastEnd - coastStart) * i / 44));
  const bayPolygon = [
    ...coastSamples.map(p => ({ x: p.x + p.nx * 18, z: p.z + p.nz * 18 })),
    ...[...coastSamples].reverse().map(p => ({ x: p.x + p.nx * 115, z: p.z + p.nz * 115 })),
  ];
  const inBay = (x: number, z: number) => {
    let inside = false;
    for (let i = 0, j = bayPolygon.length - 1; i < bayPolygon.length; j = i++) {
      const a = bayPolygon[i], b = bayPolygon[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  const shoreX = Math.max(...track.samples.map(p => p.x)) + 25;
  const dockZ = coastSamples.reduce((sum, p) => sum + p.z, 0) / coastSamples.length;
  const asphalt = createAsphalt();
  const roadMaterial = new THREE.MeshStandardMaterial({ map: asphalt, color: '#6b7380', metalness: .18, roughness: .63 });
  const pavement = new THREE.MeshStandardMaterial({ color: '#18222e', roughness: .9 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#314356', metalness: .7, roughness: .4, side: THREE.DoubleSide });
  const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color('#33c7e9').multiplyScalar(1.8), toneMapped: false });
  const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d94aac').multiplyScalar(1.7), toneMapped: false });
  root.add(new THREE.Mesh(roadRibbon(track, -15.5, 15.5, -.015), pavement));
  root.add(new THREE.Mesh(roadRibbon(track, -track.halfWidth, track.halfWidth, .006), roadMaterial));
  for (const side of [-1, 1]) {
    const edge = side * track.halfWidth;
    root.add(new THREE.Mesh(wallRibbon(track, edge + side * .16, .18, .77), railMaterial));
    root.add(new THREE.Mesh(roadRibbon(track, edge - .16, edge + .16, .78), side > 0 ? cyan : pink));
    root.add(new THREE.Mesh(roadRibbon(track, edge - .1, edge + .1, .015), new THREE.MeshBasicMaterial({ color: '#667b85' })));
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: '#0b1520', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.24; root.add(ground);

  const laneMatrices: THREE.Matrix4[] = [], curbMatrices: THREE.Matrix4[] = [], curbColors: THREE.Color[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  for (let s = 0; s < track.length; s += 12) {
    const p = track.sample(s);
    for (const lane of [-3.5, 3.5]) laneMatrices.push(transform(p.x + p.nx * lane, .02, p.z + p.nz * lane, .13, 1, 5.5, p.heading));
    for (const side of [-1, 1]) {
      curbMatrices.push(transform(p.x + p.nx * side * 10.13, .07, p.z + p.nz * side * 10.13, .45, .11, 5.7, p.heading));
      curbColors.push(new THREE.Color(Math.floor(s / 12) % 2 ? '#ecf0df' : '#b92a64'));
      postMatrices.push(transform(p.x + p.nx * side * 10.7, .38, p.z + p.nz * side * 10.7, .12, .76, .15, p.heading));
    }
  }
  const lineGeometry = new THREE.PlaneGeometry(1, 1); lineGeometry.rotateX(-Math.PI / 2);
  root.add(instances(lineGeometry, new THREE.MeshBasicMaterial({ color: '#7e8f9b' }), laneMatrices));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#bfc3c1', roughness: .7 }), curbMatrices, curbColors));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), railMaterial, postMatrices));

  // A small number of instanced city chunks keeps both draw calls and nearby geometry bounded.
  const cityBuckets = new Map<string, { group: THREE.Group; x: number; z: number; batches: THREE.Matrix4[][]; crowns: THREE.Matrix4[]; crownColors: THREE.Color[] }>();
  const heights = [25, 44, 72, 116];
  const facadeColors = ['#80bad0', '#c6bba0', '#6084b7', '#80a3b5'];
  const buildingMaterials = heights.map((height, i) => {
    const facade = createFacade(731 + i, Math.floor(height / 3.2), facadeColors[i]);
    return new THREE.MeshStandardMaterial({ map: facade, emissiveMap: facade, emissive: '#ffffff', emissiveIntensity: .64, color: '#52616e', roughness: .68, metalness: .2 });
  });
  for (let x = -650; x < 1060; x += 46) for (let z = -820; z < 740; z += 46) {
    const px = x + random() * 15, pz = z + random() * 15;
    if (track.project({ x: px, z: pz }).distance < 36) continue;
    if (inBay(px, pz) || (px > shoreX - 40 && pz > dockZ - 180 && pz < dockZ + 180)) continue;
    const cx = Math.floor(px / 420), cz = Math.floor(pz / 420), key = `${cx},${cz}`;
    let chunk = cityBuckets.get(key);
    if (!chunk) {
      chunk = { group: new THREE.Group(), x: cx * 420 + 210, z: cz * 420 + 210,
        batches: [[], [], [], []], crowns: [], crownColors: [] };
      cityBuckets.set(key, chunk);
    }
    const category = Math.floor(random() * 4);
    const height = heights[category] * (.80 + random() * .35);
    const width = 15 + random() * 15, depth = 16 + random() * 16;
    const yaw = random() > .87 ? Math.PI / 5 : 0;
    chunk.batches[category].push(transform(px, height / 2, pz, width, height, depth, yaw));
    if (category > 1 && random() > .25) {
      for (const side of [-1, 1]) {
        chunk.crowns.push(transform(px + side * width * .5, height + .4, pz, .25, .65, depth + .5));
        chunk.crownColors.push(new THREE.Color(random() > .5 ? '#42b5d7' : '#a64c91').multiplyScalar(1.4));
        chunk.crowns.push(transform(px, height + .4, pz + side * depth * .5, width + .5, .65, .25));
        chunk.crownColors.push(new THREE.Color(random() > .5 ? '#42b5d7' : '#a64c91').multiplyScalar(1.4));
      }
    }
  }
  for (const chunk of cityBuckets.values()) {
    chunk.batches.forEach((matrices, i) => { if (matrices.length) chunk.group.add(instances(new THREE.BoxGeometry(1, 1, 1), buildingMaterials[i], matrices)); });
    if (chunk.crowns.length) chunk.group.add(instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), chunk.crowns, chunk.crownColors));
    root.add(chunk.group); chunks.push({ group: chunk.group, x: chunk.x, z: chunk.z });
  }

  const poleMatrices: THREE.Matrix4[] = [], arms: THREE.Matrix4[] = [], lamps: THREE.Matrix4[] = [], lightPools: THREE.Matrix4[] = [];
  const lampMetal = new THREE.MeshStandardMaterial({ color: '#253343', metalness: .75, roughness: .5 });
  for (let s = 8; s < track.length; s += 30) {
    if (s / track.length > .203 && s / track.length < .286) continue;
    const p = track.sample(s), side = Math.floor(s / 30) % 2 ? -1 : 1;
    poleMatrices.push(transform(p.x + p.nx * side * 13, 3.8, p.z + p.nz * side * 13, .17, 7.6, .17));
    arms.push(transform(p.x + p.nx * side * 11.9, 7.5, p.z + p.nz * side * 11.9, 2.5, .12, .16, p.heading));
    lamps.push(transform(p.x + p.nx * side * 10.8, 7.4, p.z + p.nz * side * 10.8, 1.1, .10, .28, p.heading));
    lightPools.push(transform(p.x + p.nx * side * 5, .025, p.z + p.nz * side * 5, 10, 1, 19, p.heading));
  }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), lampMetal, poleMatrices));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), lampMetal, arms));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#c2ebff').multiplyScalar(2), toneMapped: false }), lamps));
  const poolMaterial = new THREE.MeshBasicMaterial({ map: createGlowTexture(), color: '#78a2c3', opacity: .105, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  root.add(instances(lineGeometry.clone(), poolMaterial, lightPools));

  const tunnelStart = track.length * .203, tunnelEnd = track.length * .286;
  const tunnel = new THREE.MeshStandardMaterial({ color: '#141e2c', metalness: .55, roughness: .45, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(roadRibbon(track, -12.2, 12.2, 9.0, tunnelStart, tunnelEnd), tunnel));
  root.add(new THREE.Mesh(wallRibbon(track, -12.1, 0, 9, tunnelStart, tunnelEnd), tunnel));
  root.add(new THREE.Mesh(wallRibbon(track, 12.1, 0, 9, tunnelStart, tunnelEnd), tunnel));
  const ribs: THREE.Matrix4[] = [], stripLights: THREE.Matrix4[] = [], stripColors: THREE.Color[] = [];
  for (let s = tunnelStart; s <= tunnelEnd; s += 13) {
    const p = track.sample(s);
    for (const side of [-1, 1]) {
      ribs.push(transform(p.x + p.nx * side * 11.8, 4.4, p.z + p.nz * side * 11.8, .38, 8.8, .4, p.heading));
      stripLights.push(transform(p.x + p.nx * side * 11.57, 4.4, p.z + p.nz * side * 11.57, .09, 8.6, .18, p.heading));
      stripColors.push(new THREE.Color('#36cfe1').multiplyScalar(2.0));
    }
    ribs.push(transform(p.x, 8.7, p.z, 23.9, .45, .4, p.heading));
    stripLights.push(transform(p.x, 8.43, p.z, 23.2, .07, .16, p.heading));
    stripColors.push(new THREE.Color(Math.floor((s - tunnelStart) / 13) % 3 === 0 ? '#d665c3' : '#61dae5').multiplyScalar(2.0));
  }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), lampMetal, ribs));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), stripLights, stripColors));

  const signs = [
    ['NEON DISTRICT', 'AFTER HOURS / NO SPEED LIMIT', '#c5f83a'],
    ['NIGHT / SHIFT', 'THE CITY IS YOURS', '#ed80bd'],
    ['APEX INDUSTRIES', 'DRIVE INTO TOMORROW', '#63dfe2'],
    ['NO LIMITS', 'KEEP YOUR EYES ON THE LINE', '#c5f83a'],
    ['MIDNIGHT CLUB', 'OPEN UNTIL THE SUN COMES UP', '#ae86ed'],
    ['HYPER DRIVE', 'FULL THROTTLE / 24:7', '#fb976c'],
  ];
  for (let i = 0, s = 75; s < track.length; s += 155, i++) {
    const p = track.sample(s), side = i % 2 ? -1 : 1;
    const [text, subtitle, color] = signs[i % signs.length];
    const material = new THREE.MeshBasicMaterial({ map: signTexture(text, subtitle, color), color: new THREE.Color('#ffffff').multiplyScalar(1.9), toneMapped: false, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), material);
    sign.position.set(p.x + p.nx * side * 16, 5.6 + i % 3 * 2.1, p.z + p.nz * side * 16);
    sign.rotation.y = p.heading + side * Math.PI / 2 + side * .3;
    root.add(sign);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(.18, 5.5, .18), lampMetal);
    stand.position.set(sign.position.x, 2.7, sign.position.z); root.add(stand);
  }

  const turnMatrices: THREE.Matrix4[][] = [[], []];
  let lastWarning = -100;
  for (let s = 70; s < track.length; s += 12) {
    const a = track.sample(s), b = track.sample(s + 45);
    const delta = angleDifference(b.heading, a.heading);
    if (Math.abs(delta) < .40 || s - lastWarning < 105) continue;
    lastWarning = s;
    const side = delta > 0 ? 1 : -1;
    const p = track.sample(s - 20);
    turnMatrices[delta > 0 ? 1 : 0].push(transform(p.x + p.nx * side * 11.6, 1.45, p.z + p.nz * side * 11.6, 2.5, 1.0, 1, p.heading + Math.PI));
  }
  for (const direction of [0, 1]) {
    const map = textureFromCanvas(256, 96, ctx => {
      ctx.fillStyle = '#0a1017'; ctx.fillRect(0, 0, 256, 96);
      ctx.strokeStyle = '#c5f83a'; ctx.lineWidth = 10;
      for (let i = 0; i < 3; i++) {
        const x = 42 + i * 80;
        ctx.beginPath(); ctx.moveTo(x + (direction ? -14 : 14), 18); ctx.lineTo(x + (direction ? 14 : -14), 48); ctx.lineTo(x + (direction ? -14 : 14), 78); ctx.stroke();
      }
    });
    root.add(instances(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, color: new THREE.Color('#ffffff').multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide }), turnMatrices[direction]));
  }

  const start = track.sample(0);
  const gantry = new THREE.Group(); gantry.position.set(start.x, 0, start.z); gantry.rotation.y = start.heading;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.8, 8.4, .9), lampMetal); post.position.set(side * 11.8, 4.2, 0); gantry.add(post);
    const light = new THREE.Mesh(new THREE.BoxGeometry(.10, 7.5, .12), cyan); light.position.set(side * 11.34, 4.3, -.47); gantry.add(light);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(24.5, 1.9, .55), lampMetal); banner.position.y = 8.15; gantry.add(banner);
  const bannerMap = signTexture('NEON APEX', 'START / FINISH   •   NIGHTFALL CIRCUIT', '#c5f83a');
  for (const side of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(19.8, 1.66), new THREE.MeshBasicMaterial({ map: bannerMap, toneMapped: false, color: new THREE.Color('#ffffff').multiplyScalar(1.5) }));
    logo.position.set(0, 8.15, side * .29); logo.rotation.y = side < 0 ? Math.PI : 0; gantry.add(logo);
  }
  const checkerPieces: THREE.BufferGeometry[][] = [[], []];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 22; col++) {
    const piece = new THREE.PlaneGeometry(.94, .85); piece.rotateX(-Math.PI / 2); piece.translate(-9.87 + col * .94, .032, -.85 + row * .85);
    checkerPieces[(row + col) % 2].push(piece);
  }
  checkerPieces.forEach((pieces, i) => {
    const geometry = mergeGeometries(pieces);
    if (geometry) gantry.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: i ? '#adb9bb' : '#101923' })));
  });
  root.add(gantry);

  const water = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 worldPos; void main(){ worldPos=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(worldPos,1.); }`,
    fragmentShader: `varying vec3 worldPos; uniform float time; void main(){
      float waves=sin(worldPos.z*.27+time*.7)*sin(worldPos.x*.08-time*.28);
      float streak=pow(max(0.,sin(worldPos.z*.035+sin(worldPos.x*.015)*2.)),14.);
      vec3 base=vec3(.023,.060,.084)+waves*.009;
      base+=vec3(.020,.10,.14)*streak*(.65+.35*sin(worldPos.x*.1));
      gl_FragColor=vec4(base,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const harbor = new THREE.Mesh(new THREE.PlaneGeometry(800, 1050), water);
  harbor.rotation.x = -Math.PI / 2; harbor.position.set(shoreX + 460, -.20, dockZ); root.add(harbor);
  root.add(new THREE.Mesh(roadRibbon(track, 18, 115, -.19, coastStart, coastEnd), water));
  root.add(new THREE.Mesh(roadRibbon(track, 23, 50, -.075, coastStart, coastEnd), new THREE.MeshStandardMaterial({ color: '#29323a', roughness: .83, metalness: .16 })));
  const containerMatrices: THREE.Matrix4[] = [], containerColors: THREE.Color[] = [];
  const harborColors = ['#4d5f68', '#844858', '#ae7940', '#3c607b'];
  for (let i = 0; i < 65; i++) {
    const p = track.sample(coastStart + random() * (coastEnd - coastStart)), offset = 28 + random() * 14;
    const x = p.x + p.nx * offset, z = p.z + p.nz * offset;
    const height = random() > .6 ? 6 : 3;
    containerMatrices.push(transform(x, height / 2, z, 12, height, 3.2, p.heading));
    containerColors.push(new THREE.Color(harborColors[Math.floor(random() * harborColors.length)]));
  }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#a6a6a6', metalness: .4, roughness: .7 }), containerMatrices, containerColors));
  const craneMaterial = new THREE.MeshStandardMaterial({ color: '#8a7048', metalness: .7, roughness: .6 });
  const cranePieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const p = track.sample(coastStart + 35 + i * 64);
    const matrix = transform(p.x + p.nx * 38, 0, p.z + p.nz * 38, 1, 1, 1, p.heading + Math.PI);
    for (const side of [-1, 1]) {
      const leg = new THREE.BoxGeometry(1.2, 33, 1.2); leg.translate(side * 12, 16.5, 0); leg.applyMatrix4(matrix); cranePieces.push(leg);
    }
    const cross = new THREE.BoxGeometry(46, 1.3, 1.5); cross.translate(9, 33, 0); cross.applyMatrix4(matrix); cranePieces.push(cross);
    const cable = new THREE.BoxGeometry(.14, 21, .14); cable.translate(27, 22, 0); cable.applyMatrix4(matrix); cranePieces.push(cable);
    const diagonal = new THREE.BoxGeometry(.55, 42, .55); diagonal.rotateZ(-.82); diagonal.translate(0, 21, 0); diagonal.applyMatrix4(matrix); cranePieces.push(diagonal);
  }
  const cranes = mergeGeometries(cranePieces); if (cranes) root.add(new THREE.Mesh(cranes, craneMaterial));

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1750, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 direction;
      void main(){ float h=normalize(direction).y; vec3 top=vec3(.013,.022,.050); vec3 horizon=vec3(.072,.103,.16);
      float haze=pow(1.-max(0.,h),4.); vec3 c=mix(top,horizon,haze); gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      }`,
  }));
  sky.position.set(150, 0, -80); sky.renderOrder = -10; root.add(sky);
  const starPositions: number[] = [];
  for (let i = 0; i < 900; i++) {
    const angle = random() * Math.PI * 2, h = .10 + random() * .85, radius = 1450;
    starPositions.push(150 + Math.cos(angle) * radius * Math.sqrt(1 - h * h), radius * h, -80 + Math.sin(angle) * radius * Math.sqrt(1 - h * h));
  }
  const stars = new THREE.BufferGeometry(); stars.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  root.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#7992b0', size: 1.5, sizeAttenuation: true, transparent: true, opacity: .7, depthWrite: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicMaterial({ color: '#bbc7d2', fog: false }));
  moon.position.set(-480, 430, -620); root.add(moon);
  return { root, chunks, water };
}
