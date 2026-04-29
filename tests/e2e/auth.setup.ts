/**
 * Playwright auth setup — runs once before all tests.
 *
 * Logs in as the E2E test user, waits for the dashboard, then persists
 * the browser storage state (cookies + localStorage) to a JSON file.
 * All test projects load that file so they start as an authenticated user.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.local'
    );
  }

  await page.goto('/login');

  // Fill in the login form
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByTestId('login-submit').click();

  // Wait until we are redirected to the dashboard — confirms login succeeded.
  await page.waitForURL('/', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

  // Persist cookies and localStorage so all tests start authenticated.
  await page.context().storageState({ path: AUTH_FILE });
});
