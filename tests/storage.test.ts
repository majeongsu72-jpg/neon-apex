import { describe, expect, it } from 'vitest';
import { loadData, recordRace, saveData, STORAGE_KEY } from '../src/game/storage';

describe('persistent settings and records', () => {
  it('retains records and settings after saving and reloading', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, v: string) => { store.set(key, v); } };
    const data = loadData(storage);
    data.settings.music = .6;
    expect(recordRace(data, 180, [61, 60, 59])).toBe(true);
    expect(saveData(storage, data)).toBe(true);
    expect(loadData(storage)).toEqual(data);
    expect(recordRace(data, 190, [65, 64, 61])).toBe(false);
    expect(data.bestRace).toBe(180);
    expect(data.bestLap).toBe(59);
  });

  it('survives blocked storage, corrupted data and unsupported versions', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const data = loadData(blocked, false);
    expect(data.settings.motion).toBe(false);
    expect(saveData(blocked, data)).toBe(false);
    expect(loadData({ getItem: () => '{bad', setItem() {} }).bestLap).toBeNull();
    expect(loadData({ getItem: () => '{"version":2}', setItem() {} }).version).toBe(1);
  });

  it('rejects invalid records and bounds user settings', () => {
    const data = loadData({ getItem: key => key === STORAGE_KEY ? JSON.stringify({ version: 1, bestLap: -5, settings: { effects: 4, music: -1, quality: 'broken' } }) : null, setItem() {} });
    expect(data.settings.effects).toBe(1);
    expect(data.settings.music).toBe(0);
    expect(data.settings.quality).toBe('auto');
    expect(data.bestLap).toBeNull();
    expect(recordRace(data, NaN, [10, 10, 10])).toBe(false);
    expect(recordRace(data, 50, [10, 10])).toBe(false);
  });
});
