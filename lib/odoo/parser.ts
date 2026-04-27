import * as XLSX from 'xlsx';
import { OdooRow, OdooInvoice, OdooInvoiceLine } from './types';
import { parse } from 'date-fns';

export class ParseError extends Error {
  constructor(
    message: string,
    public rowNumber?: number,
    public columnName?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const REQUIRED_COLUMNS = [
  'Número',
  'Fecha Factura',
  'Cliente',
  'NIF/CIF',
  'Dirección Cliente',
  'País Cliente',
  'Plazo de Pago',
  'Fecha Vencimiento',
  'N° Línea',
  'Producto',
  'Descripción Línea',
  'Cantidad',
  'Unidad de Medida',
  'Precio Unitario',
  'Descuento (%)',
  'Impuestos',
  'Subtotal',
  'Moneda',
];

function parseSpanishDate(dateInput: string | Date | number | null | undefined): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    throw new Error('Date cannot be empty');
  }

  // Handle Date objects (from XLSX with cellDates: true)
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      throw new Error('Invalid Date object');
    }
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dateStr = String(dateInput).trim();

  // Handle already ISO format (yyyy-MM-dd)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.substring(0, 10);
  }

  try {
    // Try dd/MM/yyyy format (Spanish format from Odoo)
    const parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
    if (isNaN(parsed.getTime())) {
      throw new Error('Invalid date');
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    throw new Error(`Cannot parse date "${dateStr}" in dd/MM/yyyy format`);
  }
}

/**
 * RFC 4180 compliant CSV parser.
 * Handles:
 *  - Quoted fields with embedded commas
 *  - Escaped quotes (`""` inside quoted field)
 *  - CR/LF and LF line endings
 *  - BOM removal
 */
export function parseCSVText(content: string): string[][] {
  // Remove BOM
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && content[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // Handle CRLF and bare CR
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      if (i < len && content[i] === '\n') {
        i++;
      }
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Filter trailing entirely empty rows
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 0 || (last.length === 1 && last[0] === '')) {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

function parseCSV(content: string): OdooRow[] {
  const allRows = parseCSVText(content);

  if (allRows.length < 2) {
    throw new ParseError('CSV file must have at least a header row and data rows');
  }

  const headers = allRows[0].map((h) => h.trim());

  // Validate headers
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new ParseError(
      `Missing required columns: ${missingColumns.join(', ')}`,
      0,
      missingColumns[0]
    );
  }

  const rows: OdooRow[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
    const row: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index] : '';
    });

    // Only add non-empty rows
    if (row['Número'] && String(row['Número']).trim()) {
      rows.push(row as unknown as OdooRow);
    }
  }

  return rows;
}

function parseXLSX(buffer: Buffer): OdooRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new ParseError('XLSX file has no sheets');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<OdooRow>(worksheet, {
    blankrows: false,
    raw: true,
  });

  if (rows.length === 0) {
    throw new ParseError('XLSX sheet contains no data rows');
  }

  // Validate headers
  if (rows.length > 0) {
    const firstRowKeys = Object.keys(rows[0]);
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !firstRowKeys.includes(col));
    if (missingColumns.length > 0) {
      throw new ParseError(
        `Missing required columns: ${missingColumns.join(', ')}`,
        0,
        missingColumns[0]
      );
    }
  }

  return rows;
}

function validateRequiredField(value: unknown, fieldName: string, rowNumber: number): void {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new ParseError(`Required field "${fieldName}" is empty`, rowNumber, fieldName);
  }
}

