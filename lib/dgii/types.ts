export interface DGIIAuthResponse {
  token: string;
  expiration: string;
}

export interface DGIISendResponse {
  trackId: string;
  estado: string;
  mensaje?: string;
}

export interface DGIIStatusResponse {
  trackId: string;
  estado: 'En proceso' | 'Aceptado' | 'Rechazado' | 'No encontrado';
  mensajes?: DGIIMensaje[];
  codigoSeguridad?: string;
  fechaHoraFirma?: string;
}

export interface DGIIMensaje {
  codigo: string;
  descripcion: string;
  valor?: string;
}
