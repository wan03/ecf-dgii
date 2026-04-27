import { OdooInvoice } from './types';
import {
  ECF31Data,
  ECF31Header,
  ECF31Emisor,
  ECF31Comprador,
  ECF31Line,
  ECF31Totales,
  TipoPago,
} from '../ecf/types';
import { CompanyConfig } from '../db/config';
import { calcularMontoItem, roundDGII } from '../ecf/calculator';

/**
 * Unit of Measure mapping from Odoo names to DGII Tabla IV codes
 */
const UOM_MAPPING: Record<string, string> = {
  Unidades: '99',
  Kilogramos: '02',
  Kilogramo: '02',
  Kg: '02',
  Libras: '03',
  Libra: '03',
  Lb: '03',
  Lbs: '03',
  Litros: '04',
  Litro: '04',
  Lt: '04',
  L: '04',
  Metros: '58',
  Metro: '58',
  M: '58',
  Galones: '45',
  Galón: '45',
  Gal: '45',
  Horas: '59',
  Hora: '59',
  H: '59',
  Días: '35',
  Día: '35',
  D: '35',
  Pares: '25',
  Par: '25',
  Docenas: '40',
  Docena: '40',
  Cajas: '15',
  Caja: '15',
};

/**
 * Payment terms mapping to TipoPago
 * 'contado' or '0 días' -> CONTADO (1)
 * Otherwise -> CREDITO (2)
 */
function mapTipoPago(plazoPago: string): TipoPago {
  const normalized = plazoPago.toLowerCase().trim();
  // Use word-boundary check for "0 días" to avoid matching "30 días", "60 días", etc.
  const isZeroDays = /^0\s*(d[íi]as?)?$/.test(normalized);
  if (normalized.includes('contado') || isZeroDays) {
    return TipoPago.CONTADO;
  }
  return TipoPago.CREDITO;
}

/**
 * ITBIS tax rate mapping
 * '18%', 'ITBIS 18%' -> TASA1 (0.18), codigo 1
 * '16%', 'ITBIS 16%' -> TASA2 (0.16), codigo 2
 * '0%', 'Exento' -> TASA3 (0), codigo 3
 */
function mapTaxRateToCodigoITBIS(taxString: string): number {
  const normalized = taxString.toLowerCase();

  if (normalized.includes('18') || normalized.includes('itbis 18')) {
    return 1;
  }
  if (normalized.includes('16') || normalized.includes('itbis 16')) {
    return 2;
  }
  if (
    normalized.includes('0') ||
    normalized.includes('exento') ||
    normalized.includes('exempt') ||
    normalized === ''
  ) {
    return 3;
  }

  // Default to 18% if unsure
  return 1;
}

/**
 * Map Odoo UoM to DGII code
 */
function mapUoM(odooUom: string): string {
  const mapped = UOM_MAPPING[odooUom];
  if (mapped) {
    return mapped;
  }

  // Fallback to units
  return '99';
}

/**
 * Map OdooInvoice to ECF31Data
 */
