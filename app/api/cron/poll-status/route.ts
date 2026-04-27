import { NextRequest, NextResponse } from 'next/server';
import { InvoiceProcessor } from '@/lib/pipeline/processor';
import { getPendingPollingInvoices } from '@/lib/db/invoices';
import { checkSequenceAlerts } from '@/lib/db/sequences';
import { getCompanyConfig } from '@/lib/db/config';
import { EmailNotifier } from '@/lib/email/notifier';

export async function GET(request: NextRequest) {
  try {
    // Verify authorization header
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.DGII_CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get company config for email notifier
    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found' },
        { status: 400 }
      );
    }

    let emailNotifier: EmailNotifier | undefined;
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    ) {
      emailNotifier = new EmailNotifier({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        from: process.env.SMTP_FROM || 'noreply@ecf.local',
        to: process.env.NOTIFICATION_EMAIL || company.email || '',
      });
    }

    // Poll pending invoices
    const pendingInvoices = await getPendingPollingInvoices();
    const processor = new InvoiceProcessor(company.id);

    let polled = 0;
    for (const invoice of pendingInvoices) {
      try {
        await processor.pollInvoiceStatus(invoice.id);
        polled++;
      } catch (error) {
        console.error(`Error polling invoice ${invoice.id}:`, error);
      }
    }

    // Check for sequence alerts
    try {
      const alerts = await checkSequenceAlerts();

      if (emailNotifier && (alerts.nearExpiry.length > 0 || alerts.nearlyExhausted.length > 0)) {
        const allSequences = [...alerts.nearExpiry, ...alerts.nearlyExhausted];
        await emailNotifier.sendSequenceAlert(allSequences);
      }
    } catch (error) {
      console.error('Error checking sequence alerts:', error);
    }

    return NextResponse.json({
      success: true,
      polled,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in GET /api/cron/poll-status:', error);
    return NextResponse.json(
      {
        error: 'Failed to poll status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
