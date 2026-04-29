import { NextRequest, NextResponse } from 'next/server';
import { listInvoices, ListInvoicesFilters } from '@/lib/db/invoices';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: ListInvoicesFilters = {};

    const estado = searchParams.get('estado');
    if (estado) {
      filters.estado = estado;
    }

    const from = searchParams.get('from');
    if (from) {
      filters.from = from;
    }

    const to = searchParams.get('to');
    if (to) {
      filters.to = to;
    }

    const invoices = await listInvoices(filters);

    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error in GET /api/invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
