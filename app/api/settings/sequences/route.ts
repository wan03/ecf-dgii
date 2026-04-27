import { NextRequest, NextResponse } from 'next/server';
import { getActiveSequences, upsertSequence, NCFSequence } from '@/lib/db/sequences';
import { getCompanyConfig } from '@/lib/db/config';

export async function GET(_request: NextRequest) {
  try {
    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found. Please configure company settings first.' },
        { status: 404 }
      );
    }

    const sequences = await getActiveSequences(company.id);
    return NextResponse.json(sequences);
  } catch (error) {
    console.error('Error in GET /api/settings/sequences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sequences' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      tipo_ecf,
      secuencia_inicial,
      secuencia_final,
      fecha_vencimiento,
      numero_autorizacion,
    } = body;

    // Validate required fields
    if (!tipo_ecf || !secuencia_inicial || !secuencia_final || !fecha_vencimiento) {
      return NextResponse.json(
        {
          error: 'Missing required fields: tipo_ecf, secuencia_inicial, secuencia_final, fecha_vencimiento',
        },
        { status: 400 }
      );
    }

    // Validate e-NCF format (e.g. E310000000001)
    const encfPattern = /^E\d{2}\d{10}$/;
    if (!encfPattern.test(secuencia_inicial) || !encfPattern.test(secuencia_final)) {
      return NextResponse.json(
        {
          error: 'Invalid e-NCF format. Expected format: E310000000001 (E + 2-digit type + 10-digit number)',
        },
        { status: 400 }
      );
    }

    // Validate that inicial <= final
    if (secuencia_inicial > secuencia_final) {
      return NextResponse.json(
        { error: 'secuencia_inicial must be less than or equal to secuencia_final' },
        { status: 400 }
      );
    }

    // Validate future expiry date
    const expiryDate = new Date(fecha_vencimiento);
    if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      return NextResponse.json(
        { error: 'fecha_vencimiento must be a valid future date' },
        { status: 400 }
      );
    }

    // Get company config for company_id
    const company = await getCompanyConfig();
    if (!company) {
      return NextResponse.json(
        { error: 'Company configuration not found. Please configure company settings first.' },
        { status: 404 }
      );
    }

    const sequenceData: Partial<NCFSequence> = {
      company_id: company.id,
      tipo_ecf: Number(tipo_ecf),
      secuencia_inicial,
      secuencia_actual: secuencia_inicial, // start from beginning
      secuencia_final,
      fecha_vencimiento,
      numero_autorizacion: numero_autorizacion || null,
      estado: 'activo',
    };

    await upsertSequence(sequenceData);

    // Return updated sequences list
    const sequences = await getActiveSequences(company.id);

    return NextResponse.json({
      success: true,
      message: 'Secuencia guardada exitosamente',
      sequences,
    });
  } catch (error) {
    console.error('Error in POST /api/settings/sequences:', error);
    return NextResponse.json(
      {
        error: 'Failed to save sequence',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
