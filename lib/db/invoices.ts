import { supabaseAdminClient } from './client';

export type InvoiceEstado =
  | 'pendiente'
  | 'xml_generado'
  | 'firmado'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'error';

export interface Invoice {
  id: string;
  company_id: string;
  numero_factura: string;
  encf?: string;
  numero_cliente: string;
  razon_social_cliente: string;
  direccion_cliente: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  subtotal: number;
  monto_gravado_i1: number;
  monto_gravado_i2: number;
  monto_gravado_i3: number;
  itbis_1: number;
  itbis_2: number;
  itbis_3: number;
  total: number;
  tipo_pago: number;
  tipo_ingresos: string;
  estado: InvoiceEstado;
  estado_dgii?: string;
  track_id?: string;
  xml_content?: string;
  xml_firmado?: string;
  intentos_envio: number;
  error_message?: string;
  respuesta_dgii?: Record<string, unknown>;
  fecha_envio?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceInput {
  company_id: string;
  numero_factura: string;
  numero_cliente: string;
  razon_social_cliente: string;
  direccion_cliente: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  subtotal: number;
  monto_gravado_i1: number;
  monto_gravado_i2: number;
  monto_gravado_i3: number;
  itbis_1: number;
  itbis_2: number;
  itbis_3: number;
  total: number;
  tipo_pago: number;
  tipo_ingresos: string;
}

export async function createInvoice(data: CreateInvoiceInput): Promise<Invoice> {
  try {
    const { data: invoice, error } = await supabaseAdminClient
      .from('invoices')
      .insert({
        ...data,
        estado: 'pendiente',
        intentos_envio: 0,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return invoice as Invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

export async function updateInvoiceState(
  id: string,
  estado: InvoiceEstado,
  updates?: Partial<Invoice>
): Promise<void> {
  try {
    const { error } = await supabaseAdminClient
      .from('invoices')
      .update({
        estado,
        updated_at: new Date().toISOString(),
        ...updates,
      })
      .eq('id', id);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error updating invoice state:', error);
    throw error;
  }
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as Invoice;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
}

export interface ListInvoicesFilters {
  estado?: string;
  from?: string;
  to?: string;
  companyId?: string;
}

export async function listInvoices(filters?: ListInvoicesFilters): Promise<Invoice[]> {
  try {
    let query = supabaseAdminClient.from('invoices').select('*');

    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters?.companyId) {
      query = query.eq('company_id', filters.companyId);
    }

    if (filters?.from) {
      query = query.gte('fecha_emision', filters.from);
    }

    if (filters?.to) {
      query = query.lte('fecha_emision', filters.to);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data as Invoice[]) || [];
  } catch (error) {
    console.error('Error listing invoices:', error);
    throw error;
  }
}

export async function getPendingPollingInvoices(): Promise<Invoice[]> {
  try {
    const { data, error } = await supabaseAdminClient
      .from('invoices')
      .select('*')
      .eq('estado', 'enviado')
      .lt('intentos_envio', 20)
      .order('updated_at', { ascending: true })
      .limit(50);

    if (error) {
      throw error;
    }

    return (data as Invoice[]) || [];
  } catch (error) {
    console.error('Error fetching pending polling invoices:', error);
    throw error;
  }
}

export async function updateInvoiceWithDGIIResponse(
  id: string,
  trackId: string,
  respuestaData: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabaseAdminClient
      .from('invoices')
      .update({
        track_id: trackId,
        respuesta_dgii: respuestaData,
        estado: 'enviado',
        estado_dgii: respuestaData?.estado || 'En proceso',
        fecha_envio: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error updating invoice with DGII response:', error);
    throw error;
  }
}

export async function incrementInvoiceRetryCount(id: string): Promise<void> {
  try {
    const invoice = await getInvoice(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const { error } = await supabaseAdminClient
      .from('invoices')
      .update({
        intentos_envio: invoice.intentos_envio + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error incrementing invoice retry count:', error);
    throw error;
  }
}
