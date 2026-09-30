import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const args = ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist'];
if (process.platform === 'win32') args.push('--use-angle=d3d11');
const browser = await chromium.launch({ headless: true, args });
const errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
};

try {
  const production = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(production);
  await production.goto(process.env.NEON_APEX_PRODUCTION_URL || 'http://127.0.0.1:49173/');
  await expect(production.locator('#loading')).toBeHidden({ timeout: 30000 });
  expect(await production.evaluate(() => window.__NEON_APEX__)).toBeUndefined();
  await production.getByRole('button', { name: '레이스 시작' }).click();
  await production.getByRole('button', { name: '준비 완료' }).click();
  await production.waitForTimeout(4200);
  await production.keyboard.down('w');
  await production.waitForTimeout(2000);
  const speed = Number(await production.locator('#speed').textContent());
  expect(speed).toBeGreaterThan(20);
  await production.keyboard.down('Shift'); await production.waitForTimeout(600);
  await production.keyboard.up('Shift'); await production.keyboard.up('w');
  await production.keyboard.press('Escape');
  await expect(production.locator('#pause-screen')).toBeVisible();
  await production.locator('#pause-screen').getByRole('button', { name: '메인 화면' }).click();
  await expect(production.locator('#title-screen')).toBeVisible();
  await production.waitForTimeout(1000);
  await production.screenshot({ path: 'artifacts/production-title-1080.png' });
  await production.close();
  console.log('Production smoke passed: real keyboard drive, nitro, pause, home; development hooks absent.');

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(page);
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => !!window.__NEON_APEX__);
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__.engine.state.phase === 'racing');
  const scenarios = [];
  for (const [name, distance, speed, closePack] of [
    ['harbor-nitro', 860, 65, false],
    ['downtown-overtaking', 170, 38, true],
    ['drift-smoke-and-contact', 1610, 48, false],
  ]) {
    await page.evaluate(({ distance, speed, closePack }) => {
      const g = window.__NEON_APEX__;
      g.autopilot = false; g.simulationRate = 1; g.engine.reset('racing');
      g.engine.state.vehicles.forEach(v => {
        const progress = distance + v.id * (closePack ? 5.5 : 16);
        const p = g.engine.track.sample(progress);
        const lane = v.id === 0 ? 0 : (v.id % 2 ? 2.7 : -2.7);
        const velocity = v.id === 0 ? speed : (closePack ? speed - 9 : speed - 3);
        Object.assign(v, { progress, previousProgress: progress, trackIndex: p.index,
          position: { x: p.x + p.nx * lane, z: p.z + p.nz * lane },
          heading: p.heading, previousHeading: p.heading, speed: velocity,
          velocity: { x: Math.sin(p.heading) * velocity, z: Math.cos(p.heading) * velocity },
          nextCheckpoint: Math.floor(progress / 81.25) + 1,
          lastCheckpoint: Math.floor(progress / 81.25) * 81.25,
        });
        v.previousPosition = { ...v.position };
      });
      g.renderer.reset(); g.clearTelemetry();
      const probe = { active: true, frames: 0, drifting: 0, boosting: 0,
        maximumSpeed: 0, closestOpponent: Infinity, rankChanges: 0, lastRank: 6 };
      window.__APEX_PROBE__ = probe;
      function sample() {
        if (!probe.active) return;
        const v = g.engine.player;
        probe.frames++; probe.drifting += Number(v.drifting); probe.boosting += Number(v.boosting);
        probe.maximumSpeed = Math.max(probe.maximumSpeed, v.speed * 3.6);
        const nearest = Math.min(...g.engine.state.vehicles.slice(1).map(o => Math.hypot(o.position.x - v.position.x, o.position.z - v.position.z)));
        probe.closestOpponent = Math.min(probe.closestOpponent, nearest);
        if (probe.lastRank !== g.engine.state.rank) { probe.rankChanges++; probe.lastRank = g.engine.state.rank; }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { distance, speed, closePack });
    await page.keyboard.down('w');
    if (name === 'harbor-nitro') {
      await page.keyboard.down('Shift'); await page.waitForTimeout(4400); await page.keyboard.up('Shift');
      await page.waitForTimeout(2200);
    } else if (name === 'downtown-overtaking') {
      await page.evaluate(() => { window.__NEON_APEX__.autopilot = true; });
      await page.waitForTimeout(7500);
    } else {
      await page.keyboard.down('Space');
      for (const key of ['d', 'a', 'd', 'a']) {
        await page.keyboard.down(key); await page.waitForTimeout(1500); await page.keyboard.up(key);
      }
      await page.keyboard.up('Space'); await page.waitForTimeout(1500);
    }
    await page.keyboard.up('w');
    const raw = await page.evaluate(() => {
      window.__APEX_PROBE__.active = false;
      const g = window.__NEON_APEX__;
      return { frameTimes: g.frameTimes, samples: g.telemetry,
        probe: window.__APEX_PROBE__, gpu: g.renderer.stats.gpu };
    });
    const frames = raw.frameTimes.filter(t => t > 0 && t < 1000).sort((a, b) => a - b);
    const result = { name, duration: frames.reduce((a, b) => a + b, 0) / 1000,
      averageFPS: 1000 * frames.length / frames.reduce((a, b) => a + b, 0),
      frameTimeP95: frames[Math.floor(frames.length * .95)],
      scaleRange: [Math.min(...raw.samples.map(s => s.scale)), Math.max(...raw.samples.map(s => s.scale))],
      ...raw.probe, gpu: raw.gpu };
    delete result.active; delete result.lastRank;
    scenarios.push(result);
    console.log(JSON.stringify(result));
    if (name === 'harbor-nitro') expect(result.boosting).toBeGreaterThan(60);
    if (name === 'downtown-overtaking') expect(result.closestOpponent).toBeLessThan(8);
    if (name === 'drift-smoke-and-contact') expect(result.drifting).toBeGreaterThan(60);
  }
  const report = { date: new Date().toISOString(), viewport: '1920x1080', quality: 'auto',
    productionSmoke: 'passed', productionSpeed: speed, fixtureScenarios: true, errors, scenarios };
  await writeFile('artifacts/scenarios-1080.json', JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
  console.log('Final production and GPU scenario verification passed.');
} finally { await browser.close(); }
