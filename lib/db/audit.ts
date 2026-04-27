import { supabaseAdminClient } from './client';

export interface AuditEntry {
  invoice_id: string;
  action: string;
  estado_anterior?: string;
  estado_nuevo?: string;
  detalles?: Record<string, unknown>;
  usuario?: string;
  ip_address?: string;
}

export interface AuditLog {
  id: string;
  invoice_id: string;
  action: string;
  estado_anterior?: string;
  estado_nuevo?: string;
  detalles?: Record<string, unknown>;
  usuario?: string;
  ip_address?: string;
  created_at: string;
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabaseAdminClient.from('audit_log').insert({
      invoice_id: entry.invoice_id,
      action: entry.action,
      estado_anterior: entry.estado_anterior,
      estado_nuevo: entry.estado_nuevo,
      detalles: entry.detalles || {},
      usuario: entry.usuario,
      ip_address: entry.ip_address,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error appending audit log:', error);
    throw error;
  }
}

export async function getInvoiceAuditLog(invoiceId: string): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('audit_log')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return (data as AuditLog[]) || [];
  } catch (error) {
    console.error('Error fetching invoice audit log:', error);
    throw error;
  }
}

export async function getRecentAuditLogs(
  invoiceId?: string,
  limit: number = 100
): Promise<AuditLog[]> {
  try {
    let query = supabaseAdminClient.from('audit_log').select('*');

    if (invoiceId) {
      query = query.eq('invoice_id', invoiceId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data as AuditLog[]) || [];
  } catch (error) {
    console.error('Error fetching recent audit logs:', error);
    throw error;
  }
}
