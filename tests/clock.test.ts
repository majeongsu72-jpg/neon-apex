import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/game/clock';
import { RaceEngine } from '../src/game/engine';
import { createTrack } from '../src/game/track';
import { EMPTY_INPUT, FIXED_DT } from '../src/game/types';

describe('render-independent simulation clock', () => {
  it('produces identical racing, steering and boost results at 30, 60 and 120 render FPS', () => {
    const run = (fps: number) => {
      const clock = new FixedStepClock(), game = new RaceEngine(createTrack());
      game.reset('racing');
      let ticks = 0;
      for (let frame = 0; frame < fps * 10; frame++) clock.advance(1 / fps, () => {
        game.step(FIXED_DT, { ...EMPTY_INPUT, throttle: 1, steer: ticks > 430 && ticks < 490 ? .45 : 0,
          drift: ticks > 430 && ticks < 490, nitro: ticks > 180 && ticks < 300 });
        ticks++;
      });
      return { ticks, time: game.state.time, position: game.player.position, heading: game.player.heading,
        nitro: game.player.nitro, progress: game.player.progress };
    };
    const reference = run(60);
    expect(reference.ticks).toBe(600);
    expect(run(30)).toEqual(reference);
    expect(run(120)).toEqual(reference);
  });

  it('bounds catch-up after stalls and drops stale time on reset', () => {
    const clock = new FixedStepClock();
    let ticks = 0;
    expect(clock.advance(5, () => ticks++)).toBe(6);
    expect(ticks).toBe(6);
    clock.advance(FIXED_DT / 2, () => ticks++);
    clock.reset();
    expect(clock.advance(FIXED_DT / 2, () => ticks++)).toBe(0);
    expect(clock.alpha).toBeCloseTo(.5);
  });
});
