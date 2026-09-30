import { angleDifference, clamp, damp, mod } from './math';
import { EMPTY_INPUT } from './types';
import type { GameEvent, InputState, RacePhase, RaceState, TrackDefinition, VehicleState, Vec2 } from './types';

const ROSTER = [
  ['YOU', '#c5f83a'], ['ONYX', '#f25c91'], ['VOLT', '#5ab9fa'],
  ['KIRA', '#df89fa'], ['ECHO', '#ff9648'], ['ZERO', '#e7f1fa'],
];

export class RaceEngine {
  readonly state: RaceState;
  private resumePhase: RacePhase = 'racing';
  private events: GameEvent[] = [];

  constructor(readonly track: TrackDefinition) {
    this.state = { phase: 'menu', time: 0, countdown: 3, laps: 3, vehicles: [], rank: 6, standings: [] };
    this.reset('menu');
  }

  get player() { return this.state.vehicles[0]; }

  reset(phase: RacePhase = 'countdown') {
    this.state.phase = phase;
    this.state.time = 0;
    this.state.countdown = 3;
    this.events = [];
    this.state.vehicles = ROSTER.map(([name, color], id) => {
      const row = id === 0 ? 2 : Math.floor((id - 1) / 2);
      const s = phase === 'menu' ? (id === 0 ? 20 : -20 - id * 12) : -14 - row * 11 - (id === 0 ? 4 : 0);
      const lane = phase === 'menu' && id === 0 ? 0 : (id % 2 === 0 ? -3.2 : 3.2);
      const p = this.track.sample(s);
      const position = { x: p.x + p.nx * lane, z: p.z + p.nz * lane };
      return {
        id, name, color, position, previousPosition: { ...position }, velocity: { x: 0, z: 0 },
        heading: p.heading, previousHeading: p.heading, yawRate: 0, steerAngle: 0, speed: 0,
        nitro: 1, boosting: false, nitroLocked: false, drifting: false, slip: 0, braking: false,
        progress: s, previousProgress: s, trackIndex: p.index, lateral: lane,
        nextCheckpoint: 0, lastCheckpoint: s, completedLaps: 0, lapStartTime: 0,
        lapTimes: [], finishTime: null, collisionCooldown: 0, aiLane: lane,
        skill: .92 + id * .016, aggression: .25 + id * .115, wheelRotation: 0,
      };
    });
    this.updateStandings();
  }

  briefing() { this.state.phase = 'briefing'; }

  pause() {
    if (this.state.phase !== 'racing' && this.state.phase !== 'countdown') return;
    this.resumePhase = this.state.phase;
    this.state.phase = 'paused';
  }

  resume() { if (this.state.phase === 'paused') this.state.phase = this.resumePhase; }

  recover() {
    if (this.state.phase !== 'racing') return;
    const v = this.player;
    const p = this.track.sample(v.lastCheckpoint);
    v.position = { x: p.x, z: p.z };
    v.previousPosition = { ...v.position };
    v.velocity = { x: 0, z: 0 };
    v.speed = 0; v.yawRate = 0; v.heading = p.heading; v.previousHeading = p.heading;
    v.progress = v.lastCheckpoint; v.previousProgress = v.progress;
    v.trackIndex = p.index; v.lateral = 0; v.drifting = false; v.boosting = false;
    // nextCheckpoint is retained: recovering never awards a gate or a lap.
    this.updateStandings();
  }

  drainEvents(): GameEvent[] { const result = this.events; this.events = []; return result; }

  step(dt: number, input: InputState = EMPTY_INPUT) {
    if (this.state.phase === 'countdown') {
      const old = Math.ceil(this.state.countdown);
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      const current = Math.ceil(this.state.countdown);
      if (old !== current) this.events.push({ type: 'countdown', value: current });
      if (this.state.countdown <= 0) this.state.phase = 'racing';
      return;
    }
    if (this.state.phase !== 'racing') return;
    this.state.time += dt;
    for (const vehicle of this.state.vehicles) {
      vehicle.previousPosition.x = vehicle.position.x;
      vehicle.previousPosition.z = vehicle.position.z;
      vehicle.previousHeading = vehicle.heading;
      vehicle.previousProgress = vehicle.progress;
      const controls = vehicle.id === 0 ? input : this.aiInput(vehicle, dt);
      this.integrate(vehicle, controls, dt);
      this.constrainToRoad(vehicle);
    }
    this.resolveVehicleCollisions();
    for (const vehicle of this.state.vehicles) {
      this.updateProgress(vehicle);
      this.validateCheckpoints(vehicle);
    }
    this.updateStandings();
    if (this.player.finishTime !== null) {
      this.state.phase = 'finished';
      this.events.push({ type: 'finish', rank: this.state.rank, time: this.player.finishTime });
    }
  }

