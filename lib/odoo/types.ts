/**
 * Raw row from Odoo XLSX/CSV export with all 18 columns in Spanish
 */
export interface OdooRow {
  'Número': string;
  'Fecha Factura': string;
  'Cliente': string;
  'NIF/CIF': string;
  'Dirección Cliente': string;
  'País Cliente': string;
  'Plazo de Pago': string;
  'Fecha Vencimiento': string;
  'N° Línea': string;
  'Producto': string;
  'Descripción Línea': string;
  'Cantidad': string | number;
  'Unidad de Medida': string;
  'Precio Unitario': string | number;
  'Descuento (%)': string | number;
  'Impuestos': string;
  'Subtotal': string | number;
  'Moneda': string;
}

/**
 * Parsed invoice line item from Odoo data
 */
export interface OdooInvoiceLine {
  numeroLinea: number;
  producto: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuentoPorcentaje: number;
  impuestos: string;
  subtotal: number;
}

/**
 * Parsed invoice from Odoo data, grouped by invoice number
 */
export interface OdooInvoice {
  numero: string;
  fechaFactura: string;
  cliente: string;
  nifCif: string;
  direccionCliente: string;
  paisCliente: string;
  plazoPago: string;
  fechaVencimiento: string;
  moneda: string;
  lineas: OdooInvoiceLine[];
  subtotalTotal: number;
  montoTotal: number;
}
