/**
 * E2E – Retry flow
 *
 * Seeds an invoice in `firmado` state (signed XML ready to send) and a test
 * certificate, then exercises the "↻ Reintentar" button on the detail page.
 * The fake DGII server (started in global-setup) accepts the submission and
 * returns a trackId → invoice should move to `enviado`.
 */
import { test, expect } from '@playwright/test';
import {
  isSupabaseConfigured,
  seedDefaultCompany,
  seedTestCertificate,
  seedInvoice,
  cleanDatabase,
} from '../support/test-db';

// Minimal signed-looking XML — enough for the fake DGII to accept
const FAKE_SIGNED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECF><Encabezado><Version>1.0</Version></Encabezado><Signature/></ECF>`;

test.describe('Retry flow', () => {
  test.skip(
    !isSupabaseConfigured(),
    'Supabase env not configured; skipping DB-backed e2e'
  );

  let invoiceId: string;

  test.beforeEach(async () => {
    await cleanDatabase();
    const { companyId } = await seedDefaultCompany();
    // Upload the test certificate so the pipeline can sign/send
    await seedTestCertificate(companyId);
    // Seed an invoice already in `firmado` state (has signed XML, no trackId yet)
    invoiceId = await seedInvoice(companyId, {
      estado: 'firmado',
      encf: 'E310000000001',
      xml_firmado: FAKE_SIGNED_XML,
      intentos_envio: 1,
    });
  });

  test('retry button is visible for a firmado invoice', async ({ page }) => {
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByTestId('retry-btn')).toBeVisible({ timeout: 10_000 });
  });

  test('clicking retry sends invoice to DGII and moves it to enviado', async ({ page }) => {
    await page.goto(`/invoices/${invoiceId}`);

    const retryBtn = page.getByTestId('retry-btn');
    await expect(retryBtn).toBeVisible({ timeout: 10_000 });

    // Start listening for the retry response BEFORE clicking so we don't miss it.
    const retryResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/retry') && resp.request().method() === 'POST',
      { timeout: 20_000 }
    );

    await retryBtn.click();

    // Wait for the retry API call to finish before polling.
    // Without this, page.reload() cancels the in-flight fetch, preventing the
    // server from completing the state transition to 'enviado'.
    const retryResponse = await retryResponsePromise;

    // Assert the retry API responded successfully so we get a clear failure message
    // if the server-side pipeline errored (cert missing, DGII unreachable, etc.)
    const retryStatus = retryResponse.status();
    const retryBody = await retryResponse.text();
    expect(retryStatus, `Retry API failed (${retryStatus}): ${retryBody}`).toBe(200);

    // The handleRetry() in the page already calls fetchInvoice() after the API
    // response, so the badge should be updated on the current page.  We still
    // reload a couple of times in case of any React state lag.
    await expect(async () => {
      await page.reload();
      const estado = await page.getByTestId('status-badge').getAttribute('data-estado');
      expect(['enviado', 'aceptado']).toContain(estado);
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000] });
  });

  test('audit log is populated after retry', async ({ page }) => {
    await page.goto(`/invoices/${invoiceId}`);

    const retryBtn = page.getByTestId('retry-btn');
    await expect(retryBtn).toBeVisible({ timeout: 10_000 });

    // Same timing fix: wait for the retry response before reloading.
    const retryResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/retry') && resp.request().method() === 'POST',
      { timeout: 20_000 }
    );

    await retryBtn.click();
    await retryResponsePromise;

    // Reload to get fresh audit log from the server.
    await page.reload();
    await expect(page.getByTestId('audit-log')).toBeVisible({ timeout: 10_000 });
    // At least one audit entry should be present
    await expect(page.getByTestId('audit-entry').first()).toBeVisible();
  });
});
