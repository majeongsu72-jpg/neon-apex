import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const args = ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist'];
if (process.platform === 'win32') args.push('--use-angle=d3d11');
const browser = await chromium.launch({ headless: true, args });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => !!window.__NEON_APEX__);
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  for (const [name, distance] of [['tunnel', 624], ['harbor', 1000], ['skyline', 2050]]) {
    await page.evaluate(s => {
      const g = window.__NEON_APEX__; g.engine.reset('racing'); g.autopilot = false;
      g.engine.state.vehicles.forEach(v => {
        const progress = s + v.id * 12, p = g.engine.track.sample(progress), lane = v.id === 0 ? 0 : (v.id % 2 ? 2.6 : -2.6);
        v.progress = progress; v.previousProgress = progress; v.trackIndex = p.index;
        v.position = { x: p.x + p.nx * lane, z: p.z + p.nz * lane }; v.previousPosition = { ...v.position };
        v.heading = p.heading; v.previousHeading = p.heading;
        v.nextCheckpoint = Math.floor(progress / 81.25) + 1; v.lastCheckpoint = Math.floor(progress / 81.25) * 81.25;
      });
      g.renderer.reset();
    }, distance);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `artifacts/gallery-${name}-1080.png` });
  }
  console.log(JSON.stringify({ errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
