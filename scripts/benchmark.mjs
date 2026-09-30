import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const captureScreenshots = process.argv.includes('--screenshots');
const args = ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist'];
if (process.platform === 'win32') args.push('--use-angle=d3d11');
const browser = await chromium.launch({ headless: true, args });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.NEON_APEX_URL || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => !!window.__NEON_APEX__, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const gpu = await page.evaluate(() => window.__NEON_APEX__.renderer.stats.gpu);
  console.log('1920 × 1080 / AUTO / GPU:', gpu);
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.evaluate(() => { window.__NEON_APEX__.autopilot = true; window.__NEON_APEX__.clearTelemetry(); });
  const screenshotStages = new Set();
  for (let elapsed = 0; elapsed < 600; elapsed += 10) {
    await page.waitForTimeout(10000);
    const state = await page.evaluate(() => {
      const g = window.__NEON_APEX__, v = g.engine.player;
      return { ...g.renderer.stats, phase: g.engine.state.phase, time: g.engine.state.time,
        progress: v.progress, laps: v.completedLaps, speed: v.speed * 3.6, drifting: v.drifting };
    });
    if (elapsed % 30 === 0 || state.phase === 'finished') console.log(JSON.stringify(state));
    const distance = ((state.progress % 2600) + 2600) % 2600;
    const stage = distance < 470 ? 'downtown' : distance < 770 ? 'tunnel' : distance < 1326 ? 'harbor' : 'switchback';
    if (captureScreenshots && state.phase === 'racing' && !screenshotStages.has(stage)) {
      screenshotStages.add(stage); await page.screenshot({ path: `artifacts/benchmark-${stage}-1080.png` });
    }
    if (state.phase === 'finished') break;
  }
  const raw = await page.evaluate(() => {
    const g = window.__NEON_APEX__;
    return { frameTimes: g.frameTimes, samples: g.telemetry, finishTime: g.engine.player.finishTime,
      lapTimes: g.engine.player.lapTimes, completedLaps: g.engine.player.completedLaps, rank: g.engine.state.rank,
      gpu: g.renderer.stats.gpu };
  });
  const frames = raw.frameTimes.filter(t => t > 0 && t < 1000).sort((a, b) => a - b);
  const percentile = p => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))];
  const racing = raw.samples.filter(s => s.phase === 'racing' && s.time > 5);
  const report = {
    date: new Date().toISOString(), viewport: '1920x1080', quality: 'auto', gpu, simulationRate: 1, captureScreenshots,
    averageFPS: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
    frameTimeP50: percentile(.5), frameTimeP95: percentile(.95), frameTimeP99: percentile(.99),
    steadyFPS: racing.reduce((sum, s) => sum + s.fps, 0) / racing.length,
    minimumSampleFPS: Math.min(...racing.map(s => s.fps)),
    scaleRange: [Math.min(...racing.map(s => s.scale)), Math.max(...racing.map(s => s.scale))],
    drawCallsRange: [Math.min(...racing.map(s => s.draws)), Math.max(...racing.map(s => s.draws))],
    completedLaps: raw.completedLaps, raceTime: raw.finishTime, lapTimes: raw.lapTimes, rank: raw.rank,
    errors, samples: raw.samples,
  };
  await writeFile('artifacts/performance-1080.json', JSON.stringify(report, null, 2));
  const { samples, ...summary } = report;
  console.log('BENCHMARK COMPLETE:', JSON.stringify(summary, null, 2));
  if (report.completedLaps !== 3 || errors.length) process.exitCode = 1;
} finally { await browser.close(); }
