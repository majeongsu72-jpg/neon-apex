import type { InputState } from './types';

const DRIVING_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);

export class KeyboardInput {
  private held = new Set<string>();

  constructor(onAction: (action: 'pause' | 'recover') => void, isDriving: () => boolean = () => true) {
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); onAction('pause'); return; }
      if ((e.target as HTMLElement).matches('input, select, textarea') || !isDriving()) return;
      if (DRIVING_KEYS.has(e.code)) { e.preventDefault(); this.held.add(e.code); }
      if (e.repeat) return;
      if (e.code === 'KeyR') { e.preventDefault(); onAction('recover'); }
    });
    window.addEventListener('keyup', e => this.held.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }

  clear() { this.held.clear(); }

  read(): InputState {
    const any = (...keys: string[]) => keys.some(k => this.held.has(k));
    return {
      throttle: any('KeyW', 'ArrowUp') ? 1 : 0,
      brake: any('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (any('KeyA', 'ArrowLeft') ? 1 : 0) - (any('KeyD', 'ArrowRight') ? 1 : 0),
      drift: any('Space'), nitro: any('ShiftLeft', 'ShiftRight'),
    };
  }
}
