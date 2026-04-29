import { NextRequest, NextResponse } from 'next/server';
import { getInvoice } from '@/lib/db/invoices';
import { getInvoiceAuditLog } from '@/lib/db/audit';
import { getInvoiceLines } from '@/lib/db/invoiceLines';

// Always fetch fresh data — disable Next.js Data Cache for all fetch() calls
// (including internal Supabase HTTP requests) within this route handler.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
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

    const [auditLog, lines] = await Promise.all([
      getInvoiceAuditLog(id),
      getInvoiceLines(id).catch((err) => {
        console.warn('Could not load invoice lines:', String(err));
        return [];
      }),
    ]);

    return NextResponse.json(
      { invoice, lines, auditLog },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    console.error('Error in GET /api/invoices/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}