export function mapOdooToECF31(
  odooInvoice: OdooInvoice,
  companyConfig: CompanyConfig
): ECF31Data {
  // Parse dates - Odoo dates are already in YYYY-MM-DD format from parser
  const fechaEmisionISO = odooInvoice.fechaFactura;
  const fechaVencimientoISO = odooInvoice.fechaVencimiento;

  // Format for ECF (dd-MM-AAAA)
  const [yearE, monthE, dayE] = fechaEmisionISO.split('-');
  const fechaEmisionECF = `${dayE}-${monthE}-${yearE}`;

  const [yearV, monthV, dayV] = fechaVencimientoISO.split('-');
  const fechaVencimientoECF = `${dayV}-${monthV}-${yearV}`;

  // Build detail items
  const detallesItems: ECF31Line[] = [];
  let montoGravadoI1 = 0;
  let montoGravadoI2 = 0;
  let montoGravadoI3 = 0;
  let itbis1 = 0;
  let itbis2 = 0;
  let itbis3 = 0;

  odooInvoice.lineas.forEach((linea, index) => {
    const numeroLinea = index + 1;
    const descuentoMonto = roundDGII(
      linea.cantidad * linea.precioUnitario * (linea.descuentoPorcentaje / 100)
    );
    const montoItem = calcularMontoItem(
      linea.cantidad,
      linea.precioUnitario,
      linea.descuentoPorcentaje
    );

    const codigoITBIS = mapTaxRateToCodigoITBIS(linea.impuestos);
    const tasa = codigoITBIS === 1 ? 0.18 : codigoITBIS === 2 ? 0.16 : 0;
    const itbis = roundDGII(montoItem * tasa);

    // Track monto gravado by tax rate
    if (codigoITBIS === 1) {
      montoGravadoI1 += montoItem;
      itbis1 += itbis;
    } else if (codigoITBIS === 2) {
      montoGravadoI2 += montoItem;
      itbis2 += itbis;
    } else if (codigoITBIS === 3) {
      montoGravadoI3 += montoItem;
      itbis3 += itbis;
    }

    const item: ECF31Line = {
      numeroLinea,
      nombreBienServicio: linea.producto,
      indicadorBienOServicio: 2, // Default to services
      descripcion: linea.descripcion || linea.producto,
      cantidad: linea.cantidad,
      unidadMedida: mapUoM(linea.unidadMedida),
      precioUnitario: roundDGII(linea.precioUnitario),
      descuentoMonto: descuentoMonto,
      montoItem: montoItem,
      itbis: itbis,
      codigoITBIS: codigoITBIS,
    };

    detallesItems.push(item);
  });

  // Round totals
  montoGravadoI1 = roundDGII(montoGravadoI1);
  montoGravadoI2 = roundDGII(montoGravadoI2);
  montoGravadoI3 = roundDGII(montoGravadoI3);
  itbis1 = roundDGII(itbis1);
  itbis2 = roundDGII(itbis2);
  itbis3 = roundDGII(itbis3);

  const montoGravadoTotal = roundDGII(montoGravadoI1 + montoGravadoI2 + montoGravadoI3);
  const totalITBIS = roundDGII(itbis1 + itbis2 + itbis3);
  const montoTotal = roundDGII(montoGravadoTotal + totalITBIS);

  const idDoc: ECF31Header = {
    tipoECF: 31,
    eNCF: '', // Will be assigned later
    fechaVencimientoSecuencia: '', // Will be assigned later
    indicadorEnvioDiferido: 0,
    indicadorMontoGravado: 0, // Tax not included in price
    tipoIngresos: companyConfig.tipo_ingresos || '01',
    tipoPago: mapTipoPago(odooInvoice.plazoPago),
    fechaLimitePago: fechaVencimientoECF,
    totalPaginas: 1,
    version: '1.0',
  };

  const emisor: ECF31Emisor = {
    rncEmisor: companyConfig.rnc,
    razonSocialEmisor: companyConfig.razon_social,
    nombreComercial: companyConfig.nombre_comercial || companyConfig.razon_social,
    direccionEmisor: companyConfig.direccion,
    fechaEmision: fechaEmisionECF,
  };

  const comprador: ECF31Comprador = {
    rncComprador: odooInvoice.nifCif,
    razonSocialComprador: odooInvoice.cliente,
    direccionComprador: odooInvoice.direccionCliente,
  };

  const totales: ECF31Totales = {
    montoGravadoTotal,
    montoGravadoI1,
    montoGravadoI2,
    montoGravadoI3,
    itbis1,
    itbis2,
    itbis3,
    totalITBISRetenido: 0,
    totalISRRetencion: 0,
    montoTotal,
  };

  return {
    idDoc,
    emisor,
    comprador,
    totales,
    detallesItems,
  };
}
