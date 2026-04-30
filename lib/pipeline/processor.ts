import {
  createInvoice,
  getInvoice,
  updateInvoiceState,
  incrementInvoiceRetryCount,
  updateInvoiceWithDGIIResponse,
  Invoice,
  CreateInvoiceInput,
} from '../db/invoices';
import {
  getCompanyConfigById,
  CompanyConfig,
} from '../db/config';
import { appendAuditLog } from '../db/audit';
import {
  getSequenceByCompanyAndType,
  getActiveSequenceWithExpiry,
  assignNextENCF,
} from '../db/sequences';
import { createInvoiceLines } from '../db/invoiceLines';
import { parseOdooFile, ParseError } from '../odoo/parser';
import { mapOdooToECF31 } from '../odoo/mapper';
import { buildXML } from '../ecf/xml-builder';
import { signXML } from '../ecf/xml-signer';
import { validateCuadratura } from '../ecf/calculator';
import { ECF31Data } from '../ecf/types';
import { DGIIClient } from '../dgii/client';
import { getSigningCredentials } from '../ecf/signing-credentials';
import { EmailNotifier, EmailConfig } from '../email/notifier';

export interface ProcessError {
  invoiceNumber: string;
  error: string;
  step: string;
}

export interface ProcessResult {
  processed: number;
  errors: ProcessError[];
  successfulInvoices: string[];
}

export class InvoiceProcessor {
  private emailNotifier?: EmailNotifier;
  private dgiiClient?: DGIIClient;

  constructor(
    private companyId: string,
    emailConfig?: EmailConfig
  ) {
    if (emailConfig) {
      this.emailNotifier = new EmailNotifier(emailConfig);
    }
  }

