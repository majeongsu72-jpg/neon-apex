import { describe, expect, it } from 'vitest';
import { RaceEngine } from '../src/game/engine';
import { createTrack } from '../src/game/track';
import { EMPTY_INPUT, FIXED_DT } from '../src/game/types';
import { angleDifference, formatTime } from '../src/game/math';

const track = createTrack();
const throttle = { ...EMPTY_INPUT, throttle: 1 };
const advance = (engine: RaceEngine, seconds: number, input = throttle) => {
  for (let i = 0; i < seconds * 60; i++) engine.integrate(engine.player, input, FIXED_DT);
};

describe('circuit and arcade handling', () => {
  it('uses a continuous 2.6km closed road with consistent projection', () => {
    expect(track.length).toBe(2600);
    for (const s of [0, 10, 1000, 2599, -10, 2610]) {
      const p = track.sample(s);
      const projected = track.project({ x: p.x + p.nx * 3, z: p.z + p.nz * 3 }, p.index);
      expect(projected.lateral, `projection at ${s}m`).toBeCloseTo(3, 1);
      expect(Math.abs(angleDifference(projected.sample.heading, p.heading))).toBeLessThan(.01);
    }
  });

  it('accelerates, reaches its top-speed band and brakes to a stop', () => {
    const engine = new RaceEngine(track);
    advance(engine, 30);
    expect(engine.player.speed * 3.6).toBeGreaterThan(275);
    expect(engine.player.speed * 3.6).toBeLessThan(284);
    advance(engine, 4, { ...EMPTY_INPUT, brake: 1 });
    expect(engine.player.speed).toBe(0);
  });

  it('limits a held nitro burst to four seconds and recharges after use', () => {
    const engine = new RaceEngine(track);
    advance(engine, 10);
    advance(engine, 4, { ...throttle, nitro: true });
    expect(engine.player.nitro).toBeLessThan(.001);
    expect(engine.player.speed * 3.6).toBeGreaterThan(310);
    advance(engine, 2, { ...throttle, nitro: true });
    expect(engine.player.boosting).toBe(false);
    advance(engine, 2, throttle);
    expect(engine.player.nitro).toBeGreaterThan(.15);
  });

  it('allows controlled slip and restores grip when drift is released', () => {
    const engine = new RaceEngine(track);
    advance(engine, 8);
    engine.player.nitro = .3;
    advance(engine, 1.5, { ...throttle, steer: .7, drift: true });
    const slip = Math.abs(engine.player.slip);
    expect(engine.player.drifting).toBe(true);
    expect(slip).toBeGreaterThan(.10);
    advance(engine, 1, throttle);
    expect(engine.player.drifting).toBe(false);
    expect(Math.abs(engine.player.slip)).toBeLessThan(slip * .1);
  });

  it('contains wall impacts, reduces velocity and emits collision feedback', () => {
    const engine = new RaceEngine(track);
    const p = track.sample(100);
    const v = engine.player;
    v.trackIndex = p.index;
    v.position = { x: p.x + p.nx * 15, z: p.z + p.nz * 15 };
    v.velocity = { x: p.nx * 25 + p.tx * 40, z: p.nz * 25 + p.tz * 40 };
    v.speed = Math.hypot(v.velocity.x, v.velocity.z);
    const oldSpeed = v.speed;
    engine.constrainToRoad(v);
    expect(Math.abs(v.lateral)).toBeLessThan(track.halfWidth);
    expect(v.speed).toBeLessThan(oldSpeed);
    expect(engine.drainEvents().some(e => e.type === 'collision')).toBe(true);
  });
});

