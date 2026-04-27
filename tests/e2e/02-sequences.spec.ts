import { test, expect } from '@playwright/test';

test.describe('NCF sequences', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test('sequences table is shown', async ({ page }) => {
    await page.goto('/settings');
    // After seed there should be at least one row
    const seq = page.getByTestId('sequence-row');
    await expect(seq.first()).toBeVisible();
  });
});
