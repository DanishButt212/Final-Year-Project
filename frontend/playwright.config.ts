import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. They start their own API (port 4100) against the *_test database and their own Vite
 * server (port 5174), so a running development stack is never touched. global-setup.ts empties the test database
 * and loads the demo data with a random one-run password (never written to disk or printed).
 */
const API_PORT = 4100;
const WEB_PORT = 5174;
const uploads = join(tmpdir(), 'digitaladaalat-ui-uploads');

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/artifacts/results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/artifacts/results.json' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // Google Chrome (Chromium) from the machine; the bundled Chromium download is blocked on this network.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Karachi',
    locale: 'en-GB',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build && node dist/main',
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        UPLOAD_DIR: uploads,
        TZ: 'Asia/Karachi',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
