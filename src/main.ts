import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './style.css';
import { RaceEngine } from './game/engine';
import { createTrack } from './game/track';
import { KeyboardInput } from './game/input';
import { FixedStepClock } from './game/clock';
import { FIXED_DT } from './game/types';
import type { GameSettings } from './game/types';
import { loadData, recordRace, saveData } from './game/storage';
import type { StorageLike } from './game/storage';
import { GameRenderer } from './render/renderer';
import { GameAudio } from './audio/audio';
import { GameUI } from './ui/ui';

interface Telemetry { time: number; fps: number; scale: number; speed: number; progress: number; phase: string; draws: number }
interface DebugController {
  engine: RaceEngine;
  renderer: GameRenderer;
  autopilot: boolean;
  simulationRate: number;
  frameTimes: number[];
  telemetry: Telemetry[];
  readonly audioState: string;
  clearTelemetry(): void;
}
declare global { interface Window { __NEON_APEX__?: DebugController } }

const track = createTrack();
const engine = new RaceEngine(track);
let storage: StorageLike | null = null;
try { storage = window.localStorage; } catch { /* Session-only records remain available. */ }
const saved = loadData(storage, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const audio = new GameAudio(saved.settings);
let renderer: GameRenderer | null = null;
let settingsResume = false;
const clock = new FixedStepClock();

const persist = () => { if (!saveData(storage, saved)) ui.storageUnavailable(); };
const applySettings = (settings: GameSettings) => { renderer?.setSettings(settings); audio.setSettings(settings); persist(); };
const ui = new GameUI(track, saved, handleAction, applySettings);
const input = new KeyboardInput(action => {
  if (action === 'recover') { engine.recover(); renderer?.reset(); input.clear(); return; }
  if (ui.isSettingsVisible) { handleAction('close-settings'); return; }
  if (engine.state.phase === 'paused') handleAction('resume');
  else if (engine.state.phase === 'briefing') handleAction('home');
  else { engine.pause(); ui.setPhase(engine.state.phase); input.clear(); audio.suspend(); }
}, () => engine.state.phase === 'racing' || engine.state.phase === 'countdown');

function handleAction(action: string) {
  switch (action) {
    case 'briefing':
      engine.briefing(); ui.setPhase(engine.state.phase); input.clear(); void audio.activate();
      break;
    case 'race':
      settingsResume = false; ui.showSettings(false); engine.reset('countdown'); renderer?.reset();
      input.clear(); clock.reset(); ui.setPhase('countdown');
      void audio.activate().then(() => audio.event({ type: 'countdown', value: 3 }));
      (document.activeElement as HTMLElement | null)?.blur();
      break;
    case 'home':
      settingsResume = false; ui.showSettings(false); engine.reset('menu'); renderer?.reset(); input.clear(); clock.reset();
      ui.setPhase('menu'); void audio.activate(); (document.activeElement as HTMLElement | null)?.blur();
      break;
    case 'resume':
      engine.resume(); ui.setPhase(engine.state.phase); input.clear(); void audio.activate();
      (document.activeElement as HTMLElement | null)?.blur();
      break;
    case 'settings':
      settingsResume = engine.state.phase === 'racing' || engine.state.phase === 'countdown';
      if (settingsResume) { engine.pause(); ui.setPhase(engine.state.phase); input.clear(); audio.suspend(); }
      ui.showSettings(true);
      break;
    case 'close-settings':
      ui.showSettings(false);
      if (settingsResume) { engine.resume(); ui.setPhase(engine.state.phase); input.clear(); void audio.activate(); (document.activeElement as HTMLElement | null)?.blur(); }
      settingsResume = false;
      break;
    case 'fullscreen':
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
      break;
    case 'retry': location.reload(); break;
  }
}

const pauseWhenAway = () => {
  if (engine.state.phase === 'racing' || engine.state.phase === 'countdown') {
    engine.pause(); ui.setPhase('paused'); input.clear(); audio.suspend(); clock.reset();
  }
};
window.addEventListener('blur', pauseWhenAway);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenAway(); });

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); pauseWhenAway();
  ui.error('그래픽 연결이 끊겼습니다. 다른 그래픽 작업을 닫고 다시 시도해주세요.');
});

async function initialize() {
  await document.fonts.load('700 24px Rajdhani');
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  try {
    renderer = new GameRenderer(canvas, track, engine.state, saved.settings);
    renderer.render(engine.state, 1, FIXED_DT);
  } catch (error) {
    console.error('Game graphics initialization failed:', error);
    ui.error(); return;
  }
  if (import.meta.env.DEV) {
    window.__NEON_APEX__ = {
      engine, renderer, autopilot: false, simulationRate: 1, frameTimes: [], telemetry: [],
      get audioState() { return audio.state; },
      clearTelemetry() { this.frameTimes = []; this.telemetry = []; },
    };
  }
  ui.ready();
  if (!storage) ui.storageUnavailable();
  let lastTime = performance.now(), uiTimer = 0, telemetryTimer = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    const realDt = (now - lastTime) / 1000;
    lastTime = now;
    if (document.hidden || !renderer) { clock.reset(); return; }
    const display = renderer;
    const dt = Math.min(.1, Math.max(0, realDt));
    const debug = import.meta.env.DEV ? window.__NEON_APEX__ : undefined;
    const simRate = debug ? Math.max(1, Math.min(20, debug.simulationRate)) : 1;
    if (engine.state.phase === 'countdown' || engine.state.phase === 'racing') {
      clock.advance(dt, () => {
        const controls = debug?.autopilot && engine.state.phase === 'racing' ? engine.aiInput(engine.player, FIXED_DT) : input.read();
        engine.step(FIXED_DT, controls);
        for (const event of engine.drainEvents()) {
          display.event(event); audio.event(event); ui.event(event);
          if (event.type === 'finish') {
            const newRecord = recordRace(saved, event.time, engine.player.lapTimes);
            persist(); ui.result(engine.state, newRecord);
          }
        }
      }, simRate);
    } else clock.reset();
    const interpolated = engine.state.phase === 'racing' ? clock.alpha : 1;
    renderer.render(engine.state, interpolated, dt);
    audio.update(engine.state);
    uiTimer += dt;
    if (uiTimer > .05) { ui.update(engine.state, renderer.stats); uiTimer = 0; }
    if (debug) {
      debug.frameTimes.push(realDt * 1000);
      if (debug.frameTimes.length > 18000) debug.frameTimes.shift();
      telemetryTimer += dt;
      if (telemetryTimer > .5) {
        debug.telemetry.push({ time: engine.state.time, fps: renderer.stats.fps, scale: renderer.stats.scale,
          speed: engine.player.speed * 3.6, progress: engine.player.progress, phase: engine.state.phase, draws: renderer.stats.drawCalls });
        if (debug.telemetry.length > 2000) debug.telemetry.shift();
        telemetryTimer = 0;
      }
    }
  }
  requestAnimationFrame(frame);
}

void initialize();
