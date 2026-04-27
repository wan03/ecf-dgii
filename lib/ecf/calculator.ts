import {
  ECF31Line,
  ECF31Totales,
  ITBISResult,
  TasaITBIS,
  ValidationResult,
} from './types';

/**
 * Round to 2 decimal places using DGII rules
 * (3rd decimal >= 5 rounds up)
 */
export function roundDGII(value: number): number {
  // Add Number.EPSILON before multiplying to handle IEEE-754 edge cases
  // (e.g. 1.005 * 100 = 100.49999… without epsilon; with epsilon it rounds correctly)
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate the amount for a line item
 * Formula: (qty * unitPrice) * (1 - discount%)
 */
export function calcularMontoItem(
  qty: number,
  unitPrice: number,
  discountPct: number
): number {
  const subtotal = qty * unitPrice;
  const descuentoMonto = subtotal * (discountPct / 100);
  const monto = subtotal - descuentoMonto;
  return roundDGII(monto);
}

/**
 * Calculate ITBIS amounts based on line items
 * If indicadorMontoGravado = 1 (tax included in price):
 *   MontoGravado = MontoItem / (1 + tasa)
 * If indicadorMontoGravado = 0 (tax not included):
 *   MontoGravado = MontoItem
 *   ITBIS = MontoGravado * tasa
 */
export function calcularITBIS(
  lines: ECF31Line[],
  indicadorMontoGravado: boolean = false
): ITBISResult {
  let montoGravadoI1 = 0;
  let montoGravadoI2 = 0;
  let montoGravadoI3 = 0;
  let itbis1 = 0;
  let itbis2 = 0;
  let itbis3 = 0;

  lines.forEach((line) => {
    const tasa = getTasaFromCodigoITBIS(line.codigoITBIS);

    if (indicadorMontoGravado) {
      // Tax is included in price
      const montoGravado = roundDGII(line.montoItem / (1 + tasa));

      if (line.codigoITBIS === 1) {
        montoGravadoI1 += montoGravado;
        itbis1 += roundDGII(montoGravado * TasaITBIS.TASA1);
      } else if (line.codigoITBIS === 2) {
        montoGravadoI2 += montoGravado;
        itbis2 += roundDGII(montoGravado * TasaITBIS.TASA2);
      } else if (line.codigoITBIS === 3) {
        montoGravadoI3 += montoGravado;
        itbis3 += roundDGII(montoGravado * TasaITBIS.TASA3);
      }
    } else {
      // Tax is not included in price
      if (line.codigoITBIS === 1) {
        montoGravadoI1 += line.montoItem;
        itbis1 += roundDGII(line.montoItem * TasaITBIS.TASA1);
      } else if (line.codigoITBIS === 2) {
        montoGravadoI2 += line.montoItem;
        itbis2 += roundDGII(line.montoItem * TasaITBIS.TASA2);
      } else if (line.codigoITBIS === 3) {
        montoGravadoI3 += line.montoItem;
        itbis3 += roundDGII(line.montoItem * TasaITBIS.TASA3);
      }
    }
  });

  montoGravadoI1 = roundDGII(montoGravadoI1);
  montoGravadoI2 = roundDGII(montoGravadoI2);
  montoGravadoI3 = roundDGII(montoGravadoI3);
  itbis1 = roundDGII(itbis1);
  itbis2 = roundDGII(itbis2);
  itbis3 = roundDGII(itbis3);

  const montoGravadoTotal = roundDGII(montoGravadoI1 + montoGravadoI2 + montoGravadoI3);
  const totalITBIS = roundDGII(itbis1 + itbis2 + itbis3);

  return {
    montoGravadoI1,
    montoGravadoI2,
    montoGravadoI3,
    itbis1,
    itbis2,
    itbis3,
    totalITBIS,
    montoGravadoTotal,
  };
}

/**
 * Get ITBIS rate from codigo ITBIS (1, 2, or 3)
 */
function getTasaFromCodigoITBIS(codigo: number): number {
  switch (codigo) {
    case 1:
      return TasaITBIS.TASA1;
    case 2:
      return TasaITBIS.TASA2;
    case 3:
      return TasaITBIS.TASA3;
    default:
      return 0;
  }
}

/**
 * Get codigo ITBIS (1, 2, or 3) from rate
 */
export function getCodigoFromTasa(tasa: number): number {
  if (Math.abs(tasa - TasaITBIS.TASA1) < 0.001) {
    return 1;
  }
  if (Math.abs(tasa - TasaITBIS.TASA2) < 0.001) {
    return 2;
  }
  return 3; // TASA3 = 0
}

/**
 * Validate invoice cuadratura (balance)
 * Formula: MontoTotal = MontoGravadoTotal + ITBIS (when not included in prices)
 * Tolerance: ±0.01 per line (±1 centavo per line)
 */
export function validateCuadratura(
  lines: ECF31Line[],
  totals: ECF31Totales
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tolerance = lines.length * 0.01;

  // Calculate expected total ITBIS
  const expectedTotalITBIS = roundDGII(totals.itbis1 + totals.itbis2 + totals.itbis3);

  // Calculate expected monto gravado total
  const expectedMontoGravado = roundDGII(
    totals.montoGravadoI1 + totals.montoGravadoI2 + totals.montoGravadoI3
  );

  // Check monto gravado total
  if (Math.abs(expectedMontoGravado - totals.montoGravadoTotal) > tolerance) {
    errors.push(
      `Monto gravado total mismatch. Expected: ${expectedMontoGravado}, Got: ${totals.montoGravadoTotal}`
    );
  }

  // Check total ITBIS
  if (Math.abs(expectedTotalITBIS - totals.itbis1 - totals.itbis2 - totals.itbis3) > tolerance) {
    warnings.push(
      `ITBIS total mismatch. Expected: ${expectedTotalITBIS}, Got: ${roundDGII(totals.itbis1 + totals.itbis2 + totals.itbis3)}`
    );
  }

  // Check if total is reasonable
  const expectedTotal = roundDGII(totals.montoGravadoTotal + expectedTotalITBIS);
  if (Math.abs(expectedTotal - totals.montoTotal) > tolerance) {
    errors.push(
      `Total amount mismatch. Expected: ${expectedTotal}, Got: ${totals.montoTotal}`
    );
  }

  // Validate individual line totals sum to subtotal
  const sumLineMontosItem = roundDGII(lines.reduce((sum, line) => sum + line.montoItem, 0));
  const sumITBIS = roundDGII(lines.reduce((sum, line) => sum + line.itbis, 0));
  const calculatedSubtotal = roundDGII(sumLineMontosItem + sumITBIS);

  if (Math.abs(calculatedSubtotal - totals.montoTotal) > tolerance) {
    warnings.push(
      `Line items sum mismatch. Expected: ${calculatedSubtotal}, Got: ${totals.montoTotal}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