describe('race integrity', () => {
  it('places the player sixth on the countdown grid', () => {
    const engine = new RaceEngine(track);
    engine.reset('countdown');
    expect(engine.state.rank).toBe(6);
    expect(engine.state.standings.at(-1)?.id).toBe(0);
  });

  it('does not award laps for skipping gates, reversing, or re-crossing a gate', () => {
    const engine = new RaceEngine(track);
    const v = engine.player;
    v.previousProgress = 2599; v.progress = 2601;
    engine.validateCheckpoints(v);
    expect(v.completedLaps).toBe(0);
    v.previousProgress = 1; v.progress = -1;
    engine.validateCheckpoints(v);
    expect(v.nextCheckpoint).toBe(0);
    v.previousProgress = -1; v.progress = 1;
    engine.validateCheckpoints(v);
    expect(v.nextCheckpoint).toBe(1);
    v.previousProgress = -1; v.progress = 1;
    engine.validateCheckpoints(v);
    expect(v.nextCheckpoint).toBe(1);
  });

  it('requires all ordered gates for a lap and three laps for a finish', () => {
    const engine = new RaceEngine(track);
    const v = engine.player;
    for (let i = 0; i <= 96; i++) {
      engine.state.time = i * 2 + 1;
      v.previousProgress = i * 81.25 - 1; v.progress = i * 81.25 + 1;
      engine.validateCheckpoints(v);
    }
    expect(v.completedLaps).toBe(3);
    expect(v.finishTime).toBe(193);
    expect(v.lapTimes).toHaveLength(3);
  });

  it('freezes countdown, simulation and race time while paused', () => {
    const engine = new RaceEngine(track);
    engine.reset(); engine.pause();
    engine.step(1, throttle);
    expect(engine.state.countdown).toBe(3);
    engine.resume();
    for (let i = 0; i < 181; i++) engine.step(FIXED_DT, throttle);
    engine.step(FIXED_DT, throttle);
    engine.pause();
    const time = engine.state.time, position = { ...engine.player.position };
    engine.step(1, throttle);
    expect(engine.state.time).toBe(time);
    expect(engine.player.position).toEqual(position);
  });

  it('returns to the last valid checkpoint without awarding progress', () => {
    const engine = new RaceEngine(track);
    engine.reset('racing');
    const v = engine.player;
    v.lastCheckpoint = 81.25; v.nextCheckpoint = 2; v.progress = 137; v.speed = 35;
    engine.recover();
    expect(v.progress).toBe(81.25);
    expect(v.nextCheckpoint).toBe(2);
    expect(v.speed).toBe(0);
  });

  it('ranks completed racers first and orders unfinished racers by valid progress', () => {
    const engine = new RaceEngine(track);
    const a = engine.state.vehicles[1], b = engine.state.vehicles[2];
    a.finishTime = 180; b.finishTime = 175;
    engine.player.progress = 1000; engine.player.nextCheckpoint = 1;
    engine.state.vehicles[3].progress = 200; engine.state.vehicles[3].nextCheckpoint = 3;
    engine.updateStandings();
    expect(engine.state.standings.slice(0, 2).map(v => v.id)).toEqual([2, 1]);
    expect(engine.state.rank).toBe(4);
  });

  it('lets the shared AI controller complete an actual three-lap race', () => {
    const engine = new RaceEngine(track);
    engine.reset('racing');
    for (let i = 0; i < 60 * 480 && engine.state.phase !== 'finished'; i++) {
      engine.step(FIXED_DT, engine.aiInput(engine.player, FIXED_DT));
    }
    expect(engine.player.completedLaps, JSON.stringify(engine.state.vehicles.map(v => ({ id: v.id, progress: Math.round(v.progress), gate: v.nextCheckpoint, speed: v.speed, laps: v.completedLaps })))).toBe(3);
    expect(engine.state.phase).toBe('finished');
    expect(engine.state.time).toBeLessThan(480);
    expect(engine.state.vehicles.every(v => Number.isFinite(v.position.x) && Number.isFinite(v.position.z))).toBe(true);
  }, 30000);

  it('formats race times using integer centiseconds', () => {
    expect(formatTime(61.234)).toBe('01:01.23');
    expect(formatTime(null)).toBe('—:——.——');
  });
});
