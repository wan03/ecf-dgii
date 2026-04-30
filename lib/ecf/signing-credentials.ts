/**
 * Signing credentials resolver.
 *
 * SECURITY-CRITICAL FILE — handles a private signing certificate (.p12) and
 * its password. The values flow only through this module on every signing /
 * DGII-auth call. Read this file before changing it.
 *
 * Resolution order:
 *   1. If YNOVI_CERT_BASE64 and YNOVI_CERT_PASS are BOTH set in the
 *      environment (production on Vercel), decode the base64 in memory and
 *      use it. The Supabase Storage path on the company record is ignored.
 *   2. Otherwise, fall back to the per-company certificate stored in
 *      Supabase Storage and the legacy CERT_PASSWORD env var (used by tests
 *      and local dev).
 *   3. If exactly one of the two Ynovi vars is set, fail loudly. A partially-
 *      configured deploy must never silently fall back to the wrong cert.
 *
 * Hard rules — do not break:
 *   - Never log the buffer, password, or base64 string (no console.log,
 *     no error messages that include them, no audit log entries).
 *   - Never persist the decoded buffer (no disk writes, no caches outside
 *     this module's call frame).
 *   - Never expose this module to the browser bundle. The runtime guard
 *     below enforces that.
 *   - Never accept the password through a request body or query param.
 *   - Never include sensitive data in thrown error messages.
 */

import { Buffer } from 'buffer';
import type { CompanyConfig } from '../db/config';
import { getCertificate } from '../storage/certificate';

// Refuse to load in a browser bundle. This module reads secrets from
// process.env and must only run on the server.
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/ecf/signing-credentials must not be imported from client code'
  );
}

export interface SigningCredentials {
  /** PKCS#12 certificate bytes — must not be logged or persisted. */
  buffer: Buffer;
  /** Cleartext password for the .p12 — must not be logged or persisted. */
  password: string;
  /** Which path produced the credentials, for non-sensitive diagnostics. */
  source: 'env' | 'storage';
}

/**
 * Resolve the signing credentials for the given company.
 *
 * Caller MUST treat the returned object as sensitive: do not log it, do not
 * include it in audit-log details, do not return it from a route handler.
 */
export async function getSigningCredentials(
  company: CompanyConfig
): Promise<SigningCredentials> {
  const ynoviCertBase64 = process.env.YNOVI_CERT_BASE64;
  const ynoviCertPass = process.env.YNOVI_CERT_PASS;

  const hasBase64 = typeof ynoviCertBase64 === 'string' && ynoviCertBase64.length > 0;
  const hasPass = typeof ynoviCertPass === 'string' && ynoviCertPass.length > 0;

  // Misconfiguration guard: one set, the other missing.
  if (hasBase64 !== hasPass) {
    throw new Error(
      'Signing credentials misconfigured: YNOVI_CERT_BASE64 and YNOVI_CERT_PASS must both be set or both unset.'
    );
  }

  if (hasBase64 && hasPass) {
    const buffer = decodeAndValidatePkcs12(ynoviCertBase64);
    return { buffer, password: ynoviCertPass, source: 'env' };
  }

  // Fallback: per-company certificate from Supabase Storage.
  if (!company.certificado_path) {
    throw new Error('Company has no certificate uploaded');
  }
  const buffer = await getCertificate(company.certificado_path);
  const password = process.env.CERT_PASSWORD ?? '';
  return { buffer, password, source: 'storage' };
}

/**
 * Decode the base64 string and verify the result starts with a PKCS#12
 * (ASN.1 DER SEQUENCE) magic byte. Throws a generic error on any problem
 * — the error message must NEVER include the input or decoded bytes.
 */
function decodeAndValidatePkcs12(base64: string): Buffer {
  let buffer: Buffer;
  try {
    // Buffer.from with 'base64' tolerates whitespace/newlines that Vercel
    // sometimes inserts when storing multi-line secrets.
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('YNOVI_CERT_BASE64 is not valid base64.');
  }

  if (buffer.length < 4) {
    throw new Error('YNOVI_CERT_BASE64 decoded to an unexpectedly small payload.');
  }

  // PKCS#12 / DER files begin with an ASN.1 SEQUENCE tag (0x30) followed
  // by a length byte. Anything else is not a .p12 — fail closed.
  if (buffer[0] !== 0x30) {
    throw new Error(
      'YNOVI_CERT_BASE64 does not decode to a PKCS#12 / DER structure.'
    );
  }

  return buffer;
}