  integrate(v: VehicleState, input: InputState, dt: number) {
    v.collisionCooldown = Math.max(0, v.collisionCooldown - dt);
    const speed = Math.hypot(v.velocity.x, v.velocity.z);
    const finished = v.finishTime !== null;
    v.braking = input.brake > .12 || finished;
    const steer = clamp(input.steer, -1, 1);
    v.drifting = !finished && input.drift && speed > 13 && (Math.abs(steer) > .16 || (v.drifting && speed > 11));
    if (!input.nitro) v.nitroLocked = false;
    v.boosting = !finished && !v.nitroLocked && input.nitro && input.throttle > .25 && input.brake < .1 && v.nitro > .0001;
    if (v.boosting) {
      v.nitro = Math.max(0, v.nitro - dt * .25);
      if (v.nitro < .0001) v.nitroLocked = true;
    }
    else v.nitro = Math.min(1, v.nitro + dt * (.045 + (v.drifting && Math.abs(v.slip) > .065 ? .15 : 0)));

    const yawTarget = steer * speed / (23 + speed * .78) * (v.drifting ? 1.30 : 1);
    v.yawRate = damp(v.yawRate, yawTarget, v.drifting ? 5 : 10, dt);
    v.steerAngle = damp(v.steerAngle, steer * .36, 10, dt);
    v.heading += v.yawRate * dt;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const rx = fz, rz = -fx;
    let forward = v.velocity.x * fx + v.velocity.z * fz;
    let lateral = v.velocity.x * rx + v.velocity.z * rz;
    const maxSpeed = (v.boosting ? 330 : 280) / 3.6;
    const throttle = finished ? 0 : clamp(input.throttle, 0, 1);
    const acceleration = throttle * (13.6 * (1 - .23 * clamp(speed / maxSpeed, 0, 1)) + (v.boosting ? 15 : 0));
    const drag = .45 + speed * speed * .00145;
    const braking = finished ? 17 : clamp(input.brake, 0, 1) * 31;
    forward = Math.max(0, forward + (acceleration - drag - braking) * dt);
    if (forward > maxSpeed) forward = damp(forward, maxSpeed, 3.5, dt);
    lateral *= Math.exp(-(v.drifting ? 1.7 : 10.5) * dt);
    if (v.drifting) forward *= Math.exp(-.04 * dt);
    if (throttle === 0 && Math.hypot(forward, lateral) < .03) { forward = 0; lateral = 0; }
    v.velocity.x = fx * forward + rx * lateral;
    v.velocity.z = fz * forward + rz * lateral;
    v.speed = Math.hypot(v.velocity.x, v.velocity.z);
    v.slip = v.speed > 2 ? Math.atan2(lateral, Math.max(1, forward)) : 0;
    v.position.x += v.velocity.x * dt;
    v.position.z += v.velocity.z * dt;
    v.wheelRotation += forward * dt / .43;
  }

  aiInput(v: VehicleState, dt: number): InputState {
    if (v.finishTime !== null) return { ...EMPTY_INPUT, brake: 1 };
    const s = v.progress;
    const near = this.track.sample(s + 12);
    const middle = this.track.sample(s + 45);
    const far = this.track.sample(s + 100);
    const curvature = Math.max(Math.abs(angleDifference(middle.heading, near.heading)) / 33,
      Math.abs(angleDifference(far.heading, middle.heading)) / 55);
    let targetSpeed = clamp(Math.sqrt((10 + v.aggression * 2) / (curvature + .00035)), 20, 74) * v.skill;
    let laneTarget = (v.id % 2 ? -1 : 1) * (1.5 + v.aggression);
    for (const other of this.state.vehicles) {
      if (other.id === v.id || other.finishTime !== null) continue;
      const gap = other.progress - v.progress;
      if (gap > 0 && gap < 25 && Math.abs(other.lateral - v.lateral) < 2.8) {
        laneTarget = other.lateral > 0 ? -4 : 4;
        if (gap < 9) targetSpeed = Math.min(targetSpeed, Math.max(12, other.speed - 1));
      }
    }
    v.aiLane = damp(v.aiLane, laneTarget, 1.8, dt);
    const target = this.track.sample(s + 12 + v.speed * .52);
    const heading = Math.atan2(target.x + target.nx * v.aiLane - v.position.x, target.z + target.nz * v.aiLane - v.position.z);
    const error = angleDifference(heading, v.heading);
    const steer = clamp(error * 3.2 - v.yawRate * .12, -1, 1);
    const brake = clamp((v.speed - targetSpeed - 2) * .12, 0, 1);
    return {
      throttle: clamp(.65 + (targetSpeed - v.speed) * .22, 0, 1), brake, steer,
      drift: curvature > .018 && v.speed > 29 && Math.abs(steer) > .5 && v.aggression > .65,
      nitro: curvature < .0018 && Math.abs(error) < .07 && v.nitro > .15 && mod(this.state.time + v.id * 3.5, 22) < 3,
    };
  }

