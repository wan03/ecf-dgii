/**
 * E2E – Dashboard status filter
 *
 * Seeds invoices with different estados (pendiente, aceptado, error) and
 * verifies that the estado filter on the dashboard shows only matching rows.
 */
import { test, expect } from '@playwright/test';
import {
  isSupabaseConfigured,
  seedDefaultCompany,
  seedInvoicesWithStates,
  cleanDatabase,
} from '../support/test-db';

test.describe('Dashboard - status filter', () => {
  test.skip(
    !isSupabaseConfigured(),
    'Supabase env not configured; skipping DB-backed e2e'
  );

  test.beforeEach(async () => {
    await cleanDatabase();
    const { companyId } = await seedDefaultCompany();
    // Seed one invoice per filter-relevant state
    await seedInvoicesWithStates(companyId, ['pendiente', 'aceptado', 'error']);
  });

  test('shows all invoices with default (empty) filter', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('invoices-table')).toBeVisible();
    // Expect at least 3 rows
    const rows = page.getByTestId('invoice-row');
    await expect(rows).toHaveCount(3, { timeout: 10_000 });
  });

  test('filter by aceptado shows only accepted invoices', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('invoices-table')).toBeVisible();

    // Select filter
    await page.selectOption('[data-testid="estado-filter"]', 'aceptado');

    // Only the accepted invoice should be visible
    const rows = page.getByTestId('invoice-row');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });

    // The status badge should say 'aceptado'
    const badge = rows.first().getByTestId('status-badge');
    await expect(badge).toHaveAttribute('data-estado', 'aceptado');
  });

  test('filter by error shows only errored invoices', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('invoices-table')).toBeVisible();

    await page.selectOption('[data-testid="estado-filter"]', 'error');

    const rows = page.getByTestId('invoice-row');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });

    const badge = rows.first().getByTestId('status-badge');
    await expect(badge).toHaveAttribute('data-estado', 'error');
  });

  test('filter by pendiente shows only pending invoices', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('invoices-table')).toBeVisible();

    await page.selectOption('[data-testid="estado-filter"]', 'pendiente');

    const rows = page.getByTestId('invoice-row');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });
  });

  test('clearing filter shows all invoices again', async ({ page }) => {
    await page.goto('/');

    // Filter to narrow results
    await page.selectOption('[data-testid="estado-filter"]', 'aceptado');
    await expect(page.getByTestId('invoice-row')).toHaveCount(1, { timeout: 10_000 });

    // Clear filter
    await page.selectOption('[data-testid="estado-filter"]', '');
    await expect(page.getByTestId('invoice-row')).toHaveCount(3, { timeout: 10_000 });
  });

  test('stat card counts reflect current invoices', async ({ page }) => {
    await page.goto('/');

    // 1 aceptada, 1 pendiente (in proceso), 1 error
    await expect(page.getByTestId('stat-aceptadas')).toContainText('1', { timeout: 10_000 });
    await expect(page.getByTestId('stat-errores')).toContainText('1');
    await expect(page.getByTestId('stat-total')).toContainText('3');
  });
});
