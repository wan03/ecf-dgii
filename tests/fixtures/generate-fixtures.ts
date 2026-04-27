/**
 * Generate fixture files used by unit and e2e tests.
 *
 *  - sample-invoice.xlsx                 (single line, 1000 DOP @ 18%)
 *  - sample-invoice-multiline.xlsx       (3 lines mixed values)
 *  - sample-invoice-mixed-tax.xlsx       (18%, 16%, exempt)
 *  - sample-invoice-multiple.xlsx        (3 distinct invoices)
 *  - sample-invoice-invalid.xlsx         (empty NIF/CIF on row 2)
 *  - sample-invoice.csv                  (CSV with quoted "García, S.A." cliente)
 *  - test-certificate.p12                (RSA-2048, password "test123", 10y, CN=test)
 *
 * Run with:  npm run fixtures
 */
import * as XLSX from 'xlsx';
import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';

const FIX_DIR = path.resolve(__dirname);

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

type Row = Record<string, string | number>;

function makeRow(overrides: Partial<Row>): Row {
  return {
    'Número': 'INV/TEST/00001',
    'Fecha Factura': '15/01/2025',
    'Cliente': 'Cliente de Prueba S.A.',
    'NIF/CIF': '130123456',
    'Dirección Cliente': 'Calle Falsa 123, Santo Domingo',
    'País Cliente': 'República Dominicana',
    'Plazo de Pago': 'Contado',
    'Fecha Vencimiento': '15/01/2025',
    'N° Línea': 1,
    'Producto': 'Producto de prueba',
    'Descripción Línea': 'Línea de prueba',
    'Cantidad': 1,
    'Unidad de Medida': 'Unidades',
    'Precio Unitario': 1000,
    'Descuento (%)': 0,
    'Impuestos': '18%',
    'Subtotal': 1000,
    'Moneda': 'DOP',
    ...overrides,
  };
}

function writeXlsx(name: string, rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(path.join(FIX_DIR, name), buf);
  console.log('Wrote', name);
}

function writeCsv(name: string, rows: Row[]) {
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(HEADERS.map((h) => escape(r[h])).join(','));
  }
  fs.writeFileSync(path.join(FIX_DIR, name), lines.join('\n'));
  console.log('Wrote', name);
}

function generateSelfSignedP12(): Buffer {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [
    { name: 'commonName', value: 'test' },
    { name: 'countryName', value: 'DO' },
    { name: 'organizationName', value: 'Test Org' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'test123', {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

function main() {
  if (!fs.existsSync(FIX_DIR)) fs.mkdirSync(FIX_DIR, { recursive: true });

  // Single-line invoice
  writeXlsx('sample-invoice.xlsx', [makeRow({})]);

  // Multi-line invoice
  writeXlsx('sample-invoice-multiline.xlsx', [
    makeRow({
      'Número': 'INV/TEST/00002',
      'N° Línea': 1,
      'Producto': 'Item A',
      'Cantidad': 2,
      'Precio Unitario': 500,
      'Subtotal': 1000,
    }),
    makeRow({
      'Número': 'INV/TEST/00002',
      'N° Línea': 2,
      'Producto': 'Item B',
      'Cantidad': 5,
      'Precio Unitario': 200,
      'Subtotal': 1000,
    }),
    makeRow({
      'Número': 'INV/TEST/00002',
      'N° Línea': 3,
      'Producto': 'Item C',
      'Cantidad': 1,
      'Precio Unitario': 750,
      'Subtotal': 750,
    }),
  ]);

  // Mixed-tax invoice
  writeXlsx('sample-invoice-mixed-tax.xlsx', [
    makeRow({
      'Número': 'INV/TEST/00003',
      'N° Línea': 1,
      'Cantidad': 1,
      'Precio Unitario': 1000,
      'Impuestos': '18%',
      'Subtotal': 1000,
    }),
    makeRow({
      'Número': 'INV/TEST/00003',
      'N° Línea': 2,
      'Cantidad': 1,
      'Precio Unitario': 500,
      'Impuestos': '16%',
      'Subtotal': 500,
    }),
    makeRow({
      'Número': 'INV/TEST/00003',
      'N° Línea': 3,
      'Cantidad': 1,
      'Precio Unitario': 250,
      'Impuestos': 'Exento',
      'Subtotal': 250,
    }),
  ]);

  // Multiple invoices
  writeXlsx('sample-invoice-multiple.xlsx', [
    makeRow({ 'Número': 'INV/TEST/A0001', 'Cliente': 'Cliente A', 'NIF/CIF': '130000001' }),
    makeRow({ 'Número': 'INV/TEST/A0002', 'Cliente': 'Cliente B', 'NIF/CIF': '130000002' }),
    makeRow({ 'Número': 'INV/TEST/A0003', 'Cliente': 'Cliente C', 'NIF/CIF': '130000003' }),
  ]);

  // Invalid invoice (empty NIF/CIF on row 2)
  writeXlsx('sample-invoice-invalid.xlsx', [makeRow({ 'NIF/CIF': '' })]);

  // CSV with quoted Cliente containing comma
  writeCsv('sample-invoice.csv', [
    makeRow({ 'Cliente': 'García, S.A.', 'Número': 'INV/CSV/00001' }),
  ]);

  // Self-signed P12
  const p12 = generateSelfSignedP12();
  fs.writeFileSync(path.join(FIX_DIR, 'test-certificate.p12'), p12);
  console.log('Wrote test-certificate.p12 (RSA-2048, password "test123")');
}

main();
