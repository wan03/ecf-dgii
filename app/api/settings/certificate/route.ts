import { NextRequest, NextResponse } from 'next/server';
import { uploadCertificate, deleteCertificate } from '@/lib/storage/certificate';
import { getCompanyConfig, upsertCompanyConfig } from '@/lib/db/config';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('certificate') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No certificate file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.p12') && !filename.endsWith('.pfx')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .p12 or .pfx certificates are accepted.' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get current config to delete old certificate if exists
    const currentConfig = await getCompanyConfig();
    if (currentConfig?.certificado_path) {
      try {
        await deleteCertificate(currentConfig.certificado_path);
      } catch (deleteError) {
        // Log but don't fail — old cert may have been manually deleted
        console.warn('Could not delete old certificate:', deleteError);
      }
    }

    // Upload new certificate
    const storagePath = await uploadCertificate(buffer, file.name);

    // Update company config with new path
    await upsertCompanyConfig({ certificado_path: storagePath });

    return NextResponse.json({
      success: true,
      certificado_path: storagePath,
      message: 'Certificado subido exitosamente',
    });
  } catch (error) {
    console.error('Error in POST /api/settings/certificate:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload certificate',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const currentConfig = await getCompanyConfig();

    if (!currentConfig?.certificado_path) {
      return NextResponse.json(
        { error: 'No certificate to delete' },
        { status: 404 }
      );
    }

    await deleteCertificate(currentConfig.certificado_path);
    await upsertCompanyConfig({ certificado_path: undefined });

    return NextResponse.json({
      success: true,
      message: 'Certificado eliminado exitosamente',
    });
  } catch (error) {
    console.error('Error in DELETE /api/settings/certificate:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete certificate',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
