export enum TasaITBIS {
  TASA1 = 0.18,
  TASA2 = 0.16,
  TASA3 = 0,
}

export enum TipoPago {
  CONTADO = 1,
  CREDITO = 2,
  GRATUITO = 3,
}

export enum TipoIngresos {
  ORDINARIOS = '01',
  EXTRAORDINARIOS = '02',
}

export interface ITBISResult {
  montoGravadoI1: number;
  montoGravadoI2: number;
  montoGravadoI3: number;
  itbis1: number;
  itbis2: number;
  itbis3: number;
  totalITBIS: number;
  montoGravadoTotal: number;
}

export interface ECF31Line {
  numeroLinea: number;
  nombreBienServicio: string;
  indicadorBienOServicio: number; // 1 for goods, 2 for services
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuentoMonto: number;
  montoItem: number;
  itbis: number;
  codigoITBIS: number; // 1=18%, 2=16%, 3=0%
}

export interface ECF31Totales {
  montoGravadoTotal: number;
  montoGravadoI1: number;
  montoGravadoI2: number;
  montoGravadoI3: number;
  itbis1: number;
  itbis2: number;
  itbis3: number;
  totalITBISRetenido: number;
  totalISRRetencion: number;
  montoTotal: number;
}

export interface ECF31Header {
  tipoECF: number; // Always 31
  eNCF: string;
  fechaVencimientoSecuencia: string;
  indicadorEnvioDiferido: number; // 0 = immediate
  indicadorMontoGravado: number; // 0 or 1
  tipoIngresos: string; // '01' or '02'
  tipoPago: TipoPago;
  fechaLimitePago: string;
  totalPaginas: number;
  version: string; // '1.0'
}

export interface ECF31Emisor {
  rncEmisor: string;
  razonSocialEmisor: string;
  nombreComercial: string;
  direccionEmisor: string;
  fechaEmision: string; // dd-MM-AAAA format
}

export interface ECF31Comprador {
  rncComprador: string;
  razonSocialComprador: string;
  direccionComprador: string;
}

export interface ECF31Data {
  idDoc: ECF31Header;
  emisor: ECF31Emisor;
  comprador: ECF31Comprador;
  totales: ECF31Totales;
  detallesItems: ECF31Line[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
