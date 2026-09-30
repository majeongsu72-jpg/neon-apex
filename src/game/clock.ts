import { FIXED_DT } from './types';
import { clamp } from './math';

/** Rendering frequency never changes the simulation step or vehicle tuning. */
export class FixedStepClock {
  private accumulator = 0;
  get alpha() { return clamp(this.accumulator / FIXED_DT, 0, 1); }
  reset() { this.accumulator = 0; }

  advance(frameDt: number, tick: () => void, rate = 1) {
    this.accumulator += clamp(frameDt, 0, .1) * rate;
    let count = 0;
    while (this.accumulator + 1e-12 >= FIXED_DT && count < Math.ceil(6 * rate)) {
      tick(); this.accumulator -= FIXED_DT; count++;
    }
    return count;
  }
}
