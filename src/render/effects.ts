import * as THREE from 'three';
import { seededRandom } from '../game/math';
import type { VehicleState, Vec2 } from '../game/types';
import { createGlowTexture } from './textures';

export class ParticleEffects {
  readonly root = new THREE.Group();
  private readonly count = 520;
  private readonly position = new Float32Array(this.count * 3);
  private readonly velocity = new Float32Array(this.count * 3);
  private readonly colors = new Float32Array(this.count * 3);
  private readonly sizes = new Float32Array(this.count);
  private readonly alphas = new Float32Array(this.count);
  private readonly ages = new Float32Array(this.count);
  private readonly lifetimes = new Float32Array(this.count);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private cursor = 0;
  private markCursor = 0;
  private readonly marks: THREE.InstancedMesh;
  private lastMark: Vec2 = { x: Infinity, z: Infinity };
  private readonly random = seededRandom(6421);
  private smokeBudget = 0;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { viewport: { value: 720 }, sprite: { value: createGlowTexture() } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 particleColor;
        uniform float viewport; varying float vAlpha; varying vec3 vColor;
        void main(){ vAlpha=alpha; vColor=particleColor; vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize=clamp(size*viewport/max(1.,-mv.z),1.,90.); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D sprite; varying float vAlpha; varying vec3 vColor;
        void main(){ float a=texture2D(sprite,gl_PointCoord).a*vAlpha; if(a<.005) discard; gl_FragColor=vec4(vColor,a); }`,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const points = new THREE.Points(this.geometry, this.material); points.frustumCulled = false; this.root.add(points);
    const markGeometry = new THREE.PlaneGeometry(1, 1); markGeometry.rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(markGeometry, new THREE.MeshBasicMaterial({ color: '#010507', transparent: true, opacity: .38, depthWrite: false }), 700);
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.marks.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 700; i++) this.marks.setMatrixAt(i, zero);
    this.root.add(this.marks);
  }

  resize(height: number) { this.material.uniforms.viewport.value = height; }

  reset() {
    this.alphas.fill(0); this.lifetimes.fill(0);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 700; i++) this.marks.setMatrixAt(i, zero);
    this.marks.instanceMatrix.needsUpdate = true;
    this.lastMark = { x: Infinity, z: Infinity };
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: [number, number, number], size: number, lifetime: number) {
    const i = this.cursor++ % this.count, n = i * 3;
    this.position[n] = x; this.position[n + 1] = y; this.position[n + 2] = z;
    this.velocity[n] = vx; this.velocity[n + 1] = vy; this.velocity[n + 2] = vz;
    this.colors.set(color, n); this.sizes[i] = size;
    this.ages[i] = 0; this.lifetimes[i] = lifetime; this.alphas[i] = .8;
  }

  collision(position: Vec2, strength: number) {
    for (let i = 0; i < 8 + strength * 14; i++) {
      const angle = this.random() * Math.PI * 2, speed = 3 + this.random() * 8;
      this.emit(position.x, .4, position.z, Math.cos(angle) * speed, 1 + this.random() * 4, Math.sin(angle) * speed, [3.0, 1.3, .25], .08 + this.random() * .11, .3 + this.random() * .4);
    }
  }

  update(dt: number, player: VehicleState, active: boolean, density: number) {
    if (active && player.drifting) {
      this.smokeBudget += dt * 42 * density;
      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      while (this.smokeBudget >= 1) {
        this.smokeBudget--;
        const side = this.random() > .5 ? 1 : -1;
        this.emit(player.position.x - fx * 1.4 + fz * side, .30, player.position.z - fz * 1.4 - fx * side,
          player.velocity.x * .12 + (this.random() - .5) * 2, .5 + this.random(), player.velocity.z * .12 + (this.random() - .5) * 2,
          [.20, .26, .33], .5 + this.random() * .5, .6 + this.random() * .55);
      }
      if (Math.hypot(player.position.x - this.lastMark.x, player.position.z - this.lastMark.z) > .8) {
        for (const side of [-1, 1]) {
          const pos = new THREE.Vector3(player.position.x - fx * 1.3 + fz * side * .96, .026, player.position.z - fz * 1.3 - fx * side * .96);
          const matrix = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.heading - player.slip), new THREE.Vector3(.24, 1, 1.1));
          this.marks.setMatrixAt(this.markCursor++ % 700, matrix);
        }
        this.marks.instanceMatrix.needsUpdate = true;
        this.lastMark = { ...player.position };
      }
    }
    if (active && player.boosting) {
      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      if (this.random() < dt * 70 * density) this.emit(player.position.x - fx * 2.8, .42, player.position.z - fz * 2.8,
        -fx * 8, this.random() * .5, -fz * 8, [.4, 1.7, 3.2], .2, .35);
    }
    for (let i = 0; i < this.count; i++) {
      if (this.lifetimes[i] === 0) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.lifetimes[i];
      if (t >= 1) { this.alphas[i] = 0; this.lifetimes[i] = 0; continue; }
      const n = i * 3;
      this.position[n] += this.velocity[n] * dt;
      this.position[n + 1] += this.velocity[n + 1] * dt;
      this.position[n + 2] += this.velocity[n + 2] * dt;
      this.alphas[i] = (1 - t) * .65;
      if (this.colors[n] < 1) this.sizes[i] += dt * .4;
      else this.velocity[n + 1] -= dt * 7;
    }
    for (const attribute of ['position', 'particleColor', 'size', 'alpha']) (this.geometry.getAttribute(attribute) as THREE.BufferAttribute).needsUpdate = true;
  }
}

export const filmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, speed: { value: 0 }, boost: { value: 0 }, motion: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float speed; uniform float boost; uniform float motion; varying vec2 vUv;
    float hash(float n){return fract(sin(n*134.78)*43758.5453);}
    void main(){ vec2 p=vUv-.5; float b=boost*motion; vec2 offset=p*b*.003;
      vec3 color=texture2D(tDiffuse,vUv).rgb;
      color.r=texture2D(tDiffuse,vUv+offset).r; color.b=texture2D(tDiffuse,vUv-offset).b;
      float vignette=1.-smoothstep(.28,.72,length(p*vec2(.8,1.)));
      color*=.83+.17*vignette;
      float angle=atan(p.y,p.x); float line=pow(hash(floor(angle*64.)),22.);
      float radius=smoothstep(.28,.72,length(p));
      float pulse=.5+.5*sin(length(p)*24.-time*30.);
      color+=vec3(.13,.20,.24)*line*radius*pulse*speed*motion;
      float grain=fract(sin(dot(vUv,vec2(12.9898,78.233))+time)*43758.5453)-.5;
      color+=grain*.003;
      gl_FragColor=vec4(max(color,vec3(0.)),1.);
    }`,
};
