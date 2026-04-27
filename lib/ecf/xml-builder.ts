import { create } from 'xmlbuilder2';
import { ECF31Data } from './types';
import { CompanyConfig } from '../db/config';
import { format } from 'date-fns';

/**
 * Build complete e-CF 31 XML according to DGII specification.
 *
 * NOTE: xmlbuilder2 v4 treats ele(string, string) as ele(namespaceURI, qualifiedName).
 * To set element text content, always use .ele('Name').txt(value).
 */
export function buildXML(data: ECF31Data, encf: string, _config: CompanyConfig): string {
  const now = new Date();
  const fechaHoraFirma = format(now, "yyyy-MM-dd'T'HH:mm:ss");

  const encabezado = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('ECF')
    .ele('Encabezado');

  // Version
  encabezado.ele('Version').txt('1.0');

  // IdDoc
  const idDoc = encabezado.ele('IdDoc');
  idDoc.ele('TipoeCF').txt('31');
  idDoc.ele('eNCF').txt(encf);
  idDoc.ele('FechaVencimientoSecuencia').txt(data.idDoc.fechaVencimientoSecuencia);
  idDoc.ele('IndicadorEnvioDiferido').txt(String(data.idDoc.indicadorEnvioDiferido));
  idDoc.ele('IndicadorMontoGravado').txt(String(data.idDoc.indicadorMontoGravado));
  idDoc.ele('TipoIngresos').txt(data.idDoc.tipoIngresos);
  idDoc.ele('TipoPago').txt(String(data.idDoc.tipoPago));
  idDoc.ele('FechaLimitePago').txt(data.idDoc.fechaLimitePago);
  idDoc.ele('TotalPaginas').txt(String(data.idDoc.totalPaginas));

  // Emisor
  const emisor = encabezado.ele('Emisor');
  emisor.ele('RNCEmisor').txt(data.emisor.rncEmisor);
  emisor.ele('RazonSocialEmisor').txt(data.emisor.razonSocialEmisor);
  emisor.ele('NombreComercial').txt(data.emisor.nombreComercial || data.emisor.razonSocialEmisor);
  emisor.ele('DireccionEmisor').txt(data.emisor.direccionEmisor);
  emisor.ele('FechaEmision').txt(data.emisor.fechaEmision);

  // Comprador
  const comprador = encabezado.ele('Comprador');
  comprador.ele('RNCComprador').txt(data.comprador.rncComprador);
  comprador.ele('RazonSocialComprador').txt(data.comprador.razonSocialComprador);
  comprador.ele('DireccionComprador').txt(data.comprador.direccionComprador);

  // Totales
  const totales = encabezado.ele('Totales');
  totales.ele('MontoGravadoTotal').txt(fmt(data.totales.montoGravadoTotal));
  totales.ele('MontoGravadoI1').txt(fmt(data.totales.montoGravadoI1));
  totales.ele('MontoGravadoI2').txt(fmt(data.totales.montoGravadoI2));
  totales.ele('MontoGravadoI3').txt(fmt(data.totales.montoGravadoI3));
  totales.ele('ITBIS1').txt(fmt(data.totales.itbis1));
  totales.ele('ITBIS2').txt(fmt(data.totales.itbis2));
  totales.ele('ITBIS3').txt(fmt(data.totales.itbis3));
  totales.ele('TotalITBISRetenido').txt(fmt(data.totales.totalITBISRetenido));
  totales.ele('TotalISRRetencion').txt(fmt(data.totales.totalISRRetencion));
  totales.ele('MontoTotal').txt(fmt(data.totales.montoTotal));

  // DetallesItems
  const detalles = encabezado.ele('DetallesItems');
  data.detallesItems.forEach((item) => {
    const itemEle = detalles.ele('Item').att('NumLinea', String(item.numeroLinea));
    itemEle.ele('NombreBienServicio').txt(item.nombreBienServicio);
    itemEle.ele('IndicadorBienOServicio').txt(String(item.indicadorBienOServicio));
    itemEle.ele('DescripcionItem').txt(item.descripcion || item.nombreBienServicio);
    itemEle.ele('CantidadItem').txt(fmt(item.cantidad));
    itemEle.ele('UnidadMedida').txt(item.unidadMedida);
    itemEle.ele('PrecioUnitarioItem').txt(fmt(item.precioUnitario));
    itemEle.ele('DescuentoMonto').txt(fmt(item.descuentoMonto));
    itemEle.ele('MontoItem').txt(fmt(item.montoItem));
    itemEle.ele('ITBIS').txt(fmt(item.itbis));
    itemEle.ele('CodigoITBIS').txt(String(item.codigoITBIS));
  });

  // FechaHoraFirma — sibling of DetallesItems inside Encabezado
  encabezado.ele('FechaHoraFirma').txt(fechaHoraFirma);

  return encabezado.end({ prettyPrint: false });
}

/** Format a number with exactly 2 decimal places */
function fmt(value: number): string {
  return value.toFixed(2);
}
