import { NextRequest, NextResponse } from 'next/server';
import { InvoiceProcessor } from '@/lib/pipeline/processor';
import { getInvoice } from '@/lib/db/invoices';
import { getCompanyConfigById } from '@/lib/db/config';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const invoice = await getInvoice(id);
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const company = await getCompanyConfigById(invoice.company_id);
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found' },
        { status: 400 }
      );
    }

    const processor = new InvoiceProcessor(invoice.company_id);
    await processor.retryInvoice(id);

    return NextResponse.json({
      success: true,
      message: 'Invoice retry initiated',
    });
  } catch (error) {
    console.error('Error in POST /api/invoices/[id]/retry:', error);
    return NextResponse.json(
      {
        error: 'Failed to retry invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
