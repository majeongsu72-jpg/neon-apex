import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { clamp, damp, lerpAngle } from '../game/math';
import type { GameEvent, GameSettings, RaceState, TrackDefinition } from '../game/types';
import { createCar } from './car';
import type { CarModel } from './car';
import { createWorld } from './world';
import type { World } from './world';
import { createEnvironment } from './textures';
import { filmShader, ParticleEffects } from './effects';

export interface RendererStats { fps: number; scale: number; drawCalls: number; triangles: number; gpu: string }

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, .12, 2400);
  readonly stats: RendererStats = { fps: 60, scale: .85, drawCalls: 0, triangles: 0, gpu: 'Unknown' };
  readonly world: World;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly film: ShaderPass;
  private readonly antialias: ShaderPass;
  private readonly particles = new ParticleEffects();
  private readonly models: CarModel[] = [];
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly playerRimLight = new THREE.PointLight('#a6e9ff', 24, 15, 2);
  private readonly pinkRimLight = new THREE.PointLight('#ed63b5', 30, 15, 2);
  private width = 1;
  private height = 1;
  private scale = .85;
  private effectDensity = .65;
  private elapsed = 0;
  private shake = 0;
  private frameSum = 0;
  private frameCount = 0;
  private warmup = 0;
  private initializedCamera = false;
  private settings: GameSettings;
  private qualityTimer = 0;

  constructor(canvas: HTMLCanvasElement, track: TrackDefinition, state: RaceState, settings: GameSettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) this.stats.gpu = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    this.scene.fog = new THREE.Fog('#152030', 100, 600);
    this.scene.add(new THREE.HemisphereLight('#adc5e0', '#1a202a', 1.6));
    const moon = new THREE.DirectionalLight('#d3e3f0', 2.5); moon.position.set(50, 150, 75); this.scene.add(moon);
    const rim = new THREE.DirectionalLight('#425ba7', 1.1); rim.position.set(-150, 40, -60); this.scene.add(rim);
    this.scene.add(this.playerRimLight, this.pinkRimLight);
    const environment = createEnvironment(this.renderer); this.scene.environment = environment.texture;
    this.world = createWorld(track); this.scene.add(this.world.root, this.particles.root);
    for (const v of state.vehicles) {
      const car = createCar(v.color, v.id); this.models.push(car); this.scene.add(car.root);
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), .36, .5, 1.05);
    this.composer.addPass(this.bloom);
    this.film = new ShaderPass(filmShader); this.composer.addPass(this.film);
    this.antialias = new ShaderPass(FXAAShader); this.composer.addPass(this.antialias);
    this.composer.addPass(new OutputPass());
    this.setSettings(settings);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setSettings(settings: GameSettings) {
    this.settings = { ...settings };
    const presets = { low: .65, medium: .9, high: Math.min(window.devicePixelRatio, 1.5), auto: this.scale };
    this.scale = presets[settings.quality];
    this.effectDensity = settings.quality === 'low' ? .35 : settings.quality === 'high' ? 1 : .65;
    this.film.uniforms.motion.value = settings.motion ? 1 : 0;
    this.resize();
  }

  reset() { this.particles.reset(); this.shake = 0; this.initializedCamera = false; }

  resize() {
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(this.scale);
    this.composer.setSize(this.width, this.height);
    this.bloom.setSize(Math.round(this.width * this.scale * .65), Math.round(this.height * this.scale * .65));
    this.particles.resize(this.height * this.scale);
    this.antialias.uniforms.resolution.value.set(1 / (this.width * this.scale), 1 / (this.height * this.scale));
    this.stats.scale = this.scale;
  }

  event(event: GameEvent) {
    if (event.type === 'collision') {
      this.particles.collision(event.position, event.strength);
      if (event.vehicleId === 0) this.shake = Math.max(this.shake, event.strength * .20);
    }
  }

  render(state: RaceState, alpha: number, dt: number) {
    this.elapsed += dt;
    const player = state.vehicles[0];
    const active = state.phase === 'racing';
    const still = ['menu', 'briefing', 'finished'].includes(state.phase);
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i], v = state.vehicles[i];
      model.root.position.set(THREE.MathUtils.lerp(v.previousPosition.x, v.position.x, alpha), .035,
        THREE.MathUtils.lerp(v.previousPosition.z, v.position.z, alpha));
      model.root.rotation.y = lerpAngle(v.previousHeading, v.heading, alpha);
      model.body.rotation.z = damp(model.body.rotation.z, -v.yawRate * v.speed * .0015, 8, dt);
      model.body.rotation.x = damp(model.body.rotation.x, v.braking ? -.018 : v.boosting ? .018 : 0, 6, dt);
      for (const wheel of model.wheels) { wheel.spin.rotation.x = v.wheelRotation; wheel.steer.rotation.y = wheel.front ? v.steerAngle : 0; }
      model.brakeMaterial.color.set('#ff254b').multiplyScalar(v.braking ? 4 : 1.5);
      for (const flame of model.flames) { flame.visible = v.boosting; flame.scale.y = .65 + .25 * Math.sin(this.elapsed * 48 + i); }
      model.glow.opacity = v.boosting ? .35 : .17;
    }
    const model = this.models[0];
    const position = model.root.position, heading = model.root.rotation.y;
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = fz, rz = -fx;
    if (still) {
      const angle = state.phase === 'finished' ? -.85 : .79 + Math.sin(this.elapsed * .08) * .04;
      const radius = state.phase === 'finished' ? 10.2 : 10.0;
      this.desiredPosition.set(position.x + fx * Math.cos(angle) * radius + rx * Math.sin(angle) * radius,
        3.75 + Math.sin(this.elapsed * .16) * .06, position.z + fz * Math.cos(angle) * radius + rz * Math.sin(angle) * radius);
      this.desiredTarget.set(position.x - rx * 3.3 - fx * .4, 1.00, position.z - rz * 3.3 - fz * .4);
      this.camera.fov = damp(this.camera.fov, 43, 3, dt);
    } else {
      const velocityHeading = player.speed > 10 ? Math.atan2(player.velocity.x, player.velocity.z) : heading;
      const cameraHeading = lerpAngle(heading, velocityHeading, .25);
      const cx = Math.sin(cameraHeading), cz = Math.cos(cameraHeading);
      this.desiredPosition.set(position.x - cx * 9.8, 3.35 + player.speed * .003, position.z - cz * 9.8);
      this.desiredTarget.set(position.x + fx * 14.5, 1.0, position.z + fz * 14.5);
      const motionFactor = this.settings.motion ? 1 : .35;
      this.camera.fov = damp(this.camera.fov, 64 + Math.min(1, player.speed / 78) * 16 * motionFactor + (player.boosting ? 5 * motionFactor : 0), 3.5, dt);
    }
    if (!this.initializedCamera) {
      this.camera.position.copy(this.desiredPosition); this.lookTarget.copy(this.desiredTarget); this.initializedCamera = true;
    } else {
      const blend = 1 - Math.exp(-dt * (still ? 2 : 7));
      this.camera.position.lerp(this.desiredPosition, blend); this.lookTarget.lerp(this.desiredTarget, blend);
    }
    if (active && this.settings.motion) {
      const rumble = player.boosting ? .023 : player.speed / 80 * .006;
      this.camera.position.x += Math.sin(this.elapsed * 73) * (rumble + this.shake);
      this.camera.position.y += Math.sin(this.elapsed * 89) * (rumble + this.shake * .3);
    }
    this.shake = damp(this.shake, 0, 9, dt);
    this.camera.lookAt(this.lookTarget); this.camera.updateProjectionMatrix();
    this.playerRimLight.position.set(position.x + rx * 4, 4.2, position.z + rz * 4 + fz * 2);
    this.pinkRimLight.position.set(position.x - rx * 4, 3.8, position.z - rz * 4 - fz * 2);
    for (const chunk of this.world.chunks) chunk.group.visible = Math.hypot(chunk.x - position.x, chunk.z - position.z) < (this.settings.quality === 'low' ? 650 : 840);
    this.world.water.uniforms.time.value = this.elapsed;
    this.particles.update(state.phase === 'paused' ? 0 : dt, player, active, this.effectDensity);
    this.film.uniforms.time.value = this.elapsed;
    this.film.uniforms.speed.value = active ? clamp((player.speed - 42) / 50, 0, 1) : 0;
    this.film.uniforms.boost.value = damp(this.film.uniforms.boost.value, active && player.boosting ? 1 : 0, 6, dt);
    this.renderer.info.reset(); this.composer.render(dt);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.measure(dt);
  }

  private measure(dt: number) {
    if (dt > .12 || dt <= 0 || document.hidden) return;
    this.warmup += dt; this.frameSum += dt; this.frameCount++;
    if (this.frameSum < 1.5) return;
    this.stats.fps = this.frameCount / this.frameSum;
    this.qualityTimer += this.frameSum;
    this.frameSum = 0; this.frameCount = 0;
    if (this.settings.quality !== 'auto' || this.warmup < 4) return;
    let next = this.scale;
    if (this.stats.fps < 52) next = Math.max(.55, this.scale - .08);
    else if (this.stats.fps > 58 && this.qualityTimer > 9) next = Math.min(1.15, this.scale + .035);
    if (next !== this.scale) { this.scale = next; this.effectDensity = this.scale < .75 ? .4 : .7; this.qualityTimer = 0; this.resize(); }
  }
}
