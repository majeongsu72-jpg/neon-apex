import { clamp, formatTime } from '../game/math';
import type { GameEvent, GameSettings, RacePhase, RaceState, SavedData, TrackDefinition } from '../game/types';
import type { RendererStats } from '../render/renderer';
import { layout } from './layout';

export class GameUI {
  private readonly root = document.querySelector<HTMLDivElement>('#ui')!;
  private readonly elements = new Map<string, HTMLElement>();
  private phase: RacePhase | null = null;
  private lastCountdown = -1;
  private goUntil = 0;
  private flashUntil = 0;
  private settingsVisible = false;
  private previousFocus: HTMLElement | null = null;
  private readonly maps = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; path: Path2D; scale: number; minX: number; maxZ: number; ox: number; oy: number }>();

  constructor(private readonly track: TrackDefinition, private readonly saved: SavedData,
    private readonly action: (action: string) => void, private readonly changeSettings: (settings: GameSettings) => void) {
    this.root.innerHTML = layout;
    this.root.querySelectorAll<HTMLElement>('[id]').forEach(el => this.elements.set(el.id, el));
    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) this.action(button.dataset.action!);
    });
    this.root.addEventListener('input', e => {
      const input = e.target as HTMLInputElement;
      const key = input.dataset.setting;
      if (!key) return;
      if (key === 'quality') this.saved.settings.quality = input.value as GameSettings['quality'];
      if (key === 'motion') this.saved.settings.motion = input.checked;
      if (key === 'music' || key === 'effects') this.saved.settings[key] = Number(input.value) / 100;
      this.syncSettings(); this.changeSettings(this.saved.settings);
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'F3') { e.preventDefault(); this.el('diagnostics').classList.toggle('hidden'); }
      if (e.code === 'Enter' && !this.settingsVisible && !(e.target as HTMLElement).matches('button, input, select')) {
        if (this.phase === 'menu') this.action('briefing');
        else if (this.phase === 'briefing' || this.phase === 'finished') this.action('race');
      }
      if (e.code === 'Tab' && this.settingsVisible) {
        const focusable = [...this.el('settings-screen').querySelectorAll<HTMLElement>('button, input, select')];
        const first = focusable[0], last = focusable.at(-1)!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    this.createMap('home-map'); this.createMap('race-map');
    this.drawMap('home-map'); this.syncSettings(); this.refreshBest();
    this.setPhase('menu');
  }

  private el(id: string) { return this.elements.get(id)!; }
  private text(id: string, value: string) { const el = this.el(id); if (el.textContent !== value) el.textContent = value; }
  private show(id: string, visible: boolean) { this.el(id).classList.toggle('hidden', !visible); }
  ready() { this.el('loading').classList.add('loaded'); setTimeout(() => this.show('loading', false), 450); }

  setPhase(phase: RacePhase) {
    if (this.phase === phase) return;
    if (this.phase === 'countdown' && phase === 'racing') {
      this.text('countdown', 'GO!'); this.el('countdown').classList.add('go'); this.goUntil = performance.now() + 1000;
    }
    this.phase = phase; document.body.dataset.phase = phase;
    this.show('title-screen', phase === 'menu');
    this.show('briefing-screen', phase === 'briefing');
    this.show('pause-screen', phase === 'paused');
    this.show('result-screen', phase === 'finished');
    this.show('game-hud', ['countdown', 'racing', 'paused'].includes(phase));
    if (phase === 'countdown') { this.lastCountdown = -1; this.el('countdown').classList.remove('go'); }
    if (phase !== 'countdown' && phase !== 'racing') { this.show('countdown', false); this.show('lap-flash', false); }
    if (phase === 'menu') this.refreshBest();
  }

  update(state: RaceState, stats: RendererStats) {
    this.setPhase(state.phase);
    const p = state.vehicles[0];
    if (state.phase === 'countdown') {
      const count = Math.ceil(state.countdown);
      this.show('countdown', true);
      if (count !== this.lastCountdown) {
        this.lastCountdown = count; this.text('countdown', String(count));
        this.el('countdown').animate([{ opacity: .3, transform: 'translate(-50%,-50%) scale(1.28)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 240, easing: 'ease-out' });
      }
    } else if (state.phase === 'racing') this.show('countdown', performance.now() < this.goUntil);
    if (performance.now() > this.flashUntil) this.show('lap-flash', false);
    this.text('position', String(state.rank));
    this.text('lap', String(Math.min(3, p.completedLaps + 1)).padStart(2, '0'));
    this.text('race-time', formatTime(state.time));
    this.text('best-lap', formatTime(p.lapTimes.length ? Math.min(...p.lapTimes) : this.saved.bestLap));
    const speed = Math.round(p.speed * 3.6);
    this.text('speed', String(speed).padStart(3, '0'));
    this.text('gear', String(clamp(1 + Math.floor(speed / 50), 1, 6)));
    this.text('district', this.track.district(p.progress));
    this.el('nitro-fill').style.transform = `scaleX(${p.nitro})`;
    this.text('nitro-state', p.boosting ? 'BOOSTING' : p.nitroLocked ? 'RELEASE SHIFT' : p.nitro < .10 ? 'CHARGING' : 'READY');
    document.body.classList.toggle('boosting', p.boosting && state.phase === 'racing');
    const rpm = 3 + (speed % 50) / 50 * 13;
    this.root.querySelectorAll<HTMLElement>('.rpm-strip i').forEach((el, i) => el.classList.toggle('active', i < rpm));
    this.show('drift-chip', p.drifting && state.phase === 'racing');
    this.el('race-progress-fill').style.transform = `scaleX(${clamp(p.progress / (this.track.length * state.laps), 0, 1)})`;
    state.standings.forEach((v, i) => {
      const row = this.el(`driver-${i}`);
      row.classList.toggle('you', v.id === 0);
      row.querySelector<HTMLElement>('.driver-color')!.style.backgroundColor = v.color;
      row.querySelector<HTMLElement>('.driver-name')!.textContent = v.name;
      row.querySelector<HTMLElement>('.driver-gap')!.textContent = v.id === 0 ? '◀ YOU' : v.finishTime !== null ? 'FINISH' : `${Math.round(Math.abs(v.progress - p.progress))}m`;
    });
    this.drawMap('race-map', state);
    this.text('diagnostics', `${stats.fps.toFixed(1)} FPS  /  SCALE ${stats.scale.toFixed(2)}  /  ${stats.drawCalls} DRAWS  /  ${Math.round(stats.triangles / 1000)}K TRIANGLES`);
  }

  event(event: GameEvent) {
    if (event.type === 'lap' && event.lap < 3) {
      this.text('lap-flash-title', event.lap === 2 ? 'FINAL LAP' : 'LAP 02');
      this.text('lap-flash-time', formatTime(event.time));
      this.show('lap-flash', true); this.flashUntil = performance.now() + 2600;
    }
  }

  result(state: RaceState, newRecord: boolean) {
    const p = state.vehicles[0];
    this.text('finish-rank', String(state.rank).padStart(2, '0'));
    this.text('finish-caption', state.rank === 1 ? '밤의 정상에 도착했습니다.' : state.rank <= 3 ? '멋진 질주였습니다. 다음은 정상입니다.' : '다음 코너에서, 승부는 다시 시작됩니다.');
    this.text('finish-time', formatTime(p.finishTime));
    this.text('finish-lap', formatTime(Math.min(...p.lapTimes)));
    p.lapTimes.forEach((time, i) => this.text(`result-lap-${i + 1}`, formatTime(time)));
    this.show('record-badge', newRecord); this.refreshBest();
  }

  showSettings(visible: boolean) {
    this.settingsVisible = visible;
    this.show('settings-screen', visible);
    if (visible) { this.previousFocus = document.activeElement as HTMLElement; this.syncSettings(); this.el('setting-quality').focus(); }
    else this.previousFocus?.focus();
  }

  get isSettingsVisible() { return this.settingsVisible; }
  refreshBest() { this.text('home-best', formatTime(this.saved.bestRace)); }

  storageUnavailable() { const hint = this.el('settings-screen').querySelector('.settings-footer > span'); if (hint) hint.textContent = '저장소를 사용할 수 없어 현재 세션에서 기록을 보관합니다.'; }

  error(message?: string) {
    this.show('loading', false); this.show('error-screen', true);
    if (message) this.text('error-message', message);
  }

  private syncSettings() {
    (this.el('setting-quality') as HTMLSelectElement).value = this.saved.settings.quality;
    (this.el('setting-music') as HTMLInputElement).value = String(this.saved.settings.music * 100);
    (this.el('setting-effects') as HTMLInputElement).value = String(this.saved.settings.effects * 100);
    (this.el('setting-motion') as HTMLInputElement).checked = this.saved.settings.motion;
    this.text('music-value', String(Math.round(this.saved.settings.music * 100)));
    this.text('effects-value', String(Math.round(this.saved.settings.effects * 100)));
  }

  private createMap(id: string) {
    const canvas = this.el(id) as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
    const minX = Math.min(...this.track.samples.map(p => p.x)), maxX = Math.max(...this.track.samples.map(p => p.x));
    const minZ = Math.min(...this.track.samples.map(p => p.z)), maxZ = Math.max(...this.track.samples.map(p => p.z));
    const scale = Math.min((canvas.width - 40) / (maxX - minX), (canvas.height - 25) / (maxZ - minZ));
    const ox = (canvas.width - (maxX - minX) * scale) / 2, oy = (canvas.height - (maxZ - minZ) * scale) / 2;
    const path = new Path2D();
    this.track.samples.forEach((p, i) => { const x = ox + (p.x - minX) * scale, y = oy + (maxZ - p.z) * scale; if (i === 0) path.moveTo(x, y); else path.lineTo(x, y); });
    path.closePath(); this.maps.set(id, { canvas, ctx, path, scale, minX, maxZ, ox, oy });
  }

  private drawMap(id: string, state?: RaceState) {
    const m = this.maps.get(id)!;
    const { ctx, canvas, path, scale, minX, maxZ, ox, oy } = m;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#182d3c'; ctx.lineWidth = 7; ctx.stroke(path);
    ctx.strokeStyle = '#64757c'; ctx.lineWidth = 2.3; ctx.stroke(path);
    const start = this.track.sample(0), sx = ox + (start.x - minX) * scale, sy = oy + (maxZ - start.z) * scale;
    ctx.fillStyle = '#c5f83a'; ctx.fillRect(sx - 4, sy - 2, 8, 4);
    if (!state) {
      ctx.strokeStyle = '#c5f83a'; ctx.lineWidth = 2.7; ctx.beginPath();
      for (let s = 0; s < this.track.length * .18; s += 8) { const p = this.track.sample(s); const x = ox + (p.x - minX) * scale, y = oy + (maxZ - p.z) * scale; if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke(); return;
    }
    for (const v of [...state.vehicles.slice(1), state.vehicles[0]]) {
      const x = ox + (v.position.x - minX) * scale, y = oy + (maxZ - v.position.z) * scale;
      ctx.fillStyle = v.color;
      if (v.id === 0) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(v.heading); ctx.shadowColor = '#c5f83a'; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(x, y, 2.9, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}
