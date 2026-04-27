import { describe, it, expect } from 'vitest';
import { mapOdooToECF31 } from '@/lib/odoo/mapper';
import type { OdooInvoice } from '@/lib/odoo/types';
import type { CompanyConfig } from '@/lib/db/config';
import { TipoPago } from '@/lib/ecf/types';

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

function baseInvoice(): OdooInvoice {
  return {
    numero: 'INV/01',
    fechaFactura: '2025-01-15',
    cliente: 'Cliente A',
    nifCif: '130123456',
    direccionCliente: 'Av. 1',
    paisCliente: 'RD',
    plazoPago: 'Contado',
    fechaVencimiento: '2025-02-15',
    moneda: 'DOP',
    lineas: [],
    subtotalTotal: 0,
    montoTotal: 0,
  };
}

describe('mapOdooToECF31', () => {
  it('maps 18% tax to codigo 1, 16% -> 2, exempt -> 3', () => {
    const inv = baseInvoice();
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 1000,
        descuentoPorcentaje: 0,
        impuestos: '18%',
        subtotal: 1000,
      },
      {
        numeroLinea: 2,
        producto: 'B',
        descripcion: 'B',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 500,
        descuentoPorcentaje: 0,
        impuestos: '16%',
        subtotal: 500,
      },
      {
        numeroLinea: 3,
        producto: 'C',
        descripcion: 'C',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 250,
        descuentoPorcentaje: 0,
        impuestos: 'Exento',
        subtotal: 250,
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.detallesItems[0].codigoITBIS).toBe(1);
    expect(out.detallesItems[1].codigoITBIS).toBe(2);
    expect(out.detallesItems[2].codigoITBIS).toBe(3);
    expect(out.totales.itbis1).toBe(180);
    expect(out.totales.itbis2).toBe(80);
    expect(out.totales.itbis3).toBe(0);
  });

  it('uses Contado for plazo "Contado"', () => {
    const inv = baseInvoice();
    inv.plazoPago = 'Contado';
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 100,
        descuentoPorcentaje: 0,
        impuestos: '18%',
        subtotal: 100,
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.idDoc.tipoPago).toBe(TipoPago.CONTADO);
  });

  it('uses Crédito for plazo "30 días"', () => {
    const inv = baseInvoice();
    inv.plazoPago = '30 días';
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 100,
        descuentoPorcentaje: 0,
        impuestos: '18%',
        subtotal: 100,
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.idDoc.tipoPago).toBe(TipoPago.CREDITO);
  });

  it('maps Kg unit of measure to "02"', () => {
    const inv = baseInvoice();
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: 'Kg',
        precioUnitario: 100,
        descuentoPorcentaje: 0,
        impuestos: '18%',
        subtotal: 100,
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.detallesItems[0].unidadMedida).toBe('02');
  });

  it('produces dd-MM-AAAA dates', () => {
    const inv = baseInvoice();
    inv.fechaFactura = '2025-03-04';
    inv.fechaVencimiento = '2025-04-05';
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: 'Unidades',
        precioUnitario: 100,
        descuentoPorcentaje: 0,
        impuestos: '18%',
        subtotal: 100,
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.emisor.fechaEmision).toBe('04-03-2025');
    expect(out.idDoc.fechaLimitePago).toBe('05-04-2025');
  });

  it('computes descuentoMonto from cantidad*precioUnitario, not subtotal', () => {
    const inv = baseInvoice();
    // 5 * 100 = 500, 10% discount => descuento 50
    inv.lineas = [
      {
        numeroLinea: 1,
        producto: 'A',
        descripcion: 'A',
        cantidad: 5,
        unidadMedida: 'Unidades',
        precioUnitario: 100,
        descuentoPorcentaje: 10,
        impuestos: '18%',
        subtotal: 450, // possibly already-discounted from Odoo
      },
    ];
    const out = mapOdooToECF31(inv, company);
    expect(out.detallesItems[0].descuentoMonto).toBe(50);
  });
});
