import { clamp } from '../game/math';
import type { GameEvent, GameSettings, RaceState } from '../game/types';

export class GameAudio {
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscillators: OscillatorNode[] = [];
  private driftGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rivals: { oscillator: OscillatorNode; gain: GainNode; panner: StereoPannerNode }[] = [];
  private nextBeat = 0;
  private step = 0;
  private settings: GameSettings;

  constructor(settings: GameSettings) { this.settings = { ...settings }; }
  get state() { return this.context?.state ?? 'inactive'; }

  async activate() {
    if (!this.context) this.initialize();
    try { await this.context?.resume(); } catch { /* Audio is optional; racing still works. */ }
  }

  suspend() { void this.context?.suspend().catch(() => {}); }

  setSettings(settings: GameSettings) {
    this.settings = { ...settings };
    if (!this.context || !this.effects || !this.music) return;
    this.effects.gain.setTargetAtTime(settings.effects, this.context.currentTime, .04);
    this.music.gain.setTargetAtTime(settings.music * .48, this.context.currentTime, .04);
  }

  private initialize() {
    if (!('AudioContext' in window)) return;
    const ctx = new AudioContext(); this.context = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12; compressor.ratio.value = 5; compressor.connect(ctx.destination);
    this.effects = ctx.createGain(); this.effects.connect(compressor);
    this.music = ctx.createGain(); this.music.connect(compressor);
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 600;
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.effects);
    for (const [index, multiplier] of [1, 2, 3].entries()) {
      const oscillator = ctx.createOscillator(); oscillator.type = index === 0 ? 'sawtooth' : 'triangle';
      oscillator.frequency.value = 40 * multiplier;
      const gain = ctx.createGain(); gain.gain.value = [.40, .20, .12][index];
      oscillator.connect(gain); gain.connect(this.engineFilter); oscillator.start(); this.engineOscillators.push(oscillator);
    }
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noise = this.noise.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < noise.length; i++) { previous = previous * .75 + (Math.random() * 2 - 1) * .25; noise[i] = previous; }
    this.driftGain = this.loopNoise('bandpass', 1700, .5);
    this.windGain = this.loopNoise('highpass', 500, .7);
    this.boostGain = this.loopNoise('bandpass', 360, 1.2);
    for (let i = 0; i < 5; i++) {
      const oscillator = ctx.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = 60;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const panner = ctx.createStereoPanner(); oscillator.connect(gain); gain.connect(panner); panner.connect(this.effects);
      oscillator.start(); this.rivals.push({ oscillator, gain, panner });
    }
    this.nextBeat = ctx.currentTime + .05;
    this.setSettings(this.settings);
  }

  private loopNoise(type: BiquadFilterType, frequency: number, q: number) {
    const ctx = this.context!;
    const source = ctx.createBufferSource(); source.buffer = this.noise; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(filter); filter.connect(gain); gain.connect(this.effects!); source.start();
    return gain;
  }

  update(state: RaceState) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const p = state.vehicles[0];
    const running = state.phase === 'racing' || state.phase === 'countdown';
    const speed = p.speed * 3.6;
    const gear = clamp(Math.floor(speed / 50), 0, 5);
    const rpm = clamp((speed - gear * 50) / 58, 0, 1);
    this.engineOscillators.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime((42 + rpm * 110 + gear * 7) * (i + 1), t, .04));
    this.engineGain!.gain.setTargetAtTime(running ? .075 + p.speed / 1600 : 0, t, .08);
    this.engineFilter!.frequency.setTargetAtTime(450 + speed * 3.5, t, .1);
    this.driftGain!.gain.setTargetAtTime(running && p.drifting ? .16 : 0, t, .07);
    this.windGain!.gain.setTargetAtTime(running ? Math.pow(p.speed / 100, 2) * .12 : 0, t, .1);
    this.boostGain!.gain.setTargetAtTime(running && p.boosting ? .22 : 0, t, .08);
    for (let i = 0; i < this.rivals.length; i++) {
      const other = state.vehicles[i + 1], rival = this.rivals[i];
      const dx = other.position.x - p.position.x, dz = other.position.z - p.position.z;
      const distance = Math.hypot(dx, dz);
      rival.oscillator.frequency.setTargetAtTime(65 + other.speed * 1.8, t, .1);
      rival.gain.gain.setTargetAtTime(running && distance < 35 ? .025 * Math.pow(1 - distance / 35, 2) : 0, t, .1);
      rival.panner.pan.setTargetAtTime(clamp((dx * Math.cos(p.heading) - dz * Math.sin(p.heading)) / 12, -1, 1), t, .08);
    }
    if (this.nextBeat < t - .3) this.nextBeat = t;
    while (this.nextBeat < t + .12) { this.musicStep(this.nextBeat, this.step++); this.nextBeat += 60 / 128 / 4; }
  }

  private tone(frequency: number, time: number, duration: number, amplitude: number, destination: AudioNode, type: OscillatorType = 'sine', endFrequency?: number) {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), time + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(envelope); envelope.connect(destination); oscillator.start(time); oscillator.stop(time + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private noiseHit(time: number, duration: number, amplitude: number, frequency: number, destination: AudioNode, highpass = false) {
    const ctx = this.context!;
    const source = ctx.createBufferSource(); source.buffer = this.noise;
    const filter = ctx.createBiquadFilter(); filter.type = highpass ? 'highpass' : 'lowpass'; filter.frequency.value = frequency;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(amplitude, time); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(destination); source.start(time); source.stop(time + duration + .01);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private musicStep(t: number, step: number) {
    if (this.settings.music <= 0 || !this.music) return;
    const beat = step % 16;
    if (beat % 4 === 0) this.tone(125, t, .20, .32, this.music, 'sine', 43);
    if (beat === 4 || beat === 12) this.noiseHit(t, .1, .12, 2400, this.music, true);
    if (beat % 2 === 0) this.noiseHit(t, .035, beat % 4 ? .10 : .06, 6500, this.music, true);
    const bassNotes = [82.41, 82.41, 98, 73.42, 82.41, 110, 98, 73.42];
    if (beat % 2 === 0) this.tone(bassNotes[Math.floor(step / 2) % 8], t, .17, .085, this.music, 'triangle');
    const melody = [329.63, 0, 246.94, 0, 293.66, 0, 220, 0, 329.63, 392, 0, 293.66, 0, 246.94, 0, 440];
    if (melody[beat]) this.tone(melody[beat], t, .28, .016, this.music, 'sine');
    if (step % 32 === 0) for (const note of [164.81, 196, 246.94]) this.tone(note, t, 2.8, .022, this.music, 'sine');
  }

  event(event: GameEvent) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.effects) return;
    const t = ctx.currentTime;
    if (event.type === 'collision' && event.vehicleId === 0) {
      this.noiseHit(t, .16, .4 * event.strength, 1200, this.effects);
      this.tone(100, t, .13, .09 * event.strength, this.effects, 'triangle', 34);
    }
    if (event.type === 'countdown') this.tone(event.value === 0 ? 880 : 440, t, event.value === 0 ? .32 : .13, .1, this.effects);
    if (event.type === 'lap') this.tone(660, t, .18, .055, this.effects);
    if (event.type === 'finish') for (const [i, note] of [523.25, 659.25, 783.99, 1046.5].entries()) this.tone(note, t + i * .11, .4, .07, this.effects);
  }
}
