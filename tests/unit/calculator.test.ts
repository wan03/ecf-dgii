import { describe, it, expect } from 'vitest';
import {
  roundDGII,
  calcularMontoItem,
  calcularITBIS,
  getCodigoFromTasa,
  validateCuadratura,
} from '@/lib/ecf/calculator';
import type { ECF31Line, ECF31Totales } from '@/lib/ecf/types';

describe('roundDGII', () => {
  it('rounds 1.005 to 1.01', () => {
    expect(roundDGII(1.005)).toBe(1.01);
  });

  it('keeps 1.004 at 1.00', () => {
    expect(roundDGII(1.004)).toBe(1.0);
  });

  it('rounds 1.125 to 1.13', () => {
    expect(roundDGII(1.125)).toBe(1.13);
  });
});

describe('calcularMontoItem', () => {
  it('handles plain qty * price', () => {
    expect(calcularMontoItem(2, 100, 0)).toBe(200);
  });

  it('applies discount percentage', () => {
    // 5 * 100 = 500, 10% off => 450
    expect(calcularMontoItem(5, 100, 10)).toBe(450);
  });

  it('rounds to 2 decimals', () => {
    expect(calcularMontoItem(3, 33.333, 0)).toBe(100);
  });
});

describe('getCodigoFromTasa', () => {
  it('returns 1 for 0.18', () => {
    expect(getCodigoFromTasa(0.18)).toBe(1);
  });
  it('returns 2 for 0.16', () => {
    expect(getCodigoFromTasa(0.16)).toBe(2);
  });
  it('returns 3 for 0', () => {
    expect(getCodigoFromTasa(0)).toBe(3);
  });
});

describe('calcularITBIS', () => {
  it('computes ITBIS for mixed-rate lines', () => {
    const lines: ECF31Line[] = [
      {
        numeroLinea: 1,
        nombreBienServicio: 'A',
        indicadorBienOServicio: 2,
        descripcion: 'A',
        cantidad: 1,
        unidadMedida: '99',
        precioUnitario: 1000,
        descuentoMonto: 0,
        montoItem: 1000,
        itbis: 180,
        codigoITBIS: 1,
      },
      {
        numeroLinea: 2,
        nombreBienServicio: 'B',
        indicadorBienOServicio: 2,
        descripcion: 'B',
        cantidad: 1,
        unidadMedida: '99',
        precioUnitario: 500,
        descuentoMonto: 0,
        montoItem: 500,
        itbis: 80,
        codigoITBIS: 2,
      },
      {
        numeroLinea: 3,
        nombreBienServicio: 'C',
        indicadorBienOServicio: 2,
        descripcion: 'C',
        cantidad: 1,
        unidadMedida: '99',
        precioUnitario: 250,
        descuentoMonto: 0,
        montoItem: 250,
        itbis: 0,
        codigoITBIS: 3,
      },
    ];

    const r = calcularITBIS(lines, false);
    expect(r.montoGravadoI1).toBe(1000);
    expect(r.itbis1).toBe(180);
    expect(r.montoGravadoI2).toBe(500);
    expect(r.itbis2).toBe(80);
    expect(r.montoGravadoI3).toBe(250);
    expect(r.itbis3).toBe(0);
    expect(r.totalITBIS).toBe(260);
    expect(r.montoGravadoTotal).toBe(1750);
  });
});

describe('validateCuadratura', () => {
  function buildLine(): ECF31Line {
    return {
      numeroLinea: 1,
      nombreBienServicio: 'X',
      indicadorBienOServicio: 2,
      descripcion: 'X',
      cantidad: 1,
      unidadMedida: '99',
      precioUnitario: 1000,
      descuentoMonto: 0,
      montoItem: 1000,
      itbis: 180,
      codigoITBIS: 1,
    };
  }

  it('passes for a balanced invoice', () => {
    const totales: ECF31Totales = {
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
    };
    const r = validateCuadratura([buildLine()], totales);
    expect(r.isValid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags totals mismatch', () => {
    const totales: ECF31Totales = {
      montoGravadoTotal: 1000,
      montoGravadoI1: 1000,
      montoGravadoI2: 0,
      montoGravadoI3: 0,
      itbis1: 180,
      itbis2: 0,
      itbis3: 0,
      totalITBISRetenido: 0,
      totalISRRetencion: 0,
      montoTotal: 9999, // wrong
    };
    const r = validateCuadratura([buildLine()], totales);
    expect(r.isValid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