  constrainToRoad(v: VehicleState) {
    const projection = this.track.project(v.position, v.trackIndex);
    const p = projection.sample;
    const limit = this.track.halfWidth - 1.18;
    v.trackIndex = p.index;
    v.lateral = projection.lateral;
    if (Math.abs(projection.lateral) <= limit) return;
    const side = Math.sign(projection.lateral);
    const penetration = projection.lateral - side * limit;
    v.position.x -= p.nx * penetration;
    v.position.z -= p.nz * penetration;
    const out = (v.velocity.x * p.nx + v.velocity.z * p.nz) * side;
    if (out > 0) {
      v.velocity.x -= p.nx * side * out * 1.15;
      v.velocity.z -= p.nz * side * out * 1.15;
    }
    if (v.collisionCooldown <= 0 && v.speed > 4) {
      v.velocity.x *= .82; v.velocity.z *= .82;
      this.events.push({ type: 'collision', vehicleId: v.id, position: { ...v.position }, strength: clamp(out / 18, .15, 1) });
      v.collisionCooldown = .35;
    }
    v.heading += angleDifference(p.heading, v.heading) * .10;
    v.yawRate *= .7;
    v.lateral = side * limit;
    v.speed = Math.hypot(v.velocity.x, v.velocity.z);
  }

  private resolveVehicleCollisions() {
    const vehicles = this.state.vehicles;
    for (let i = 0; i < vehicles.length; i++) for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i], b = vehicles[j];
      if (a.finishTime !== null || b.finishTime !== null) continue;
      if (Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > 5.5) continue;
      // Three circles along each chassis give a stable rounded rectangle at high speed.
      let bestDistance = Infinity;
      let normal: Vec2 = { x: 1, z: 0 };
      for (const alongA of [-1.3, 0, 1.3]) for (const alongB of [-1.3, 0, 1.3]) {
        const dx = b.position.x + Math.sin(b.heading) * alongB - a.position.x - Math.sin(a.heading) * alongA;
        const dz = b.position.z + Math.cos(b.heading) * alongB - a.position.z - Math.cos(a.heading) * alongA;
        const d = Math.hypot(dx, dz);
        if (d < bestDistance) { bestDistance = d; normal = d > .001 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 }; }
      }
      if (bestDistance >= 1.9) continue;
      const push = (1.9 - bestDistance) * .5;
      a.position.x -= normal.x * push; a.position.z -= normal.z * push;
      b.position.x += normal.x * push; b.position.z += normal.z * push;
      const closing = (b.velocity.x - a.velocity.x) * normal.x + (b.velocity.z - a.velocity.z) * normal.z;
      if (closing < 0) {
        const impulse = -closing * .58;
        a.velocity.x -= normal.x * impulse; a.velocity.z -= normal.z * impulse;
        b.velocity.x += normal.x * impulse; b.velocity.z += normal.z * impulse;
      }
      if (a.collisionCooldown <= 0 && b.collisionCooldown <= 0 && Math.max(a.speed, b.speed) > 5) {
        const strength = clamp(Math.abs(closing) / 20, .12, .8);
        for (const v of [a, b]) {
          this.events.push({ type: 'collision', vehicleId: v.id, position: { ...v.position }, strength });
          v.collisionCooldown = .3;
        }
      }
      this.constrainToRoad(a); this.constrainToRoad(b);
    }
  }

  updateProgress(v: VehicleState) {
    const projection = this.track.project(v.position, v.trackIndex);
    v.trackIndex = projection.sample.index;
    v.lateral = projection.lateral;
    let delta = projection.sample.s - mod(v.progress, this.track.length);
    if (delta > this.track.length / 2) delta -= this.track.length;
    if (delta < -this.track.length / 2) delta += this.track.length;
    v.progress += delta;
    v.speed = Math.hypot(v.velocity.x, v.velocity.z);
  }

  validateCheckpoints(v: VehicleState) {
    if (v.finishTime !== null) return;
    const spacing = this.track.length / this.track.checkpointCount;
    const next = v.nextCheckpoint * spacing;
    const delta = v.progress - v.previousProgress;
    // Ordered gates, forward crossing, and plausible per-tick travel prevent shortcut laps.
    if (delta <= 0 || delta > 12 || Math.abs(v.lateral) > this.track.halfWidth || v.previousProgress >= next || v.progress < next) return;
    v.lastCheckpoint = next;
    v.nextCheckpoint++;
    if (next > 0 && v.nextCheckpoint % this.track.checkpointCount === 1) {
      v.completedLaps++;
      const lapTime = this.state.time - v.lapStartTime;
      v.lapTimes.push(lapTime);
      v.lapStartTime = this.state.time;
      if (v.id === 0) this.events.push({ type: 'lap', lap: v.completedLaps, time: lapTime });
      if (v.completedLaps >= this.state.laps) v.finishTime = this.state.time;
    }
  }

  updateStandings() {
    const spacing = this.track.length / this.track.checkpointCount;
    this.state.standings = [...this.state.vehicles].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return Math.min(b.progress, b.nextCheckpoint * spacing) - Math.min(a.progress, a.nextCheckpoint * spacing);
    });
    this.state.rank = this.state.standings.findIndex(v => v.id === 0) + 1;
  }
}
