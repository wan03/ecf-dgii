import { NextRequest, NextResponse } from 'next/server';
import { InvoiceProcessor } from '@/lib/pipeline/processor';
import { getCompanyConfig } from '@/lib/db/config';
import type { EmailConfig } from '@/lib/email/notifier';

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get company config (assuming default/first company)
    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;

    const emailConfig = buildEmailConfigFromEnv();
    const processor = new InvoiceProcessor(company.id, emailConfig);
    const result = await processor.processFromFile(buffer, filename);

    // Return appropriate status code
    if (result.processed === 0 && result.errors.length > 0) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error in POST /api/invoices/upload:', error);
    return NextResponse.json(
      {
        error: 'Failed to process file',
        processed: 0,
        errors: [
          {
            invoiceNumber: 'UPLOAD_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            step: 'upload',
          },
        ],
      },
      { status: 500 }
    );
  }
}
