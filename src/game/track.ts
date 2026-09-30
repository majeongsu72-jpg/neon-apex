import { angleDifference, lerp, mod } from './math';
import type { TrackDefinition, TrackSample, Vec2 } from './types';

const CONTROL_POINTS: Vec2[] = [
  { x: 0, z: 0 }, { x: 0, z: 170 }, { x: 30, z: 285 },
  { x: 180, z: 360 }, { x: 310, z: 335 }, { x: 365, z: 240 },
  { x: 350, z: 80 }, { x: 430, z: -35 }, { x: 540, z: -60 },
  { x: 615, z: -145 }, { x: 565, z: -230 }, { x: 430, z: -220 },
  { x: 305, z: -170 }, { x: 260, z: -280 }, { x: 265, z: -390 },
  { x: 150, z: -450 }, { x: 20, z: -395 }, { x: -55, z: -300 },
  { x: -100, z: -195 }, { x: -225, z: -215 }, { x: -315, z: -135 },
  { x: -315, z: 15 }, { x: -245, z: 135 }, { x: -125, z: 155 },
  { x: -70, z: 100 }, { x: -95, z: 20 }, { x: -80, z: -65 },
  { x: 0, z: -100 },
];

function catmull(t: number): Vec2 {
  const count = CONTROL_POINTS.length;
  const f = mod(t, 1) * count;
  const i = Math.floor(f);
  const u = f - i;
  const a = CONTROL_POINTS[mod(i - 1, count)];
  const b = CONTROL_POINTS[i];
  const c = CONTROL_POINTS[(i + 1) % count];
  const d = CONTROL_POINTS[(i + 2) % count];
  const interpolate = (key: 'x' | 'z') => .5 * (
    2 * b[key] + (-a[key] + c[key]) * u +
    (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * u * u +
    (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * u * u * u
  );
  return { x: interpolate('x'), z: interpolate('z') };
}

export function createTrack(): TrackDefinition {
  const raw: (Vec2 & { s: number })[] = [];
  let rawLength = 0;
  for (let i = 0; i <= 5000; i++) {
    const p = catmull(i / 5000);
    if (i > 0) rawLength += Math.hypot(p.x - raw[i - 1].x, p.z - raw[i - 1].z);
    raw.push({ ...p, s: rawLength });
  }
  const length = 2600;
  const scale = length / rawLength;
  const count = 1040;
  const step = length / count;
  const samples: TrackSample[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step / scale;
    while (cursor < raw.length - 2 && raw[cursor + 1].s < target) cursor++;
    const a = raw[cursor], b = raw[cursor + 1];
    const f = (target - a.s) / Math.max(.0001, b.s - a.s);
    samples.push({ x: lerp(a.x, b.x, f) * scale, z: lerp(a.z, b.z, f) * scale,
      s: i * step, tx: 0, tz: 0, nx: 0, nz: 0, heading: 0, index: i });
  }
  for (let i = 0; i < count; i++) {
    const a = samples[mod(i - 1, count)], b = samples[(i + 1) % count];
    const norm = Math.hypot(b.x - a.x, b.z - a.z);
    const p = samples[i];
    p.tx = (b.x - a.x) / norm; p.tz = (b.z - a.z) / norm;
    p.nx = -p.tz; p.nz = p.tx;
    p.heading = Math.atan2(p.tx, p.tz);
  }

  function sample(s: number): TrackSample {
    const normalized = mod(s, length) / step;
    const index = Math.floor(normalized);
    const a = samples[index], b = samples[(index + 1) % count];
    const f = normalized - index;
    const heading = a.heading + angleDifference(b.heading, a.heading) * f;
    const tx = Math.sin(heading), tz = Math.cos(heading);
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), s: mod(s, length),
      tx, tz, nx: -tz, nz: tx, heading, index };
  }

  function project(position: Vec2, nearIndex?: number) {
    let distance2 = Infinity, bestIndex = 0, bestF = 0;
    const start = nearIndex === undefined ? 0 : nearIndex - 32;
    const end = nearIndex === undefined ? count : nearIndex + 33;
    for (let i = start; i < end; i++) {
      const index = mod(i, count);
      const a = samples[index], b = samples[(index + 1) % count];
      const dx = b.x - a.x, dz = b.z - a.z;
      const f = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (dx * dx + dz * dz)));
      const x = position.x - (a.x + dx * f), z = position.z - (a.z + dz * f);
      const d2 = x * x + z * z;
      if (d2 < distance2) { distance2 = d2; bestIndex = index; bestF = f; }
    }
    const p = sample((bestIndex + bestF) * step);
    return { sample: p, lateral: (position.x - p.x) * p.nx + (position.z - p.z) * p.nz, distance: Math.sqrt(distance2) };
  }

  return { length, halfWidth: 10.5, checkpointCount: 32, samples, sample, project,
    district: (s) => {
      const t = mod(s, length) / length;
      if (t < .18) return 'NEON DISTRICT';
      if (t < .30) return 'LIGHT TUNNEL';
      if (t < .51) return 'MIDNIGHT DOCKS';
      if (t < .70) return 'THE SWITCHBACK';
      return 'SKYLINE AVENUE';
    } };
}
