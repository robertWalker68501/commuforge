import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) {
  throw new Error('DATABASE_URL is missing. Configure your local .env before running E2E tests.');
}

const parsed = new URL(developmentUrl);
if (parsed.pathname !== '/commuforge_dev' || parsed.hostname !== '127.0.0.1' || parsed.port !== '5434') {
  throw new Error('E2E safety check failed: expected local commuforge_dev on 127.0.0.1:5434.');
}
parsed.pathname = '/commuforge_test';
const testDatabaseUrl = parsed.toString();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/sign-in',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
      COMMUFORGE_E2E: '1',
    },
  },
});