function parseRows(rows: OdooRow[]): OdooInvoice[] {
  const invoiceMap = new Map<string, OdooInvoice>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because index is 0-based and we skip header

    try {
      // Validate required fields
      validateRequiredField(row['Número'], 'Número', rowNumber);
      validateRequiredField(row['Fecha Factura'], 'Fecha Factura', rowNumber);
      validateRequiredField(row['Cliente'], 'Cliente', rowNumber);
      validateRequiredField(row['NIF/CIF'], 'NIF/CIF', rowNumber);
      validateRequiredField(row['Dirección Cliente'], 'Dirección Cliente', rowNumber);
      validateRequiredField(row['Cantidad'], 'Cantidad', rowNumber);
      validateRequiredField(row['Precio Unitario'], 'Precio Unitario', rowNumber);

      const numeroFactura = String(row['Número']).trim();
      const fechaFactura = parseSpanishDate(row['Fecha Factura']);
      const fechaVencimiento = row['Fecha Vencimiento']
        ? parseSpanishDate(row['Fecha Vencimiento'])
        : fechaFactura;

      const cantidad = parseFloat(String(row['Cantidad']));
      const precioUnitario = parseFloat(String(row['Precio Unitario']));
      const descuentoPorcentaje =
        row['Descuento (%)'] !== undefined &&
        row['Descuento (%)'] !== null &&
        String(row['Descuento (%)']).trim() !== ''
          ? parseFloat(String(row['Descuento (%)']))
          : 0;
      const subtotal =
        row['Subtotal'] !== undefined && row['Subtotal'] !== null && String(row['Subtotal']).trim() !== ''
          ? parseFloat(String(row['Subtotal']))
          : cantidad * precioUnitario * (1 - descuentoPorcentaje / 100);

      if (isNaN(cantidad) || cantidad <= 0) {
        throw new ParseError(`Invalid quantity value: ${row['Cantidad']}`, rowNumber, 'Cantidad');
      }
      if (isNaN(precioUnitario)) {
        throw new ParseError(
          `Invalid unit price: ${row['Precio Unitario']}`,
          rowNumber,
          'Precio Unitario'
        );
      }
      if (isNaN(descuentoPorcentaje)) {
        throw new ParseError(
          `Invalid discount percentage: ${row['Descuento (%)']}`,
          rowNumber,
          'Descuento (%)'
        );
      }

      const linea: OdooInvoiceLine = {
        numeroLinea: parseInt(String(row['N° Línea']), 10) || 1,
        producto: String(row['Producto']).trim(),
        descripcion: String(row['Descripción Línea']).trim(),
        cantidad,
        unidadMedida: String(row['Unidad de Medida']).trim(),
        precioUnitario,
        descuentoPorcentaje,
        impuestos: String(row['Impuestos']).trim(),
        subtotal,
      };

      if (!invoiceMap.has(numeroFactura)) {
        invoiceMap.set(numeroFactura, {
          numero: numeroFactura,
          fechaFactura,
          cliente: String(row['Cliente']).trim(),
          nifCif: String(row['NIF/CIF']).trim(),
          direccionCliente: String(row['Dirección Cliente']).trim(),
          paisCliente: String(row['País Cliente'] || '').trim(),
          plazoPago: String(row['Plazo de Pago'] || '').trim(),
          fechaVencimiento,
          moneda: String(row['Moneda'] || '').trim() || 'DOP',
          lineas: [],
          subtotalTotal: 0,
          montoTotal: 0,
        });
      }

      const invoice = invoiceMap.get(numeroFactura)!;
      invoice.lineas.push(linea);
      invoice.subtotalTotal += subtotal;
      invoice.montoTotal += subtotal;
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `Error parsing row ${rowNumber}: ${String(error)}`,
        rowNumber,
        'Unknown'
      );
    }
  });

  return Array.from(invoiceMap.values());
}

export async function parseOdooFile(
  buffer: Buffer,
  filename: string
): Promise<OdooInvoice[]> {
  try {
    const extension = filename.toLowerCase().split('.').pop();

    let rows: OdooRow[];

    if (extension === 'xlsx' || extension === 'xls') {
      rows = parseXLSX(buffer);
    } else if (extension === 'csv') {
      rows = parseCSV(buffer.toString('utf-8'));
    } else {
      throw new ParseError(
        `Unsupported file format: ${extension}. Expected XLSX or CSV.`
      );
    }

    if (rows.length === 0) {
      throw new ParseError('No data rows found in file');
    }

    const invoices = parseRows(rows);

    if (invoices.length === 0) {
      throw new ParseError('No valid invoices found in file');
    }

    return invoices;
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(`Error parsing file: ${String(error)}`);
  }
}
