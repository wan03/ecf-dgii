import { NextRequest, NextResponse } from 'next/server';
import { getCompanyConfig, upsertCompanyConfig } from '@/lib/db/config';

export async function GET(_request: NextRequest) {
  try {
    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found' },
        { status: 404 }
      );
    }

    // Don't return sensitive data
    const safeCompany = { ...company };
    delete (safeCompany as Record<string, unknown>).certificado_password_encrypted;

    return NextResponse.json(safeCompany);
  } catch (error) {
    console.error('Error in GET /api/settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Don't allow updating sensitive fields via API
    const safeUpdate = { ...body };
    delete safeUpdate.certificado_password_encrypted;

    await upsertCompanyConfig(safeUpdate);

    const updated = await getCompanyConfig();
    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to retrieve updated configuration' },
        { status: 500 }
      );
    }

    // Don't return sensitive data
    const safeResult = { ...updated };
    delete (safeResult as Record<string, unknown>).certificado_password_encrypted;

    return NextResponse.json(safeResult);
  } catch (error) {
    console.error('Error in POST /api/settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// PUT is same as POST
export async function PUT(request: NextRequest) {
  return POST(request);
}
