import { DGIIAuthResponse } from './types';

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Get or refresh authentication token from DGII
 * Caches token in memory until 5 minutes before expiry
 */
export async function getAuthToken(
  baseUrl: string,
  rnc: string,
  certBuffer: Buffer,
  certPassword: string
): Promise<string> {
  const cacheKey = `${baseUrl}:${rnc}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid (with 5-minute buffer)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  // Fetch new token
  const token = await requestAuthToken(baseUrl, rnc, certBuffer, certPassword);

  // Parse expiration time from response
  const expiresAt = Date.now() + 60 * 60 * 1000; // Default 1 hour

  // Cache token
  tokenCache.set(cacheKey, { token, expiresAt });

  return token;
}

async function requestAuthToken(
  baseUrl: string,
  rnc: string,
  certBuffer: Buffer,
  _certPassword: string
): Promise<string> {
  const certBase64 = certBuffer.toString('base64');

  const response = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      RNC: rnc,
      certificado_base64: certBase64,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DGII auth failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as DGIIAuthResponse;

  if (!data.token) {
    throw new Error('DGII auth response missing token');
  }

  return data.token;
}

/**
 * Clear token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Clear specific token from cache
 */
export function clearTokenCacheFor(baseUrl: string, rnc: string): void {
  const cacheKey = `${baseUrl}:${rnc}`;
  tokenCache.delete(cacheKey);
}
