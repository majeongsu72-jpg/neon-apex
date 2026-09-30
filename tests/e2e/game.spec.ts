import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
});

test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test('renders the title, the track, and the original car at three desktop sizes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'NEON APEX.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '레이스 시작' })).toBeVisible();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/title-${viewport.width}.png` });
  }
  expect(errors).toEqual([]);
});

test('drives, drifts, boosts, pauses, recovers and restarts', async ({ page }) => {
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__?.audioState === 'running');
  await expect(page.getByRole('heading', { name: '당신의 라인으로 밤을 지배하세요.' })).toBeVisible();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#position')).toHaveText('6');
  await page.waitForFunction(() => window.__NEON_APEX__?.engine.state.phase === 'racing');
  await page.keyboard.down('w');
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.player.speed)).toBeGreaterThan(10);
  await page.keyboard.down('Shift');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.player.nitro)).toBeLessThan(.95);
  await page.keyboard.up('Shift');
  await page.keyboard.down('Space'); await page.keyboard.down('d');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.player.drifting)).toBe(true);
  await page.keyboard.up('d'); await page.keyboard.up('Space'); await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.waitForFunction(() => window.__NEON_APEX__?.audioState === 'suspended');
  const time = await page.evaluate(() => window.__NEON_APEX__!.engine.state.time);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.state.time)).toBe(time);
  await page.getByRole('button', { name: '계속 달리기' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__?.audioState === 'running');
  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.player.speed)).toBeLessThan(1);
  await page.screenshot({ path: 'artifacts/race-1366.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '처음부터 다시' }).click();
  await expect(page.locator('#countdown')).toBeVisible();
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.state.time)).toBe(0);
});

test('steers left and right with arrow keys and A/D in normal driving and drifting', async ({ page }) => {
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__?.engine.state.phase === 'racing');
  const keys = [
    { key: 'ArrowLeft', side: -1 }, { key: 'ArrowRight', side: 1 },
    { key: 'a', side: -1 }, { key: 'd', side: 1 },
  ];
  for (const drift of [false, true]) for (const { key, side } of keys) {
    const initial = await page.evaluate(() => {
      const g = window.__NEON_APEX__!;
      g.engine.reset('racing');
      g.engine.state.vehicles.forEach(v => {
        const progress = 70 + v.id * 80, p = g.engine.track.sample(progress);
        Object.assign(v, { progress, previousProgress: progress, trackIndex: p.index,
          position: { x: p.x, z: p.z }, previousPosition: { x: p.x, z: p.z },
          heading: p.heading, previousHeading: p.heading, speed: 35,
          velocity: { x: p.tx * 35, z: p.tz * 35 },
          nextCheckpoint: Math.floor(progress / 81.25) + 1,
          lastCheckpoint: Math.floor(progress / 81.25) * 81.25,
        });
      });
      g.renderer.reset();
      const v = g.engine.player;
      // A rear chase camera's screen-right axis is forward cross world-up.
      return { x: v.position.x, z: v.position.z, heading: v.heading,
        rightX: -Math.cos(v.heading), rightZ: Math.sin(v.heading) };
    });
    await page.keyboard.down('w');
    if (drift) await page.keyboard.down('Space');
    await page.keyboard.down(key);
    await page.waitForTimeout(600);
    const moved = await page.evaluate(start => {
      const v = window.__NEON_APEX__!.engine.player;
      return { side: (v.position.x - start.x) * start.rightX + (v.position.z - start.z) * start.rightZ,
        yaw: Math.atan2(Math.sin(v.heading - start.heading), Math.cos(v.heading - start.heading)),
        drifting: v.drifting };
    }, initial);
    await page.keyboard.up(key);
    if (drift) await page.keyboard.up('Space');
    await page.keyboard.up('w');
    expect(moved.side * side, `${key}, drift=${drift}: movement must follow the key`).toBeGreaterThan(.4);
    expect(moved.yaw * -side, `${key}, drift=${drift}: chassis must point into the turn`).toBeGreaterThan(.1);
    expect(moved.drifting).toBe(drift);
  }
});

test('persists audio, graphics and motion preferences across a reload', async ({ page }) => {
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  await page.getByLabel('그래픽 품질').selectOption('low');
  await page.getByLabel('음악 음량').fill('57');
  await page.getByLabel('화면 흔들림과 속도 효과', { exact: true }).uncheck();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  await expect(page.getByLabel('그래픽 품질')).toHaveValue('low');
  await expect(page.getByLabel('음악 음량')).toHaveValue('57');
  await expect(page.getByLabel('화면 흔들림과 속도 효과', { exact: true })).not.toBeChecked();
});

test('closes a focused settings select with Escape and resumes a paused race', async ({ page }) => {
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__?.engine.state.phase === 'racing');
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  await expect(page.locator('#settings-screen')).toBeVisible();
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.state.phase)).toBe('paused');
  await page.getByLabel('그래픽 품질').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-screen')).toBeHidden();
  await page.waitForFunction(() => window.__NEON_APEX__?.engine.state.phase === 'racing');
});

test('starts the race with focused buttons and the Space key', async ({ page }) => {
  await page.getByRole('button', { name: '레이스 시작' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#briefing-screen')).toBeVisible();
  await page.getByRole('button', { name: '준비 완료' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#countdown')).toBeVisible();
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.state.phase)).toBe('countdown');
});

test('pauses on lost focus and clears held throttle before resuming', async ({ page }) => {
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.waitForFunction(() => window.__NEON_APEX__?.engine.state.phase === 'racing');
  await page.keyboard.down('w'); await page.waitForTimeout(700);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause-screen')).toBeVisible();
  const time = await page.evaluate(() => window.__NEON_APEX__!.engine.state.time);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.state.time)).toBe(time);
  await page.getByRole('button', { name: '계속 달리기' }).click();
  const speed = await page.evaluate(() => window.__NEON_APEX__!.engine.player.speed);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__NEON_APEX__!.engine.player.speed)).toBeLessThan(speed);
  await page.keyboard.up('w');
});

test('completes all three laps in the browser and stores the genuine result', async ({ page }) => {
  test.setTimeout(120000);
  await page.getByRole('button', { name: '레이스 시작' }).click();
  await page.getByRole('button', { name: '준비 완료' }).click();
  await page.evaluate(() => { window.__NEON_APEX__!.autopilot = true; window.__NEON_APEX__!.simulationRate = 12; });
  await page.waitForFunction(() => window.__NEON_APEX__!.engine.state.phase === 'finished', { timeout: 100000 });
  await expect(page.locator('#result-screen')).toBeVisible();
  const result = await page.evaluate(() => {
    const p = window.__NEON_APEX__!.engine.player;
    return { laps: p.completedLaps, times: p.lapTimes, total: p.finishTime, saved: JSON.parse(localStorage.getItem('neon-apex.v1')!) };
  });
  expect(result.laps).toBe(3); expect(result.times).toHaveLength(3);
  expect(result.saved.bestRace).toBe(result.total);
  await page.screenshot({ path: 'artifacts/result-1366.png' });
  await page.getByRole('button', { name: '메인 화면', exact: true }).last().click();
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#home-best')).not.toHaveText('—:——.——');
});
