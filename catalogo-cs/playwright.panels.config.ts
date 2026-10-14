import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Servidores exclusivos de esta suite: nunca reutilizar una API real.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['panels-readonly.spec.ts', 'pwa-mobile.spec.ts'],
  workers: 1,
  timeout: 90_000,
  outputDir: path.join(tmpdir(), 'newrvcs-panels-readonly-results'),
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3111',
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/fixtures/panel-readonly-api.mjs',
      url: 'http://127.0.0.1:4311/health',
      reuseExistingServer: false,
    },
    {
      command: process.env.PANELS_STANDALONE === '1'
        ? 'node .next/standalone/catalogo-cs/server.js'
        : 'corepack pnpm exec next dev --hostname 127.0.0.1 --port 3111',
      url: 'http://127.0.0.1:3111/offline',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: '3111',
        HOSTNAME: '127.0.0.1',
        BACKEND_API_URL: 'http://127.0.0.1:4311',
        API_URL: 'http://127.0.0.1:4311',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4311',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3111',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
