import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Upload - invalid input', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test('reports error for invalid file', async ({ page }) => {
    await page.goto('/upload');
    const fixturePath = path.resolve(__dirname, '../fixtures/sample-invoice-invalid.xlsx');
    await page.setInputFiles('[data-testid="file-input"]', fixturePath);
    await expect(page.getByTestId('error-list')).toBeVisible({ timeout: 30_000 });
  });
});
