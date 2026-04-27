import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Upload - single invoice', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test('uploads a single-line invoice file', async ({ page }) => {
    await page.goto('/upload');
    const fixturePath = path.resolve(__dirname, '../fixtures/sample-invoice.xlsx');
    await page.setInputFiles('[data-testid="file-input"]', fixturePath);
    await expect(page.getByTestId('result-message')).toBeVisible({ timeout: 30_000 });
  });
});
