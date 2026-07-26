/**
 * Live invoice source: the Ynovi Odoo API.
 *
 * Replaces the manual XLSX/CSV export for fetching invoices — instead of a human
 * exporting from Odoo and uploading a file, we pull posted sales invoices for a date
 * range over HTTP. The API returns values in Spanish ("Unidades", "30 días",
 * "18% ITBIS") so `mapOdooToECF31` and its string-matching helpers work unchanged.
 *
 * Configure with:
 *   YNOVI_API_URL, YNOVI_API_USERNAME, YNOVI_API_PASSWORD
 */
import type { OdooInvoice } from './types';

/** Line as returned by GET /v1/dgii/invoices (snake_case keys, Spanish values). */
export interface ApiInvoiceLine {
  line: number;
  product: string;
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  discount_pct: number;
  tax: string;
  subtotal: number;
}

export interface ApiInvoice {
  ncf: string;
  date: string;
  due_date?: string | null;
  payment_term?: string | null;
  currency: string;
  untaxed: number;
  total: number;
  customer: {
    name: string;
    rnc?: string | null;
    address?: string | null;
    country?: string | null;
  };
  lines: ApiInvoiceLine[];
}

export interface ApiInvoicesResponse {
  date_from: string;
  date_to: string;
  total: number;
  count: number;
  offset: number;
  invoices: ApiInvoice[];
}

export class OdooApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'OdooApiError';
  }
}

/** Map the API shape onto the OdooInvoice the existing mapper consumes. */
export function mapApiInvoiceToOdooInvoice(inv: ApiInvoice): OdooInvoice {
  return {
    numero: inv.ncf,
    fechaFactura: inv.date,
    fechaVencimiento: inv.due_date ?? inv.date,
    cliente: inv.customer.name,
    nifCif: inv.customer.rnc ?? '',
    direccionCliente: inv.customer.address ?? '',
    paisCliente: inv.customer.country ?? '',
    plazoPago: inv.payment_term ?? '',
    moneda: inv.currency,
    subtotalTotal: inv.untaxed,
    montoTotal: inv.total,
    lineas: inv.lines.map((l) => ({
      numeroLinea: l.line,
      producto: l.product,
      descripcion: l.description,
      cantidad: l.quantity,
      unidadMedida: l.uom, // "Unidades" -> mapUoM -> '99'
      precioUnitario: l.unit_price,
      descuentoPorcentaje: l.discount_pct,
      impuestos: l.tax, // "18% ITBIS" | "" (exento)
      subtotal: l.subtotal,
    })),
  };
}

export interface OdooApiConfig {
  baseUrl: string;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
}

export class OdooApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private accessToken?: string;
  private refreshToken?: string;

  constructor(private readonly config: OdooApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  static fromEnv(fetchImpl?: typeof fetch): OdooApiClient {
    const baseUrl = process.env.YNOVI_API_URL;
    const username = process.env.YNOVI_API_USERNAME;
    const password = process.env.YNOVI_API_PASSWORD;
    if (!baseUrl || !username || !password) {
      throw new OdooApiError(
        'Faltan variables de entorno: YNOVI_API_URL, YNOVI_API_USERNAME, YNOVI_API_PASSWORD'
      );
    }
    return new OdooApiClient({ baseUrl, username, password, fetchImpl });
  }

  private async login(): Promise<void> {
    const body = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
    });
    const res = await this.fetchImpl(`${this.baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new OdooApiError(
        `No se pudo autenticar con la API de Odoo (HTTP ${res.status})`,
        res.status
      );
    }
    const tokens = (await res.json()) as { access_token: string; refresh_token: string };
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = (await res.json()) as { access_token: string; refresh_token: string };
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    return true;
  }

  private async getJson<T>(path: string): Promise<T> {
    if (!this.accessToken) await this.login();
    let res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (res.status === 401) {
      if (!(await this.tryRefresh())) await this.login();
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body?.detail) detail = body.detail;
      } catch {
        /* keep statusText */
      }
      throw new OdooApiError(`Error de la API de Odoo (HTTP ${res.status}): ${detail}`, res.status);
    }
    return (await res.json()) as T;
  }

  /** One page of posted sales invoices in [dateFrom, dateTo] (ISO YYYY-MM-DD). */
  async getInvoicesPage(dateFrom: string, dateTo: string, offset = 0): Promise<ApiInvoicesResponse> {
    const q = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, offset: String(offset) });
    return this.getJson<ApiInvoicesResponse>(`/v1/dgii/invoices?${q}`);
  }

  /** Every posted sales invoice in the range, following pagination. */
  async getInvoices(dateFrom: string, dateTo: string): Promise<OdooInvoice[]> {
    const all: OdooInvoice[] = [];
    let offset = 0;
    for (;;) {
      const page = await this.getInvoicesPage(dateFrom, dateTo, offset);
      all.push(...page.invoices.map(mapApiInvoiceToOdooInvoice));
      offset += page.count;
      if (page.count === 0 || all.length >= page.total) return all;
    }
  }
}
