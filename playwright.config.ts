import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174', viewport: { width: 1366, height: 768 },
    headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-webgl', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npm run dev -- --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
