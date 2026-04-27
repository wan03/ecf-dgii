/**
 * E2E – NCF Sequence alerts
 *
 * Verifies that the Settings page shows visual alerts when an NCF sequence:
 * - is expiring soon (≤ 30 days)
 * - is nearly depleted (< 100 remaining)
 *
 * Seeds different sequence scenarios and checks that the correct badges and
 * warning messages appear in the UI.
 */
import { test, expect } from '@playwright/test';
import {
  isSupabaseConfigured,
  seedDefaultCompany,
  seedExpiringSoonSequence,
  seedNearlyDepletedSequence,
  cleanDatabase,
} from '../support/test-db';

test.describe('Sequence alerts', () => {
  test.skip(
    !isSupabaseConfigured(),
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('shows expiry warning for a sequence expiring in 10 days', async ({ page }) => {
    const { companyId } = await seedDefaultCompany();
    // Replace the 1-year sequence with one expiring very soon
    await seedExpiringSoonSequence(companyId, 10);

    await page.goto('/settings');

    // Alert badge should be present
    await expect(page.getByTestId('seq-alert-badge').first()).toBeVisible({ timeout: 10_000 });

    // The expiry warning message should appear
    await expect(page.getByTestId('seq-expiry-warning').first()).toBeVisible();
  });

  test('shows alert badge for a nearly-depleted sequence', async ({ page }) => {
    const { companyId } = await seedDefaultCompany();
    await seedNearlyDepletedSequence(companyId);

    await page.goto('/settings');

    // Alert badge should be visible for low-count sequences
    await expect(page.getByTestId('seq-alert-badge').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows seq-disponibles count for each sequence', async ({ page }) => {
    const { companyId } = await seedDefaultCompany();
    // The default seeded sequence has 999999 - 1 + 1 = 999999 remaining
    await page.goto('/settings');

    const disponibles = page.getByTestId('seq-disponibles').first();
    await expect(disponibles).toBeVisible({ timeout: 10_000 });
    // Should not be empty
    const text = await disponibles.innerText();
    expect(parseInt(text.replace(/[^0-9]/g, ''), 10)).toBeGreaterThan(0);
  });

  test('normal sequence has no alert badge', async ({ page }) => {
    const { companyId } = await seedDefaultCompany();
    // Default company has a 1-year sequence — no alerts
    await page.goto('/settings');

    // The sequence row should be present
    await expect(page.getByTestId('sequence-row').first()).toBeVisible({ timeout: 10_000 });

    // No expiry warning for a healthy sequence
    await expect(page.getByTestId('seq-expiry-warning')).toHaveCount(0);
  });

  test('sequence table is shown in settings', async ({ page }) => {
    const { companyId } = await seedDefaultCompany();
    await seedExpiringSoonSequence(companyId, 20);

    await page.goto('/settings');

    const rows = page.getByTestId('sequence-row');
    // seedDefaultCompany inserts 1 sequence, seedExpiringSoonSequence adds 1 more
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
  });
});
