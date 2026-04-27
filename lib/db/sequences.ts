import { supabaseAdminClient } from './client';

export interface NCFSequence {
  id: string;
  company_id: string;
  tipo_ecf: number;
  secuencia_inicial: string;
  secuencia_actual: string;
  secuencia_final: string;
  fecha_vencimiento: string;
  numero_autorizacion?: string;
  estado: string;
  created_at: string;
  updated_at: string;
}

export async function assignNextENCF(
  companyId: string,
  tipoECF: number = 31
): Promise<string> {
  try {
    const { data, error } = await supabaseAdminClient.rpc('assign_next_encf', {
      p_company_id: companyId,
      p_tipo_ecf: tipoECF,
    });

    if (error) {
      throw error;
    }

    return data as string;
  } catch (error) {
    console.error('Error assigning next ENCF:', error);
    throw error;
  }
}

export async function getActiveSequences(companyId?: string): Promise<NCFSequence[]> {
  try {
    let query = supabaseAdminClient
      .from('ncf_sequences')
      .select('*')
      .eq('estado', 'activo');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data as NCFSequence[]) || [];
  } catch (error) {
    console.error('Error fetching active sequences:', error);
    throw error;
  }
}

export async function upsertSequence(seq: Partial<NCFSequence>): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.from('ncf_sequences').upsert(
      {
        ...seq,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'company_id,tipo_ecf',
      }
    );

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error upserting sequence:', error);
    throw error;
  }
}

export interface SequenceAlert {
  nearExpiry: NCFSequence[];
  nearlyExhausted: NCFSequence[];
}

export async function checkSequenceAlerts(): Promise<SequenceAlert> {
  try {
    const { data, error } = await supabaseAdminClient.rpc('check_sequence_alerts');

    if (error) {
      throw error;
    }

    const alerts: SequenceAlert = {
      nearExpiry: [],
      nearlyExhausted: [],
    };

    if (!data || data.length === 0) {
      return alerts;
    }

    interface AlertRow { sequence_id: string; alert_type: string; }

    // Fetch the full sequence details for each alert
    const sequenceIds = (data as AlertRow[]).map((alert) => alert.sequence_id);

    const { data: sequences, error: seqError } = await supabaseAdminClient
      .from('ncf_sequences')
      .select('*')
      .in('id', sequenceIds);

    if (seqError) {
      throw seqError;
    }

    const sequenceMap = new Map<string, NCFSequence>();
    (sequences as NCFSequence[]).forEach((seq) => {
      sequenceMap.set(seq.id, seq);
    });

    (data as AlertRow[]).forEach((alert) => {
      const sequence = sequenceMap.get(alert.sequence_id);
      if (sequence) {
        if (alert.alert_type === 'near_expiry') {
          alerts.nearExpiry.push(sequence);
        } else if (alert.alert_type === 'nearly_exhausted') {
          alerts.nearlyExhausted.push(sequence);
        }
      }
    });

    return alerts;
  } catch (error) {
    console.error('Error checking sequence alerts:', error);
    throw error;
  }
}

/**
 * Fetch the active sequence row for a given company + tipo_ecf,
 * including its fecha_vencimiento. Returns null if not found.
 */
export async function getActiveSequenceWithExpiry(
  companyId: string,
  tipoECF: number = 31
): Promise<NCFSequence | null> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('ncf_sequences')
      .select('*')
      .eq('company_id', companyId)
      .eq('tipo_ecf', tipoECF)
      .eq('estado', 'activo')
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return (data as NCFSequence) || null;
  } catch (error) {
    console.error('Error fetching active sequence with expiry:', error);
    throw error;
  }
}

export async function getSequenceByCompanyAndType(
  companyId: string,
  tipoECF: number = 31
): Promise<NCFSequence | null> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('ncf_sequences')
      .select('*')
      .eq('company_id', companyId)
      .eq('tipo_ecf', tipoECF)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as NCFSequence;
  } catch (error) {
    console.error('Error fetching sequence:', error);
    throw error;
  }
}