  /**
   * Process invoices from an uploaded file
   */
  async processFromFile(fileBuffer: Buffer, filename: string): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      errors: [],
      successfulInvoices: [],
    };

    try {
      // Get company config
      const company = await getCompanyConfigById(this.companyId);
      if (!company) {
        throw new Error('Company configuration not found');
      }

      // Parse file
      let odooInvoices;
      try {
        odooInvoices = await parseOdooFile(fileBuffer, filename);
      } catch (error) {
        const parseError = error as ParseError;
        const errorMsg =
          parseError.columnName && parseError.rowNumber
            ? `Row ${parseError.rowNumber}, Column ${parseError.columnName}: ${parseError.message}`
            : parseError.message;

        if (this.emailNotifier) {
          await this.emailNotifier.sendParseError(filename, errorMsg);
        }

        result.errors.push({
          invoiceNumber: 'FILE_PARSE_ERROR',
          error: errorMsg,
          step: 'parse',
        });

        return result;
      }

      // Process each invoice
      for (const odooInvoice of odooInvoices) {
        try {
          // Map to ECF31
          const ecfData = mapOdooToECF31(odooInvoice, company);

          // Create invoice in database
          const createInput: CreateInvoiceInput = {
            company_id: this.companyId,
            numero_factura: odooInvoice.numero,
            numero_cliente: odooInvoice.nifCif,
            razon_social_cliente: odooInvoice.cliente,
            direccion_cliente: odooInvoice.direccionCliente,
            fecha_emision: odooInvoice.fechaFactura,
            fecha_vencimiento: odooInvoice.fechaVencimiento,
            subtotal: ecfData.totales.montoGravadoTotal,
            monto_gravado_i1: ecfData.totales.montoGravadoI1,
            monto_gravado_i2: ecfData.totales.montoGravadoI2,
            monto_gravado_i3: ecfData.totales.montoGravadoI3,
            itbis_1: ecfData.totales.itbis1,
            itbis_2: ecfData.totales.itbis2,
            itbis_3: ecfData.totales.itbis3,
            total: ecfData.totales.montoTotal,
            tipo_pago: ecfData.idDoc.tipoPago,
            tipo_ingresos: ecfData.idDoc.tipoIngresos,
          };

          const invoice = await createInvoice(createInput);
          result.processed++;
          result.successfulInvoices.push(invoice.id);

          // Log creation
          await appendAuditLog({
            invoice_id: invoice.id,
            action: 'created_from_file',
            estado_nuevo: 'pendiente',
            detalles: { filename, odooInvoiceNumber: odooInvoice.numero },
          });

          // Continue with next steps in the pipeline
          await this.continueProcessing(invoice, company, ecfData);
        } catch (error) {
          const errorMsg = String(error);
          result.errors.push({
            invoiceNumber: odooInvoice.numero,
            error: errorMsg,
            step: 'processing',
          });

          if (this.emailNotifier) {
            await this.emailNotifier.sendDGIIError(
              odooInvoice.numero,
              'UNKNOWN',
              errorMsg
            );
          }
        }
      }

      return result;
    } catch (error) {
      const errorMsg = String(error);
      result.errors.push({
        invoiceNumber: 'UNKNOWN',
        error: errorMsg,
        step: 'general',
      });

      return result;
    }
  }

  /**
   * Process a single invoice through the pipeline (from pendiente state)
   */
  async processInvoice(invoiceId: string): Promise<void> {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const company = await getCompanyConfigById(invoice.company_id);
    if (!company) {
      throw new Error('Company configuration not found');
    }

    try {
      // Get company config
      const sequence = await getSequenceByCompanyAndType(invoice.company_id, 31);
      if (!sequence) {
        throw new Error('No active NCF sequence found');
      }

      // Assign eNCF
      const encf = await assignNextENCF(invoice.company_id, 31);

      // Update invoice with eNCF
      await updateInvoiceState(invoiceId, 'xml_generado', {
        encf,
      });

      await appendAuditLog({
        invoice_id: invoiceId,
        action: 'encf_assigned',
        estado_anterior: 'pendiente',
        estado_nuevo: 'xml_generado',
        detalles: { encf },
      });

      // Fetch updated invoice
      const updatedInvoice = await getInvoice(invoiceId);
      if (!updatedInvoice) {
        throw new Error('Invoice not found after update');
      }

      // Build ECF data from invoice
      const ecfData = await this.buildECFDataFromInvoice(updatedInvoice, company);

      // Build XML
      const xmlContent = buildXML(ecfData, encf, company);

      await updateInvoiceState(invoiceId, 'xml_generado', {
        xml_content: xmlContent,
      });

      await appendAuditLog({
        invoice_id: invoiceId,
        action: 'xml_generated',
        estado_anterior: 'xml_generado',
        estado_nuevo: 'xml_generado',
      });

      // Sign XML
      const creds = await getSigningCredentials(company);
      const signedXml = await signXML(xmlContent, {
        p12Buffer: creds.buffer,
        p12Password: creds.password,
      });

      await updateInvoiceState(invoiceId, 'firmado', {
        xml_firmado: signedXml,
      });

      await appendAuditLog({
        invoice_id: invoiceId,
        action: 'xml_signed',
        estado_anterior: 'xml_generado',
        estado_nuevo: 'firmado',
      });

      // Send to DGII
      await this.sendToDGII(updatedInvoice, signedXml, company);
    } catch (error) {
      const errorMsg = String(error);

      await updateInvoiceState(invoiceId, 'error', {
        error_message: errorMsg,
      });

      await appendAuditLog({
        invoice_id: invoiceId,
        action: 'error',
        estado_anterior: invoice.estado,
        estado_nuevo: 'error',
        detalles: { error: errorMsg },
      });

      if (this.emailNotifier) {
        await this.emailNotifier.sendDGIIError(
          invoice.numero_factura,
          invoice.encf || 'UNKNOWN',
          errorMsg
        );
      }

      throw error;
    }
  }

  /**
   * Retry processing a failed invoice from its current state
   */
  async retryInvoice(invoiceId: string): Promise<void> {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const company = await getCompanyConfigById(invoice.company_id);
    if (!company) {
      throw new Error('Company configuration not found');
    }

    try {
      // Resume from current state
      if (invoice.estado === 'pendiente') {
        // Start from beginning
        await this.processInvoice(invoiceId);
      } else if (invoice.estado === 'xml_generado' && !invoice.xml_firmado) {
        // Sign and send
        const creds = await getSigningCredentials(company);
        const signedXml = await signXML(invoice.xml_content || '', {
          p12Buffer: creds.buffer,
          p12Password: creds.password,
        });

        await updateInvoiceState(invoiceId, 'firmado', {
          xml_firmado: signedXml,
        });

        await this.sendToDGII(invoice, signedXml, company);
      } else if (invoice.estado === 'firmado' && !invoice.track_id) {
        // Send to DGII
        await this.sendToDGII(invoice, invoice.xml_firmado || '', company);
      } else if (invoice.estado === 'enviado') {
        // Check status
        await this.pollInvoiceStatus(invoiceId);
      } else {
        throw new Error(`Cannot retry invoice in estado: ${invoice.estado}`);
      }
    } catch (error) {
      await incrementInvoiceRetryCount(invoiceId);
      throw error;
    }
  }

  /**
   * Poll DGII status and update invoice
   */
  async pollInvoiceStatus(invoiceId: string): Promise<void> {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (!invoice.track_id) {
      throw new Error('Invoice has no trackId');
    }

    const company = await getCompanyConfigById(invoice.company_id);
    if (!company) {
      throw new Error('Company configuration not found');
    }

    try {
      const creds = await getSigningCredentials(company);
      const dgiiClient = new DGIIClient(
        process.env.DGII_URL_BASE || 'https://ecf.dgii.gov.do/testecf',
        company.rnc,
        creds.buffer,
        creds.password
      );

      const status = await dgiiClient.getStatus(invoice.track_id);

      const statusRecord = status as unknown as Record<string, unknown>;
      if (status.estado === 'Aceptado') {
        await updateInvoiceState(invoiceId, 'aceptado', {
          estado_dgii: status.estado,
          respuesta_dgii: statusRecord,
        });

        await appendAuditLog({
          invoice_id: invoiceId,
          action: 'accepted_by_dgii',
          estado_anterior: 'enviado',
          estado_nuevo: 'aceptado',
          detalles: statusRecord,
        });
      } else if (status.estado === 'Rechazado') {
        await updateInvoiceState(invoiceId, 'rechazado', {
          estado_dgii: status.estado,
          respuesta_dgii: statusRecord,
        });

        await appendAuditLog({
          invoice_id: invoiceId,
          action: 'rejected_by_dgii',
          estado_anterior: 'enviado',
          estado_nuevo: 'rechazado',
          detalles: statusRecord,
        });

        if (this.emailNotifier && status.mensajes) {
          await this.emailNotifier.sendRejectionNotification(invoice, status.mensajes);
        }
      } else if (status.estado === 'En proceso') {
        // Still processing, increment retry count
        await incrementInvoiceRetryCount(invoiceId);
      } else if (status.estado === 'No encontrado') {
        // Not found, will retry
        await incrementInvoiceRetryCount(invoiceId);
      }
    } catch (error) {
      await incrementInvoiceRetryCount(invoiceId);

      if (invoice.intentos_envio >= 19) {
        // Max retries reached
        await updateInvoiceState(invoiceId, 'error', {
          error_message: `Max retries reached: ${String(error)}`,
        });
      }

      throw error;
    }
  }

  /**
   * Private helper: Continue processing after invoice creation
   */
  private async continueProcessing(invoice: Invoice, company: CompanyConfig, ecfData: ECF31Data) {
    try {
      // Assign eNCF
      const encf = await assignNextENCF(invoice.company_id, 31);

      // Fetch the active sequence to get fecha_vencimiento
      const activeSeq = await getActiveSequenceWithExpiry(invoice.company_id, 31);
      if (activeSeq && activeSeq.fecha_vencimiento) {
        const fv = new Date(activeSeq.fecha_vencimiento);
        if (!isNaN(fv.getTime())) {
          const dd = String(fv.getUTCDate()).padStart(2, '0');
          const mm = String(fv.getUTCMonth() + 1).padStart(2, '0');
          const yyyy = fv.getUTCFullYear();
          ecfData.idDoc.fechaVencimientoSecuencia = `${dd}-${mm}-${yyyy}`;
        }
      }

      await updateInvoiceState(invoice.id, 'xml_generado', {
        encf,
      });

      // Persist line items
      try {
        if (Array.isArray(ecfData.detallesItems) && ecfData.detallesItems.length > 0) {
          await createInvoiceLines(invoice.id, ecfData.detallesItems);
        }
      } catch (lineErr) {
        console.warn(
          `Warning: failed to persist invoice lines for invoice ${invoice.id}: ${String(lineErr)}`
        );
      }

      // Validate cuadratura (log warnings; don't fail)
      try {
        const validation = validateCuadratura(ecfData.detallesItems, ecfData.totales);
        if (!validation.isValid) {
          console.warn(
            `Cuadratura validation errors for invoice ${invoice.numero_factura}:`,
            validation.errors
          );
        }
        if (validation.warnings.length > 0) {
          console.warn(
            `Cuadratura validation warnings for invoice ${invoice.numero_factura}:`,
            validation.warnings
          );
        }
      } catch (vErr) {
        console.warn('Cuadratura validation threw:', String(vErr));
      }

      // Build XML
      const xmlContent = buildXML(ecfData, encf, company);

      await updateInvoiceState(invoice.id, 'xml_generado', {
        xml_content: xmlContent,
      });

      // Sign XML
      const creds = await getSigningCredentials(company);
      const signedXml = await signXML(xmlContent, {
        p12Buffer: creds.buffer,
        p12Password: creds.password,
      });

      await updateInvoiceState(invoice.id, 'firmado', {
        xml_firmado: signedXml,
      });

      // Send to DGII
      await this.sendToDGII(invoice, signedXml, company);
    } catch (error) {
      const errorMsg = String(error);

      await updateInvoiceState(invoice.id, 'error', {
        error_message: errorMsg,
      });

      if (this.emailNotifier) {
        await this.emailNotifier.sendDGIIError(invoice.numero_factura, invoice.encf || '', errorMsg);
      }

      throw error;
    }
  }

  /**
   * Private helper: Send to DGII
   */
  private async sendToDGII(invoice: Invoice, signedXml: string, company: CompanyConfig) {
    const creds = await getSigningCredentials(company);
    const dgiiClient = new DGIIClient(
      process.env.DGII_URL_BASE || 'https://ecf.dgii.gov.do/testecf',
      company.rnc,
      creds.buffer,
      creds.password
    );

    const response = await dgiiClient.sendECF(signedXml);

    await updateInvoiceWithDGIIResponse(invoice.id, response.trackId, {
      trackId: response.trackId,
      estado: response.estado,
      mensaje: response.mensaje,
    });

    await appendAuditLog({
      invoice_id: invoice.id,
      action: 'sent_to_dgii',
      estado_anterior: 'firmado',
      estado_nuevo: 'enviado',
      detalles: { trackId: response.trackId, estado: response.estado },
    });
  }

  /**
   * Private helper: Build ECF data from invoice
   */
  private async buildECFDataFromInvoice(invoice: Invoice, company: CompanyConfig) {
    // This would reconstruct ECF31Data from invoice fields
    // For now, we use the stored xml_content
    // In a real scenario, you'd regenerate this from the line items
    return {
      idDoc: {
        tipoECF: 31,
        eNCF: invoice.encf || '',
        fechaVencimientoSecuencia: '',
        indicadorEnvioDiferido: 0,
        indicadorMontoGravado: 0,
        tipoIngresos: invoice.tipo_ingresos || '01',
        tipoPago: invoice.tipo_pago,
        fechaLimitePago: invoice.fecha_vencimiento || invoice.fecha_emision,
        totalPaginas: 1,
        version: '1.0',
      },
      emisor: {
        rncEmisor: company.rnc,
        razonSocialEmisor: company.razon_social,
        nombreComercial: company.nombre_comercial || company.razon_social,
        direccionEmisor: company.direccion,
        fechaEmision: invoice.fecha_emision,
      },
      comprador: {
        rncComprador: invoice.numero_cliente,
        razonSocialComprador: invoice.razon_social_cliente,
        direccionComprador: invoice.direccion_cliente,
      },
      totales: {
        montoGravadoTotal:
          invoice.monto_gravado_i1 + invoice.monto_gravado_i2 + invoice.monto_gravado_i3,
        montoGravadoI1: invoice.monto_gravado_i1,
        montoGravadoI2: invoice.monto_gravado_i2,
        montoGravadoI3: invoice.monto_gravado_i3,
        itbis1: invoice.itbis_1,
        itbis2: invoice.itbis_2,
        itbis3: invoice.itbis_3,
        totalITBISRetenido: 0,
        totalISRRetencion: 0,
        montoTotal: invoice.total,
      },
      detallesItems: [],
    };
  }
}
