import { describe, it, expect, vi } from 'vitest';
import {
  OdooApiClient,
  OdooApiError,
  mapApiInvoiceToOdooInvoice,
  type ApiInvoice,
} from '@/lib/odoo/api-client';
import { mapOdooToECF31 } from '@/lib/odoo/mapper';
import type { CompanyConfig } from '@/lib/db/config';

const apiInvoice: ApiInvoice = {
  ncf: 'B0100000440',
  date: '2026-07-02',
  due_date: '2026-08-01',
  payment_term: '30 días',
  currency: 'DOP',
  untaxed: 254.56,
  total: 288.56,
  customer: {
    name: 'Farmacia Lucas',
    rnc: '131490735',
    address: 'Nagua, Nagua',
    country: 'República Dominicana',
  },
  lines: [
    {
      line: 1,
      product: 'PRUEBA DE EMBARAZO',
      description: 'PRUEBA DE EMBARAZO',
      quantity: 3,
      uom: 'Unidades',
      unit_price: 28,
      discount_pct: 0,
      tax: '', // exento
      subtotal: 84,
    },
    {
      line: 2,
      product: 'AGUJAS VARIADAS',
      description: 'AGUJAS VARIADAS',
      quantity: 3,
      uom: 'Unidades',
      unit_price: 11.52,
      discount_pct: 0,
      tax: '18% ITBIS',
      subtotal: 34.56,
    },
  ],
};

const company: CompanyConfig = {
  id: 'c1',
  rnc: '133273128',
  razon_social: 'Ynovi Comercial',
  nombre_comercial: 'Ynovi',
  direccion: 'Santo Domingo',
  tipo_ingresos: '01',
} as CompanyConfig;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('mapApiInvoiceToOdooInvoice', () => {
  it('maps API fields onto the OdooInvoice shape the mapper consumes', () => {
    const odoo = mapApiInvoiceToOdooInvoice(apiInvoice);

    expect(odoo.numero).toBe('B0100000440');
    expect(odoo.fechaFactura).toBe('2026-07-02');
    expect(odoo.fechaVencimiento).toBe('2026-08-01');
    expect(odoo.cliente).toBe('Farmacia Lucas');
    expect(odoo.nifCif).toBe('131490735');
    expect(odoo.plazoPago).toBe('30 días');
    expect(odoo.moneda).toBe('DOP');
    expect(odoo.lineas).toHaveLength(2);
    expect(odoo.lineas[0]).toMatchObject({
      numeroLinea: 1,
      producto: 'PRUEBA DE EMBARAZO',
      cantidad: 3,
      unidadMedida: 'Unidades',
      precioUnitario: 28,
      descuentoPorcentaje: 0,
      impuestos: '',
    });
    expect(odoo.lineas[1].impuestos).toBe('18% ITBIS');
  });

  it('falls back to the issue date when the API has no due date', () => {
    const odoo = mapApiInvoiceToOdooInvoice({ ...apiInvoice, due_date: null });
    expect(odoo.fechaVencimiento).toBe('2026-07-02');
  });

  it('produces an ECF31 document the existing mapper accepts (exempt + 18% ITBIS)', () => {
    const ecf = mapOdooToECF31(mapApiInvoiceToOdooInvoice(apiInvoice), company);

    // Spanish values from the API drive the existing string matching:
    expect(ecf.detallesItems[0].unidadMedida).toBe('99'); // "Unidades" -> Tabla IV 99
    expect(ecf.detallesItems[0].codigoITBIS).toBe(3); // "" -> exento
    expect(ecf.detallesItems[1].codigoITBIS).toBe(1); // "18% ITBIS" -> tasa 1
    expect(ecf.idDoc.tipoPago).toBe(2); // "30 días" -> CRÉDITO
    expect(ecf.comprador.rncComprador).toBe('131490735');
    expect(ecf.totales.montoGravadoI1).toBeCloseTo(34.56, 2);
    expect(ecf.totales.itbis1).toBeCloseTo(6.22, 2);
    expect(ecf.totales.montoGravadoI3).toBeCloseTo(84, 2);
  });
});

describe('OdooApiClient', () => {
  it('logs in and follows pagination across pages', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r' }))
      .mockResolvedValueOnce(
        jsonResponse({
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          total: 2,
          count: 1,
          offset: 0,
          invoices: [apiInvoice],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          total: 2,
          count: 1,
          offset: 1,
          invoices: [{ ...apiInvoice, ncf: 'B0100000441' }],
        })
      );

    const client = new OdooApiClient({
      baseUrl: 'https://api.test',
      username: 'u',
      password: 'p',
      fetchImpl,
    });

    const invoices = await client.getInvoices('2026-07-01', '2026-07-31');

    expect(invoices.map((i) => i.numero)).toEqual(['B0100000440', 'B0100000441']);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // login + 2 pages
  });

  it('re-authenticates once on a 401 and retries', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r' })) // login
      .mockResolvedValueOnce(jsonResponse({ detail: 'expired' }, 401)) // page -> 401
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a2', refresh_token: 'r2' })) // refresh
      .mockResolvedValueOnce(
        jsonResponse({
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          total: 1,
          count: 1,
          offset: 0,
          invoices: [apiInvoice],
        })
      );

    const client = new OdooApiClient({
      baseUrl: 'https://api.test',
      username: 'u',
      password: 'p',
      fetchImpl,
    });

    const invoices = await client.getInvoices('2026-07-01', '2026-07-31');
    expect(invoices).toHaveLength(1);
  });

  it('raises a descriptive error when the API rejects the request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r' }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'model not allowed' }, 403));

    const client = new OdooApiClient({
      baseUrl: 'https://api.test',
      username: 'u',
      password: 'p',
      fetchImpl,
    });

    await expect(client.getInvoices('2026-07-01', '2026-07-31')).rejects.toBeInstanceOf(
      OdooApiError
    );
  });
});
