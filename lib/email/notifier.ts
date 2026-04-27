import nodemailer from 'nodemailer';
import { Invoice } from '../db/invoices';
import { DGIIMensaje } from '../dgii/types';
import { NCFSequence } from '../db/sequences';

export interface EmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
}

export class EmailNotifier {
  private transporter: nodemailer.Transporter;

  constructor(config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    this.config = config;
  }

  private config: EmailConfig;

  /**
   * Send parse error notification
   */
  async sendParseError(filename: string, error: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Error de Análisis de Archivo</h2>
        <p><strong>Archivo:</strong> ${escapeHtml(filename)}</p>
        <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 12px; margin: 16px 0;">
          <p style="color: #c62828; margin: 0;"><strong>Error:</strong> ${escapeHtml(error)}</p>
        </div>
        <p style="color: #666; font-size: 12px;">
          Por favor, verifica el formato del archivo y reintenta.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `Error de Análisis: ${filename}`,
      html,
    });
  }

  /**
   * Send signing error notification
   */
  async sendSigningError(invoiceNumber: string, error: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Error de Firma Digital</h2>
        <p><strong>Factura:</strong> ${escapeHtml(invoiceNumber)}</p>
        <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 12px; margin: 16px 0;">
          <p style="color: #c62828; margin: 0;"><strong>Error:</strong> ${escapeHtml(error)}</p>
        </div>
        <p style="color: #666; font-size: 12px;">
          La factura no pudo ser firmada. Por favor, verifica el certificado digital.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `Error de Firma: Factura ${invoiceNumber}`,
      html,
    });
  }

  /**
   * Send DGII API error notification
   */
  async sendDGIIError(invoiceNumber: string, encf: string, error: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Error en Envío a DGII</h2>
        <p><strong>Factura:</strong> ${escapeHtml(invoiceNumber)}</p>
        <p><strong>eNCF:</strong> ${escapeHtml(encf)}</p>
        <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 12px; margin: 16px 0;">
          <p style="color: #c62828; margin: 0;"><strong>Error:</strong> ${escapeHtml(error)}</p>
        </div>
        <p style="color: #666; font-size: 12px;">
          El sistema reintentará automáticamente cada 2 minutos.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `Error DGII: Factura ${invoiceNumber}`,
      html,
    });
  }

  /**
   * Send invoice rejection notification
   */
  async sendRejectionNotification(
    invoice: Invoice,
    messages: DGIIMensaje[]
  ): Promise<void> {
    const messagesList = messages
      .map((m) => `<li>${escapeHtml(m.codigo)}: ${escapeHtml(m.descripcion)}</li>`)
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Factura Rechazada por DGII</h2>
        <p><strong>Factura:</strong> ${escapeHtml(invoice.numero_factura)}</p>
        <p><strong>eNCF:</strong> ${escapeHtml(invoice.encf || 'N/A')}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(invoice.razon_social_cliente)}</p>
        <p><strong>Monto:</strong> RD$ ${invoice.total.toFixed(2)}</p>
        <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 12px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Razones de Rechazo:</strong></p>
          <ul style="margin: 0; padding-left: 20px; color: #c62828;">
            ${messagesList}
          </ul>
        </div>
        <p style="color: #666; font-size: 12px;">
          Por favor, revisa los errores y resubmite la factura después de hacer los ajustes necesarios.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `Factura Rechazada: ${invoice.numero_factura}`,
      html,
    });
  }

  /**
   * Send sequence alert notification
   */
  async sendSequenceAlert(sequences: NCFSequence[]): Promise<void> {
    const sequencesList = sequences
      .map(
        (s) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${s.tipo_ecf}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(s.secuencia_actual)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(s.secuencia_final)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(s.fecha_vencimiento).toLocaleDateString('es-DO')}</td>
          </tr>`
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f57c00;">Alerta de Secuencias NCF</h2>
        <p>Una o más secuencias de facturación requieren atención:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background-color: #fff3e0;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #f57c00;">Tipo</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #f57c00;">Actual</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #f57c00;">Final</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #f57c00;">Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            ${sequencesList}
          </tbody>
        </table>
        <p style="color: #666; font-size: 12px;">
          Por favor, gestiona estas secuencias en el sistema.
        </p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: 'Alerta de Secuencias NCF',
      html,
    });
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
