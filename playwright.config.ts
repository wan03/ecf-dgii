import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local so Playwright's global-setup, auth-setup, and test processes
// receive the same env vars (Supabase credentials, E2E auth creds, etc.)
loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    // 1. Auth setup — logs in once and saves the session to .auth/user.json.
    //    Must run before any test that needs authentication.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // 2. All application tests — start with the saved auth session.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
