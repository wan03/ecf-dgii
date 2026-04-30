import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Buffer } from 'buffer';
import type { CompanyConfig } from '../../lib/db/config';

// We mock the Supabase Storage download so the storage fallback path doesn't
// attempt a real network call. The mock must be declared before the SUT is
// imported (handled per-test via dynamic import).
vi.mock('../../lib/storage/certificate', () => ({
  getCertificate: vi.fn(async () => Buffer.from([0x30, 0x82, 0x04, 0x00])),
}));

const FAKE_COMPANY: CompanyConfig = {
  id: 'co_1',
  rnc: '101000000',
  razon_social: 'Test Co',
  nombre_comercial: 'Test',
  direccion: 'Test',
  certificado_path: 'test-co.p12',
} as CompanyConfig;

// Build a minimal valid PKCS#12-shaped buffer (just the ASN.1 SEQUENCE tag
// + a small body). The signing-credentials helper only checks the magic
// byte; full parsing happens later in node-forge.
const VALID_P12_BYTES = Buffer.from([0x30, 0x82, 0x05, 0x00, 0xaa, 0xbb]);
const VALID_BASE64 = VALID_P12_BYTES.toString('base64');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Start each test with a clean slate for the relevant env vars.
  delete process.env.YNOVI_CERT_BASE64;
  delete process.env.YNOVI_CERT_PASS;
  delete process.env.CERT_PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getSigningCredentials', () => {
  it('uses YNOVI env vars when both are set (production path)', async () => {
    process.env.YNOVI_CERT_BASE64 = VALID_BASE64;
    process.env.YNOVI_CERT_PASS = 'super-secret';

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    const creds = await getSigningCredentials(FAKE_COMPANY);

    expect(creds.source).toBe('env');
    expect(creds.password).toBe('super-secret');
    expect(creds.buffer.equals(VALID_P12_BYTES)).toBe(true);
  });

  it('falls back to Supabase Storage when neither YNOVI var is set', async () => {
    process.env.CERT_PASSWORD = 'storage-pass';

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    const creds = await getSigningCredentials(FAKE_COMPANY);

    expect(creds.source).toBe('storage');
    expect(creds.password).toBe('storage-pass');
    expect(creds.buffer[0]).toBe(0x30);
  });

  it('throws if YNOVI_CERT_BASE64 is set without YNOVI_CERT_PASS', async () => {
    process.env.YNOVI_CERT_BASE64 = VALID_BASE64;

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    await expect(getSigningCredentials(FAKE_COMPANY)).rejects.toThrow(
      /misconfigured/i
    );
  });

  it('throws if YNOVI_CERT_PASS is set without YNOVI_CERT_BASE64', async () => {
    process.env.YNOVI_CERT_PASS = 'pass-only';

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    await expect(getSigningCredentials(FAKE_COMPANY)).rejects.toThrow(
      /misconfigured/i
    );
  });

  it('rejects YNOVI_CERT_BASE64 that does not start with the PKCS#12 magic byte', async () => {
    // 'AAAA' decodes to 0x00 0x00 0x00 — not a DER SEQUENCE.
    process.env.YNOVI_CERT_BASE64 = 'AAAAAAAA';
    process.env.YNOVI_CERT_PASS = 'whatever';

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    await expect(getSigningCredentials(FAKE_COMPANY)).rejects.toThrow(
      /PKCS#12/
    );
  });

  it('rejects a too-small YNOVI_CERT_BASE64 payload', async () => {
    process.env.YNOVI_CERT_BASE64 = 'AA=='; // decodes to 1 byte
    process.env.YNOVI_CERT_PASS = 'whatever';

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    await expect(getSigningCredentials(FAKE_COMPANY)).rejects.toThrow(
      /small payload/
    );
  });

  it('throws a clean error when storage fallback has no certificado_path', async () => {
    const noCertCompany = { ...FAKE_COMPANY, certificado_path: undefined } as CompanyConfig;

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    await expect(getSigningCredentials(noCertCompany)).rejects.toThrow(
      /no certificate uploaded/i
    );
  });

  it('does NOT include the base64 input or decoded bytes in error messages', async () => {
    const sentinel = 'SENSITIVE-MARKER-XYZZY';
    // Build invalid base64 that contains the sentinel but doesn't decode to
    // a valid DER structure.
    process.env.YNOVI_CERT_BASE64 = Buffer.from(sentinel).toString('base64');
    process.env.YNOVI_CERT_PASS = sentinel;

    const { getSigningCredentials } = await import('../../lib/ecf/signing-credentials');
    try {
      await getSigningCredentials(FAKE_COMPANY);
      throw new Error('expected helper to throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(sentinel);
      expect(msg).not.toContain(process.env.YNOVI_CERT_BASE64 ?? '');
    }
  });
});
