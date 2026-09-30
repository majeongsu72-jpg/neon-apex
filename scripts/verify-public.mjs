import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'https://majeongsu72-jpg.github.io/neon-apex/';
await mkdir('artifacts', { recursive: true });
const args = ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist'];
if (process.platform === 'win32') args.push('--use-angle=d3d11');
const browser = await chromium.launch({ headless: true, args });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [], failedRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() }); });
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  expect(response.status()).toBe(200);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'NEON APEX.' })).toBeVisible();
  const production = await page.evaluate(() => ({
    developmentHooksAbsent: typeof window.__NEON_APEX__ === 'undefined',
    fontLoaded: document.fonts.check('700 24px Rajdhani'),
    module: document.querySelector('script[type="module"]').getAttribute('src'),
  }));
  expect(production.developmentHooksAbsent).toBe(true);
  expect(production.fontLoaded).toBe(true);
  await page.screenshot({ path: 'artifacts/public-title-1080.png' });
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.waitForTimeout(4400);
  await page.keyboard.down('w'); await page.waitForTimeout(2300);
  const speed = Number(await page.locator('#speed').textContent());
  expect(speed).toBeGreaterThan(20);
  const readNitro = () => page.locator('#nitro-fill').evaluate(e =>
    e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width);
  const nitroBefore = await readNitro();
  await page.keyboard.down('Shift'); await page.waitForTimeout(650); await page.keyboard.up('Shift');
  const nitroAfter = await readNitro();
  expect(nitroAfter).toBeLessThan(nitroBefore);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight');
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: '계속 달리기' }).click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  await page.screenshot({ path: 'artifacts/public-race-1080.png' });
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
  const report = { date: new Date().toISOString(), url, status: 'passed', speed,
    nitroBefore, nitroAfter, ...production, errors, failedRequests };
  await writeFile('artifacts/public-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
