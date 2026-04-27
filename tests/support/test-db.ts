/**
 * Helpers for tests that need access to the database.
 *
 * If Supabase env vars are not set, getServiceClient() throws a clear error
 * so callers (including Playwright specs) can test.skip() before ever
 * calling these helpers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getServiceClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase env vars are missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). ' +
        'Set them to run database-backed tests.'
    );
  }
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  return cachedClient;
}

export async function cleanDatabase(): Promise<void> {
  const c = getServiceClient();
  // Order matters because of FKs.
  await c.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await c.from('invoice_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await c.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await c.from('ncf_sequences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await c.from('company_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

export async function seedDefaultCompany(): Promise<{ companyId: string }> {
  const c = getServiceClient();

  const { data: company, error } = await c
    .from('company_config')
    .insert({
      rnc: '101234567',
      razon_social: 'Empresa de Prueba S.R.L.',
      nombre_comercial: 'Empresa Test',
      direccion: 'Av. Principal #1, Santo Domingo',
      tipo_ingresos: '01',
    })
    .select('id')
    .single();

  if (error) throw error;

  // Active sequence with 1 year to go
  const oneYearAhead = new Date();
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

  await c.from('ncf_sequences').insert({
    company_id: (company as any).id,
    tipo_ecf: 31,
    secuencia_inicial: 'E310000000001',
    secuencia_actual: 'E310000000001',
    secuencia_final: 'E310000999999',
    fecha_vencimiento: oneYearAhead.toISOString().slice(0, 10),
    estado: 'activo',
  });

  return { companyId: (company as any).id };
}

/**
 * Upload the test certificate fixture to Supabase storage and update
 * the company's certificado_path.  Requires the fixtures to have been
 * generated with `npm run fixtures`.
 */
export async function seedTestCertificate(companyId: string): Promise<void> {
  const c = getServiceClient();

  const fixturePath = path.resolve(__dirname, '../fixtures/test-certificate.p12');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      'test-certificate.p12 not found. Run `npm run fixtures` first.'
    );
  }

  const certBuffer = fs.readFileSync(fixturePath);
  const storagePath = `test_${Date.now()}_certificate.p12`;

  const { error: uploadErr } = await c.storage
    .from('certificates')
    .upload(storagePath, certBuffer, {
      contentType: 'application/pkcs12',
      upsert: false,
    });

  if (uploadErr) throw uploadErr;

  const { error: updateErr } = await c
    .from('company_config')
    .update({ certificado_path: storagePath })
    .eq('id', companyId);

  if (updateErr) throw updateErr;
}

/**
 * Seed a single invoice with the given field overrides.
 * Returns the created invoice id.
 */
export async function seedInvoice(
  companyId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const c = getServiceClient();

  const defaults = {
    company_id: companyId,
    numero_factura: `INV-TEST-${Date.now()}`,
    numero_cliente: '130123456',
    razon_social_cliente: 'Cliente de Prueba',
    direccion_cliente: 'Calle Test #1',
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    subtotal: 1000,
    monto_gravado_i1: 1000,
    monto_gravado_i2: 0,
    monto_gravado_i3: 0,
    itbis_1: 180,
    itbis_2: 0,
    itbis_3: 0,
    total: 1180,
    tipo_pago: 1,
    tipo_ingresos: '01',
    estado: 'pendiente',
    intentos_envio: 0,
  };

  const { data, error } = await c
    .from('invoices')
    .insert({ ...defaults, ...overrides })
    .select('id')
    .single();

  if (error) throw error;
  return (data as any).id;
}

/**
 * Seed multiple invoices with different estados for filter testing.
 * Returns a map of estado -> invoiceId.
 */
export async function seedInvoicesWithStates(
  companyId: string,
  estados: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const estado of estados) {
    const id = await seedInvoice(companyId, {
      estado,
      numero_factura: `INV-${estado.toUpperCase()}-${Date.now()}`,
      encf: estado !== 'pendiente' ? `E31000000${Math.floor(Math.random() * 9999)}` : null,
    });
    result[estado] = id;
  }
  return result;
}

/**
 * Seed a sequence that expires in `daysAhead` days (default 10).
 * Useful for testing expiry-soon alerts.
 */
export async function seedExpiringSoonSequence(
  companyId: string,
  daysAhead = 10
): Promise<string> {
  const c = getServiceClient();

  const expiryDate = new Date(Date.now() + daysAhead * 86400000);

  const { data, error } = await c
    .from('ncf_sequences')
    .insert({
      company_id: companyId,
      tipo_ecf: 31,
      secuencia_inicial: 'E310000200001',
      secuencia_actual: 'E310000200001',
      secuencia_final: 'E310000299999',
      fecha_vencimiento: expiryDate.toISOString().slice(0, 10),
      estado: 'activo',
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as any).id;
}

/**
 * Seed a sequence that is nearly depleted (fewer than 100 remaining).
 */
export async function seedNearlyDepletedSequence(companyId: string): Promise<string> {
  const c = getServiceClient();

  const oneYearAhead = new Date();
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

  const { data, error } = await c
    .from('ncf_sequences')
    .insert({
      company_id: companyId,
      tipo_ecf: 31,
      secuencia_inicial: 'E310000300001',
      // Only 50 remaining
      secuencia_actual: 'E310000300951',
      secuencia_final: 'E310000301000',
      fecha_vencimiento: oneYearAhead.toISOString().slice(0, 10),
      estado: 'activo',
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as any).id;
}
