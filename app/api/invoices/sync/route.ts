import { NextRequest, NextResponse } from 'next/server';
import { InvoiceProcessor } from '@/lib/pipeline/processor';
import { getCompanyConfig } from '@/lib/db/config';
import type { EmailConfig } from '@/lib/email/notifier';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildEmailConfigFromEnv(): EmailConfig | undefined {
  const host = process.env.SMTP_HOST;
  if (!host) return undefined;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  return {
    host,
    port,
    secure:
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : port === 465,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com',
    to: process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER || '',
  };
}

/**
 * Pull posted sales invoices from the Ynovi Odoo API for a date range and run them
 * through the same e-CF pipeline as an uploaded file.
 *
 * Body: { "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { dateFrom?: string; dateTo?: string };
    const { dateFrom, dateTo } = body;

    if (!dateFrom || !dateTo || !ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) {
      return NextResponse.json(
        { error: 'Se requieren dateFrom y dateTo en formato YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (dateFrom > dateTo) {
      return NextResponse.json(
        { error: 'dateFrom no puede ser posterior a dateTo' },
        { status: 400 }
      );
    }

    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found' },
        { status: 400 }
      );
    }

    const processor = new InvoiceProcessor(company.id, buildEmailConfigFromEnv());
    const result = await processor.processFromApi(dateFrom, dateTo);

    if (result.processed === 0 && result.errors.length > 0) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error in POST /api/invoices/sync:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync invoices',
        processed: 0,
        errors: [
          {
            invoiceNumber: 'SYNC_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            step: 'sync',
          },
        ],
      },
      { status: 500 }
    );
  }
}
