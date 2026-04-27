import { test, expect } from '@playwright/test';

test.describe('Settings - Company config and certificate', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test('user can save the company config', async ({ page }) => {
    await page.goto('/settings');
    await page.fill('input[placeholder="101234567"]', '101234567');
    await page.getByRole('button', { name: /guardar configuración/i }).click();
    await expect(page.getByTestId('success-message')).toBeVisible();
  });

  test('settings page shows certificate input', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('cert-input')).toBeVisible();
  });
});
