import { getAuthToken } from './auth';
import { DGIISendResponse, DGIIStatusResponse } from './types';

export class DGIIClient {
  constructor(
    private baseUrl: string,
    private rnc: string,
    private certBuffer: Buffer,
    private certPassword: string
  ) {}

  /**
   * Send signed ECF to DGII
   * POST {baseUrl}/api/Ecf/Recepcion
   */
  async sendECF(signedXml: string): Promise<DGIISendResponse> {
    const token = await getAuthToken(
      this.baseUrl,
      this.rnc,
      this.certBuffer,
      this.certPassword
    );

    let lastError: Error | null = null;

    // Retry logic: 3 attempts with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/Ecf/Recepcion`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            Authorization: `Bearer ${token}`,
          },
          body: signedXml,
        });

        if (response.ok) {
          const data = await response.json();
          return {
            trackId: data.trackId || data.track_id || '',
            estado: data.estado || 'En proceso',
            mensaje: data.mensaje,
          };
        } else if (response.status === 401 || response.status === 403) {
          // Token expired, force refresh on next attempt
          throw new Error('Authentication failed');
        } else {
          const errorText = await response.text();
          throw new Error(
            `DGII send failed: ${response.status} ${response.statusText} - ${errorText}`
          );
        }
      } catch (error) {
        lastError = error as Error;

        // Don't retry on auth errors or on last attempt
        if (
          attempt < 2 &&
          !String(lastError.message).includes('Authentication failed')
        ) {
          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('Failed to send ECF after 3 attempts');
  }

  /**
   * Get ECF status from DGII
   * GET {baseUrl}/api/Ecf/Estado/{trackId}
   */
  async getStatus(trackId: string): Promise<DGIIStatusResponse> {
    const token = await getAuthToken(
      this.baseUrl,
      this.rnc,
      this.certBuffer,
      this.certPassword
    );

    let lastError: Error | null = null;

    // Retry logic: 3 attempts with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/Ecf/Estado/${trackId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return {
            trackId: data.trackId || trackId,
            estado: data.estado || 'No encontrado',
            mensajes: data.mensajes || data.messages || [],
            codigoSeguridad: data.codigoSeguridad || data.codigo_seguridad,
            fechaHoraFirma: data.fechaHoraFirma || data.fecha_hora_firma,
          };
        } else if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed');
        } else if (response.status === 404) {
          return {
            trackId,
            estado: 'No encontrado',
            mensajes: [],
          };
        } else {
          const errorText = await response.text();
          throw new Error(
            `DGII status check failed: ${response.status} ${response.statusText} - ${errorText}`
          );
        }
      } catch (error) {
        lastError = error as Error;

        if (
          attempt < 2 &&
          !String(lastError.message).includes('Authentication failed')
        ) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('Failed to get status after 3 attempts');
  }
}
