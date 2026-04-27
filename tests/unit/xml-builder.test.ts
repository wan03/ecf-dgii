import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { buildXML } from '@/lib/ecf/xml-builder';
import type { ECF31Data } from '@/lib/ecf/types';
import type { CompanyConfig } from '@/lib/db/config';

const company: CompanyConfig = {
  id: 'co-1',
  rnc: '101234567',
  razon_social: 'Empresa Test S.R.L.',
  nombre_comercial: 'Test',
  direccion: 'Calle Falsa #1',
  tipo_ingresos: '01',
  created_at: '',
  updated_at: '',
};

function buildData(): ECF31Data {
  return {
    idDoc: {
      tipoECF: 31,
      eNCF: 'E310000000001',
      fechaVencimientoSecuencia: '31-12-2026',
      indicadorEnvioDiferido: 0,
      indicadorMontoGravado: 0,
      tipoIngresos: '01',
      tipoPago: 1,
      fechaLimitePago: '15-01-2025',
      totalPaginas: 1,
      version: '1.0',
    },
    emisor: {
      rncEmisor: '101234567',
      razonSocialEmisor: 'Empresa Test S.R.L.',
      nombreComercial: 'Test',
      direccionEmisor: 'Calle 1',
      fechaEmision: '15-01-2025',
    },
    comprador: {
      rncComprador: '130123456',
      razonSocialComprador: 'Cliente A',
      direccionComprador: 'Av. 1',
    },
    totales: {
      montoGravadoTotal: 1000,
      montoGravadoI1: 1000,
      montoGravadoI2: 0,
      montoGravadoI3: 0,
      itbis1: 180,
      itbis2: 0,
      itbis3: 0,
      totalITBISRetenido: 0,
      totalISRRetencion: 0,
      montoTotal: 1180,
    },
    detallesItems: [
      {
        numeroLinea: 1,
        nombreBienServicio: 'Servicio',
        indicadorBienOServicio: 2,
        descripcion: 'Servicio test',
        cantidad: 1,
        unidadMedida: '99',
        precioUnitario: 1000,
        descuentoMonto: 0,
        montoItem: 1000,
        itbis: 180,
        codigoITBIS: 1,
      },
    ],
  };
}

describe('buildXML', () => {
  it('produces parseable XML with the expected structure', () => {
    const data = buildData();
    const xml = buildXML(data, 'E310000000001', company);

    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.documentElement?.nodeName).toBe('ECF');

    const encf = doc.getElementsByTagName('eNCF')[0];
    expect(encf.textContent).toBe('E310000000001');

    const tipoECF = doc.getElementsByTagName('TipoeCF')[0];
    expect(tipoECF.textContent).toBe('31');

    const items = doc.getElementsByTagName('Item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('NumLinea')).toBe('1');
  });

  it('formats decimals to exactly 2 places', () => {
    const data = buildData();
    const xml = buildXML(data, 'E310000000001', company);
    expect(xml).toMatch(/<MontoTotal>1180\.00<\/MontoTotal>/);
    expect(xml).toMatch(/<ITBIS1>180\.00<\/ITBIS1>/);
    expect(xml).toMatch(/<MontoItem>1000\.00<\/MontoItem>/);
  });

  it('does not contain extraneous whitespace between tags', () => {
    const data = buildData();
    const xml = buildXML(data, 'E310000000001', company);
    expect(xml).not.toMatch(/>\s+</);
  });
});
