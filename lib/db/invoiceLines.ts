import { supabaseAdminClient } from './client';
import type { ECF31Line } from '../ecf/types';

export interface InvoiceLine {
  id?: string;
  invoice_id?: string;
  numeroLinea: number;
  nombreBienServicio: string;
  indicadorBienOServicio: number;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuentoMonto: number;
  montoItem: number;
  itbis: number;
  codigoITBIS: number;
}

interface InvoiceLineRow {
  id?: string;
  invoice_id?: string;
  numero_linea: number;
  nombre_bien_servicio: string;
  indicador_bien_o_servicio: number;
  descripcion: string | null;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number;
  descuento_monto: number | null;
  monto_item: number;
  itbis: number | null;
  codigo_itbis: number;
}

function toRow(invoiceId: string, line: InvoiceLine | ECF31Line): Omit<InvoiceLineRow, 'id'> {
  return {
    invoice_id: invoiceId,
    numero_linea: line.numeroLinea,
    nombre_bien_servicio: line.nombreBienServicio,
    indicador_bien_o_servicio: line.indicadorBienOServicio,
    descripcion: line.descripcion ?? null,
    cantidad: line.cantidad,
    unidad_medida: line.unidadMedida,
    precio_unitario: line.precioUnitario,
    descuento_monto: line.descuentoMonto ?? 0,
    monto_item: line.montoItem,
    itbis: line.itbis ?? 0,
    codigo_itbis: line.codigoITBIS,
  };
}

function fromRow(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    numeroLinea: row.numero_linea,
    nombreBienServicio: row.nombre_bien_servicio,
    indicadorBienOServicio: row.indicador_bien_o_servicio,
    descripcion: row.descripcion ?? '',
    cantidad: Number(row.cantidad),
    unidadMedida: row.unidad_medida,
    precioUnitario: Number(row.precio_unitario),
    descuentoMonto: Number(row.descuento_monto ?? 0),
    montoItem: Number(row.monto_item),
    itbis: Number(row.itbis ?? 0),
    codigoITBIS: row.codigo_itbis,
  };
}

/**
 * Bulk-insert invoice lines for the given invoice id.
 */
export async function createInvoiceLines(
  invoiceId: string,
  lines: Array<InvoiceLine | ECF31Line>
): Promise<void> {
  if (!lines || lines.length === 0) return;
  const rows = lines.map((l) => toRow(invoiceId, l));

  const { error } = await supabaseAdminClient.from('invoice_lines').insert(rows);
  if (error) {
    console.error('Error creating invoice lines:', error);
    throw error;
  }
}

/**
 * Fetch all invoice lines for the given invoice id, ordered by numero_linea.
 * Returns camelCased mapped objects.
 */
export async function getInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  const { data, error } = await supabaseAdminClient
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('numero_linea', { ascending: true });

  if (error) {
    console.error('Error fetching invoice lines:', error);
    throw error;
  }

  return ((data as InvoiceLineRow[]) || []).map(fromRow);
}
