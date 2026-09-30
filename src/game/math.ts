export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mod = (v: number, n: number) => ((v % n) + n) % n;
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const angleDifference = (a: number, b: number) => mod(a - b + Math.PI, Math.PI * 2) - Math.PI;
export const lerpAngle = (a: number, b: number, t: number) => a + angleDifference(b, a) * t;

export function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—:——.——';
  const milliseconds = Math.floor(Math.max(0, seconds) * 1000);
  return `${Math.floor(milliseconds / 60000).toString().padStart(2, '0')}:${Math.floor(milliseconds / 1000 % 60).toString().padStart(2, '0')}.${Math.floor(milliseconds % 1000 / 10).toString().padStart(2, '0')}`;
}
