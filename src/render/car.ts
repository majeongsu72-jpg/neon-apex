import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGlowTexture, signTexture } from './textures';

interface Wheel { steer: THREE.Group; spin: THREE.Group; front: boolean }
export interface CarModel {
  root: THREE.Group;
  body: THREE.Group;
  wheels: Wheel[];
  brakeMaterial: THREE.MeshBasicMaterial;
  flames: THREE.Mesh[];
  glow: THREE.MeshBasicMaterial;
}

function loft(rings: { z: number; width: number; top: number; bottom?: number }[]) {
  const vertices: number[] = [], indices: number[] = [], uv: number[] = [];
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i], w = r.width, b = r.bottom ?? .32;
    const shoulder = Math.min(b + .16, r.top - .10);
    const coords = [ [-w * .83, b], [-w, shoulder], [-w * .94, r.top - .08], [-w * .68, r.top],
      [w * .68, r.top], [w * .94, r.top - .08], [w, shoulder], [w * .83, b] ];
    coords.forEach(([x, y], j) => { vertices.push(x, y, r.z); uv.push(j / 8, i / (rings.length - 1)); });
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 8; j++) {
    const a = i * 8 + j, n = i * 8 + (j + 1) % 8, b = a + 8, bn = n + 8;
    indices.push(a, b, n, b, bn, n);
  }
  for (const end of [0, rings.length - 1]) {
    const base = end * 8;
    for (let j = 1; j < 7; j++) indices.push(...(end === 0 ? [base, base + j, base + j + 1] : [base, base + j + 1, base + j]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function quad(points: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
  return geometry;
}

export function createCar(color: string, id: number): CarModel {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .62, roughness: .24, clearcoat: 1, clearcoatRoughness: .15, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const carbon = new THREE.MeshStandardMaterial({ color: '#111a20', roughness: .44, metalness: .4, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: '#708696', metalness: .95, roughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#102d3c', metalness: .7, roughness: .08, clearcoat: 1, envMapIntensity: 2, side: THREE.DoubleSide });
  const headlights = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ccf6ff').multiplyScalar(3.2), toneMapped: false });
  const brakes = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff254b').multiplyScalar(1.3), toneMapped: false });
  const bucket = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(matrix);
    const geometries = bucket.get(material) ?? []; geometries.push(geo); bucket.set(material, geometries);
  };
  const box = (material: THREE.Material, size: [number, number, number], pos: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => add(new THREE.BoxGeometry(...size), material, ...pos, ...rotation);

  add(loft([
    { z: -2.23, width: .79, top: .83 }, { z: -1.90, width: 1.03, top: .94 },
    { z: -1.2, width: 1.06, top: .92 }, { z: .35, width: 1.00, top: .85 },
    { z: 1.4, width: 1.07, top: .78 }, { z: 2.25, width: .83, top: .67 },
  ]), paint);

  add(loft([
    { z: -1.2, width: .77, top: 1.00, bottom: .81 },
    { z: -.65, width: .72, top: 1.42, bottom: .81 },
    { z: .28, width: .67, top: 1.43, bottom: .81 },
    { z: .98, width: .77, top: .95, bottom: .79 },
  ]), glass);
  add(quad([-.50, 1.434, -.62, .50, 1.434, -.62, .46, 1.448, .28, -.46, 1.448, .28]), carbon);
  for (const side of [-1, 1]) {
    box(paint, [.075, .52, .055], [side * .68, 1.16, -.03], [0, 0, side * -.11]);
    box(carbon, [.09, .21, .72], [side * 1.025, .57, -.24]);
    box(carbon, [.12, .13, 3.02], [side * .98, .32, -.02]);
    box(paint, [.075, .05, 2.7], [side * 1.045, .40, -.12]);
    box(carbon, [.30, .07, .24], [side * 1.12, 1.02, .57], [0, side * .25, 0]);
    box(paint, [.28, .085, .23], [side * 1.12, 1.045, .56], [0, side * .25, 0]);
    box(carbon, [.27, .03, .55], [side * .46, .805, 1.33], [-.035, 0, 0]);
    box(headlights, [.67, .055, .04], [side * .49, .665, 2.215], [0, side * -.06, 0]);
    box(headlights, [.05, .11, .04], [side * .81, .615, 2.17]);
    box(brakes, [.70, .06, .045], [side * .49, .755, -2.235]);
    box(carbon, [.12, .26, .11], [side * .58, 1.00, -1.91]);
    add(new THREE.CylinderGeometry(.12, .13, .17, 10), metal, side * .57, .42, -2.24, Math.PI / 2);
    for (const axle of [-1.38, 1.40]) {
      const arch = new THREE.Shape();
      arch.absarc(0, 0, .515, 0, Math.PI, false);
      arch.absarc(0, 0, .445, Math.PI, 0, true);
      arch.closePath();
      add(new THREE.ExtrudeGeometry(arch, { depth: .16, bevelEnabled: true, bevelThickness: .014, bevelSize: .012,
        bevelSegments: 2, curveSegments: 16, steps: 1 }), paint, side * 1.01, .43, axle, 0, side * Math.PI / 2);
    }
  }
  box(carbon, [1.72, .11, .20], [0, .295, 2.15]);
  box(carbon, [1.21, .16, .055], [0, .455, 2.255]);
  box(carbon, [1.70, .21, .14], [0, .35, -2.19]);
  for (let i = -3; i <= 3; i++) box(carbon, [.032, .13, .28], [i * .20, .27, -2.18]);
  box(carbon, [2.09, .075, .36], [0, 1.145, -1.92], [-.08, 0, 0]);
  box(paint, [.035, .13, .37], [-1.02, 1.16, -1.92]);
  box(paint, [.035, .13, .37], [1.02, 1.16, -1.92]);
  box(carbon, [.20, .009, 1.27], [0, .826, 1.09], [-.06, 0, 0]);

  const badge = new THREE.MeshBasicMaterial({ map: signTexture('APEX', '', '#e1eeec', 256, 64), transparent: true, side: THREE.DoubleSide });
  add(new THREE.PlaneGeometry(.71, .18), badge, 0, .72, -2.267, 0, Math.PI);
  const number = new THREE.MeshBasicMaterial({ map: signTexture(String(id + 1).padStart(2, '0'), '', '#f1f4ef', 128, 128), side: THREE.DoubleSide });
  for (const side of [-1, 1]) add(new THREE.PlaneGeometry(.28, .28), number, side * 1.017, .72, .10, 0, side * Math.PI / 2);

  for (const [material, geometries] of bucket) {
    // normalize indexed geometry before merging meshes of different primitives
    const normalized = geometries.map(g => g.index ? g.toNonIndexed() : g);
    const geometry = mergeGeometries(normalized, false);
    if (geometry) body.add(new THREE.Mesh(geometry, material));
    for (const g of geometries) g.dispose();
    for (const g of normalized) g.dispose();
  }

  const wheels: Wheel[] = [];
  const tireMaterial = new THREE.MeshStandardMaterial({ color: '#090d12', roughness: .84 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#657483', roughness: .3, metalness: 1 });
  for (const side of [-1, 1]) for (const axle of [-1.38, 1.40]) {
    const steer = new THREE.Group(), spin = new THREE.Group();
    steer.position.set(side * 1.03, .43, axle); steer.add(spin); body.add(steer);
    const tire = new THREE.CylinderGeometry(.425, .425, .28, 20);
    tire.rotateZ(Math.PI / 2);
    spin.add(new THREE.Mesh(tire, tireMaterial));
    const rimPieces: THREE.BufferGeometry[] = [];
    const rim = new THREE.CylinderGeometry(.315, .315, .287, 16);
    rim.rotateZ(Math.PI / 2); rimPieces.push(rim);
    const inset = new THREE.CylinderGeometry(.24, .24, .289, 16);
    inset.rotateZ(Math.PI / 2);
    spin.add(new THREE.Mesh(inset, carbon));
    for (let spoke = 0; spoke < 5; spoke++) {
      const geo = new THREE.BoxGeometry(.025, .50, .035);
      geo.rotateX(spoke * Math.PI / 5); geo.translate(side * .153, 0, 0); rimPieces.push(geo);
    }
    const hub = new THREE.CylinderGeometry(.09, .09, .318, 10);
    hub.rotateZ(Math.PI / 2); rimPieces.push(hub);
    const merged = mergeGeometries(rimPieces.map(g => g.toNonIndexed()));
    if (merged) spin.add(new THREE.Mesh(merged, wheelMaterial));
    rimPieces.forEach(g => g.dispose());
    wheels.push({ steer, spin, front: axle > 0 });
  }

  const glowTexture = createGlowTexture();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.8), new THREE.MeshBasicMaterial({ map: glowTexture, color: '#000000', transparent: true, opacity: .95, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .023; root.add(shadow);
  const glow = new THREE.MeshBasicMaterial({ map: glowTexture, color, transparent: true, opacity: .20, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.5), glow);
  glowMesh.rotation.x = -Math.PI / 2; glowMesh.position.y = .027; root.add(glowMesh);
  const beamTexture = createGlowTexture();
  const beamMaterial = new THREE.MeshBasicMaterial({ map: beamTexture, color: '#96cfe4', transparent: true, opacity: .14, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 12), beamMaterial);
    beam.rotation.x = -Math.PI / 2; beam.position.set(side * .58, .035, 7.6); root.add(beam);
  }
  const flames: THREE.Mesh[] = [];
  const flameMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#80dfff').multiplyScalar(3), transparent: true, opacity: .9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.15, 1.2, 8, 1, true), flameMaterial);
    flame.rotation.x = -Math.PI / 2; flame.position.set(side * .57, .42, -2.8); flame.visible = false;
    body.add(flame); flames.push(flame);
  }
  return { root, body, wheels, brakeMaterial: brakes, flames, glow };
}
