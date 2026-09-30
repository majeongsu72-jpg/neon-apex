import type { GameSettings, SavedData } from './types';

export const STORAGE_KEY = 'neon-apex.v1';
export const defaultSettings = (motion = true): GameSettings => ({ quality: 'auto', music: .32, effects: .72, motion });
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadData(storage: StorageLike | null, motion = true): SavedData {
  const fallback: SavedData = { version: 1, settings: defaultSettings(motion), bestLap: null, bestRace: null };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (data.version !== 1) return fallback;
    const s = data.settings ?? {};
    const volume = (v: unknown, defaultValue: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : defaultValue;
    const record = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
    return { version: 1, settings: {
      quality: ['auto', 'low', 'medium', 'high'].includes(s.quality) ? s.quality : 'auto',
      music: volume(s.music, fallback.settings.music), effects: volume(s.effects, fallback.settings.effects),
      motion: typeof s.motion === 'boolean' ? s.motion : motion,
    }, bestLap: record(data.bestLap), bestRace: record(data.bestRace) };
  } catch { return fallback; }
}

export function saveData(storage: StorageLike | null, data: SavedData): boolean {
  try { if (!storage) return false; storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function recordRace(data: SavedData, raceTime: number, lapTimes: number[]) {
  if (!Number.isFinite(raceTime) || raceTime <= 0 || lapTimes.length !== 3 || lapTimes.some(t => !Number.isFinite(t) || t <= 0)) return false;
  const previous = data.bestRace;
  data.bestRace = Math.min(data.bestRace ?? Infinity, raceTime);
  data.bestLap = Math.min(data.bestLap ?? Infinity, ...lapTimes);
  return previous === null || raceTime < previous;
}
