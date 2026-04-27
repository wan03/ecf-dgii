import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseOdooFile, ParseError, parseCSVText } from '@/lib/odoo/parser';

const HEADERS = [
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

function baseRow(over: Record<string, any> = {}) {
  return {
    'Número': 'INV/A/0001',
    'Fecha Factura': '15/01/2025',
    'Cliente': 'Cliente Demo',
    'NIF/CIF': '130123456',
    'Dirección Cliente': 'Calle 1',
    'País Cliente': 'RD',
    'Plazo de Pago': 'Contado',
    'Fecha Vencimiento': '15/01/2025',
    'N° Línea': 1,
    'Producto': 'Item',
    'Descripción Línea': 'Desc',
    'Cantidad': 1,
    'Unidad de Medida': 'Unidades',
    'Precio Unitario': 1000,
    'Descuento (%)': 0,
    'Impuestos': '18%',
    'Subtotal': 1000,
    'Moneda': 'DOP',
    ...over,
  };
}

function buildXlsxBuffer(rows: any[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildCSV(rows: any[]): string {
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [HEADERS.join(',')];
  for (const r of rows) lines.push(HEADERS.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}

describe('parseCSVText (RFC 4180)', () => {
  it('parses quoted fields with commas', () => {
    const csv = 'a,b\n"x, y",z\n';
    expect(parseCSVText(csv)).toEqual([
      ['a', 'b'],
      ['x, y', 'z'],
    ]);
  });

  it('parses escaped quotes', () => {
    const csv = 'a,b\n"He said ""hi""",x\n';
    expect(parseCSVText(csv)).toEqual([
      ['a', 'b'],
      ['He said "hi"', 'x'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n';
    expect(parseCSVText(csv)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips BOM', () => {
    const csv = '\uFEFFa,b\n1,2\n';
    expect(parseCSVText(csv)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseOdooFile', () => {
  it('parses a basic XLSX file', async () => {
    const buf = buildXlsxBuffer([baseRow({})]);
    const invs = await parseOdooFile(buf, 'sample.xlsx');
    expect(invs).toHaveLength(1);
    expect(invs[0].numero).toBe('INV/A/0001');
    expect(invs[0].fechaFactura).toBe('2025-01-15');
    expect(invs[0].lineas).toHaveLength(1);
  });

  it('parses CSV with quoted comma in cliente', async () => {
    const csv = buildCSV([baseRow({ Cliente: 'García, S.A.' })]);
    const buf = Buffer.from(csv, 'utf-8');
    const invs = await parseOdooFile(buf, 'sample.csv');
    expect(invs[0].cliente).toBe('García, S.A.');
  });

  it('throws on missing required column', async () => {
    const headersWithout = HEADERS.filter((h) => h !== 'Cliente');
    const ws = XLSX.utils.aoa_to_sheet([headersWithout, headersWithout.map(() => 'x')]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await expect(parseOdooFile(buf, 'broken.xlsx')).rejects.toThrow(ParseError);
  });

  it('parses dd/MM/yyyy date string into ISO format', async () => {
    const buf = buildXlsxBuffer([baseRow({ 'Fecha Factura': '03/02/2026' })]);
    const invs = await parseOdooFile(buf, 'sample.xlsx');
    expect(invs[0].fechaFactura).toBe('2026-02-03');
  });

  it('groups multiple lines into a single invoice', async () => {
    const buf = buildXlsxBuffer([
      baseRow({ 'Número': 'INV/B/01', 'N° Línea': 1, 'Cantidad': 1, 'Subtotal': 100 }),
      baseRow({ 'Número': 'INV/B/01', 'N° Línea': 2, 'Cantidad': 2, 'Subtotal': 200 }),
      baseRow({ 'Número': 'INV/B/01', 'N° Línea': 3, 'Cantidad': 3, 'Subtotal': 300 }),
    ]);
    const invs = await parseOdooFile(buf, 'sample.xlsx');
    expect(invs).toHaveLength(1);
    expect(invs[0].lineas).toHaveLength(3);
  });

  it('throws when cantidad <= 0', async () => {
    const buf = buildXlsxBuffer([baseRow({ Cantidad: 0 })]);
    await expect(parseOdooFile(buf, 'zero.xlsx')).rejects.toThrow(/Invalid quantity/);
  });

  it('rejects unsupported file extensions', async () => {
    await expect(parseOdooFile(Buffer.from(''), 'data.txt')).rejects.toThrow(/Unsupported file format/);
  });
});
