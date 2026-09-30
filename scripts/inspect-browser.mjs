import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true,
  args: ['--enable-webgl', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE:', msg.text()); });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => !!window.__NEON_APEX__, { timeout: 30000 });
  await page.waitForTimeout(6000);
  console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__NEON_APEX__.renderer.stats,
    phase: window.__NEON_APEX__.engine.state.phase, loaded: document.querySelector('#loading').classList.contains('hidden') })), null, 2));
  await page.screenshot({ path: 'artifacts/native-title-1366.png' });
} finally { await browser.close(); }
