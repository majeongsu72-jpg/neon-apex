export interface Vec2 { x: number; z: number }
export type RacePhase = 'menu' | 'briefing' | 'countdown' | 'racing' | 'paused' | 'finished';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface InputState {
  throttle: number;
  brake: number;
  /** +1 turns left, -1 turns right: positive Y-axis yaw for a +Z-forward car. */
  steer: number;
  drift: boolean;
  nitro: boolean;
}

export interface TrackSample extends Vec2 {
  s: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  heading: number;
  index: number;
}

export interface TrackDefinition {
  length: number;
  halfWidth: number;
  checkpointCount: number;
  samples: TrackSample[];
  sample(s: number): TrackSample;
  project(position: Vec2, nearIndex?: number): { sample: TrackSample; lateral: number; distance: number };
  district(s: number): string;
}

export interface VehicleState {
  id: number;
  name: string;
  color: string;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  heading: number;
  previousHeading: number;
  yawRate: number;
  steerAngle: number;
  speed: number;
  nitro: number;
  boosting: boolean;
  nitroLocked: boolean;
  drifting: boolean;
  slip: number;
  braking: boolean;
  progress: number;
  previousProgress: number;
  trackIndex: number;
  lateral: number;
  nextCheckpoint: number;
  lastCheckpoint: number;
  completedLaps: number;
  lapStartTime: number;
  lapTimes: number[];
  finishTime: number | null;
  collisionCooldown: number;
  aiLane: number;
  skill: number;
  aggression: number;
  wheelRotation: number;
}

export interface RaceState {
  phase: RacePhase;
  countdown: number;
  time: number;
  laps: number;
  vehicles: VehicleState[];
  rank: number;
  standings: VehicleState[];
}

export type GameEvent =
  | { type: 'collision'; vehicleId: number; position: Vec2; strength: number }
  | { type: 'lap'; lap: number; time: number }
  | { type: 'countdown'; value: number }
  | { type: 'finish'; rank: number; time: number };

export interface GameSettings {
  quality: Quality;
  music: number;
  effects: number;
  motion: boolean;
}

export interface SavedData {
  version: 1;
  settings: GameSettings;
  bestLap: number | null;
  bestRace: number | null;
}

export const EMPTY_INPUT: InputState = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
export const FIXED_DT = 1 / 60;
