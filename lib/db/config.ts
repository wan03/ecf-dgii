import { supabaseAdminClient } from './client';

export interface CompanyConfig {
  id: string;
  rnc: string;
  razon_social: string;
  nombre_comercial?: string;
  direccion: string;
  telefono?: string;
  email?: string;
  certificado_path?: string;
  certificado_password_encrypted?: string;
  tipo_ingresos: string;
  created_at: string;
  updated_at: string;
}

export async function getCompanyConfig(rnc?: string): Promise<CompanyConfig | null> {
  try {
    let query = supabaseAdminClient.from('company_config').select('*');

    if (rnc) {
      query = query.eq('rnc', rnc);
    }

    const { data, error } = await query.limit(1).single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found
        return null;
      }
      throw error;
    }

    return data as CompanyConfig;
  } catch (error) {
    console.error('Error fetching company config:', error);
    throw error;
  }
}

export async function upsertCompanyConfig(config: Partial<CompanyConfig>): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.from('company_config').upsert(
      {
        ...config,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'rnc',
      }
    );

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error upserting company config:', error);
    throw error;
  }
}

export async function getCompanyConfigById(id: string): Promise<CompanyConfig | null> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('company_config')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as CompanyConfig;
  } catch (error) {
    console.error('Error fetching company config by id:', error);
    throw error;
  }
}
