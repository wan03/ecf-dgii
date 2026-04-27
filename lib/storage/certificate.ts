import { supabaseAdminClient } from '../db/client';

const BUCKET_NAME = 'certificates';

/**
 * Upload certificate file to Supabase storage
 */
export async function uploadCertificate(buffer: Buffer, filename: string): Promise<string> {
  try {
    // Ensure bucket exists and filename is safe
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `${timestamp}_${safeName}`;

    const { error } = await supabaseAdminClient.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: 'application/pkcs12',
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return storagePath;
  } catch (error) {
    console.error('Error uploading certificate:', error);
    throw error;
  }
}

/**
 * Download certificate file from Supabase storage
 */
export async function getCertificate(storagePath: string): Promise<Buffer> {
  try {
    const { data, error } = await supabaseAdminClient.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error) {
      throw error;
    }

    // Convert blob to buffer
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.error('Error downloading certificate:', error);
    throw error;
  }
}

/**
 * Delete certificate file from storage
 */
export async function deleteCertificate(storagePath: string): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error deleting certificate:', error);
    throw error;
  }
}

/**
 * List all certificates for a company
 */
export async function listCertificates(
  prefix?: string
): Promise<Array<{ name: string; updated_at: string; metadata: unknown }>> {
  try {
    const { data, error } = await supabaseAdminClient.storage.from(BUCKET_NAME).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'updated_at', order: 'desc' },
    });

    if (error) {
      throw error;
    }

    return (data || []).map((f) => ({
      name: f.name,
      updated_at: f.updated_at ?? '',
      metadata: f.metadata,
    }));
  } catch (error) {
    console.error('Error listing certificates:', error);
    throw error;
  }
}
