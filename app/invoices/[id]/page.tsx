'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Invoice } from '@/lib/db/invoices';
import InvoiceStatusBadge from '@/components/InvoiceStatusBadge';

interface AuditLog {
  id: string;
  action: string;
  estado_anterior?: string;
  estado_nuevo?: string;
  detalles?: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  created_from_file: 'Creada desde archivo',
  encf_assigned: 'e-NCF asignado',
  xml_generated: 'XML generado',
  xml_signed: 'XML firmado',
  sent_to_dgii: 'Enviada a DGII',
  accepted_by_dgii: 'Aceptada por DGII',
  rejected_by_dgii: 'Rechazada por DGII',
  error: 'Error',
  retry_attempted: 'Reintento',
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'xml'>('general');
  const [retrying, setRetrying] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      setNotFound(false);
      const res = await fetch(`/api/invoices/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        throw new Error('Factura no encontrada');
      }
      if (!res.ok) throw new Error('No se pudo cargar la factura');
      const data = await res.json();
      setInvoice(data.invoice);
      setAuditLog(data.auditLog || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInvoice(); }, [id]);

  const handleRetry = async () => {
    if (!invoice) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/invoices/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reintentar');
      await fetchInvoice();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reintentar');
    } finally {
      setRetrying(false);
    }
  };

  const canRetry = invoice && ['error', 'rechazado', 'firmado', 'xml_generado'].includes(invoice.estado);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Cargando factura...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div data-testid="not-found" className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">Factura no encontrada</p>
        </div>
        <Link href="/" className="text-blue-600 hover:underline">← Volver al Dashboard</Link>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">{error || 'Factura no encontrada'}</p>
        </div>
        <Link href="/" className="text-blue-600 hover:underline">← Volver al Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="numero-factura">
            Factura {invoice.numero_factura}
          </h1>
          {invoice.encf && (
            <p className="text-gray-500 font-mono mt-1" data-testid="encf">{invoice.encf}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              data-testid="retry-btn"
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-orange-300 transition-colors font-medium"
            >
              {retrying ? 'Reintentando...' : '↻ Reintentar'}
            </button>
          )}
          <button
            onClick={fetchInvoice}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg p-4 flex items-center justify-between ${
        invoice.estado === 'aceptado' ? 'bg-green-50 border border-green-200' :
        invoice.estado === 'rechazado' || invoice.estado === 'error' ? 'bg-red-50 border border-red-200' :
        invoice.estado === 'enviado' ? 'bg-yellow-50 border border-yellow-200' :
        'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          <InvoiceStatusBadge estado={invoice.estado} />
          {invoice.estado_dgii && (
            <span className="text-gray-600 text-sm">DGII: {invoice.estado_dgii}</span>
          )}
        </div>
        {invoice.track_id && (
          <span className="text-gray-500 text-xs font-mono">TrackID: {invoice.track_id}</span>
        )}
      </div>

      {/* Error message */}
      {invoice.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium text-sm mb-1">Último error:</p>
          <p className="text-red-700 text-sm font-mono">{invoice.error_message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Vista General
          </button>
          <button
            onClick={() => setActiveTab('xml')}
            data-testid="tab-xml"
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'xml'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            XML Firmado
          </button>
        </nav>
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invoice Info */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Información del Documento</h2>
            <InfoRow label="Número Odoo" value={invoice.numero_factura} />
            <InfoRow label="e-NCF" value={invoice.encf || '—'} mono />
            <InfoRow label="Fecha Emisión" value={fmtDate(invoice.fecha_emision)} testId="fecha-emision" />
            <InfoRow label="Fecha Vencimiento" value={invoice.fecha_vencimiento ? fmtDate(invoice.fecha_vencimiento) : '—'} />
            <InfoRow
              label="Tipo Pago"
              value={invoice.tipo_pago === 1 ? 'Contado' : invoice.tipo_pago === 2 ? 'Crédito' : 'Gratuito'}
              testId="tipo-pago"
            />
            <InfoRow label="Tipo Ingresos" value={invoice.tipo_ingresos || '01'} />
            <InfoRow label="Intentos de envío" value={String(invoice.intentos_envio)} />
          </div>

          {/* Buyer Info */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Comprador</h2>
            <InfoRow label="RNC / Cédula" value={invoice.numero_cliente || '—'} mono />
            <InfoRow
              label="Razón Social"
              value={invoice.razon_social_cliente || '—'}
              testId="razon-social-cliente"
            />
            <InfoRow label="Dirección" value={invoice.direccion_cliente || '—'} />
          </div>

          {/* Totals */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Montos</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <AmountCard
                label="Base Gravada (18%)"
                value={invoice.monto_gravado_i1}
                testId="monto-gravado-i1"
              />
              <AmountCard label="ITBIS 18%" value={invoice.itbis_1} highlight testId="itbis-1" />
              <AmountCard label="Base Gravada (16%)" value={invoice.monto_gravado_i2} />
              <AmountCard label="ITBIS 16%" value={invoice.itbis_2} highlight />
            </div>
            <div className="mt-4 pt-4 border-t flex justify-end">
              <div className="text-right">
                <div className="text-gray-500 text-sm">Total ITBIS</div>
                <div className="text-xl font-bold text-blue-700">
                  RD$ {((invoice.itbis_1 || 0) + (invoice.itbis_2 || 0)).toFixed(2)}
                </div>
              </div>
              <div className="text-right ml-8">
                <div className="text-gray-500 text-sm">Monto Total</div>
                <div className="text-2xl font-bold text-gray-900" data-testid="total">
                  RD$ {(invoice.total || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Historial de Estados</h2>
            {auditLog.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin registros de auditoría</p>
            ) : (
              <div className="space-y-3" data-testid="audit-log">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-4 text-sm"
                    data-testid="audit-entry"
                  >
                    <div className="text-gray-400 text-xs font-mono whitespace-nowrap pt-0.5 w-36 shrink-0">
                      {new Date(entry.created_at).toLocaleString('es-DO')}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                        {entry.estado_nuevo && (
                          <InvoiceStatusBadge
                            estado={entry.estado_nuevo}
                            testId="audit-state-badge"
                          />
                        )}
                      </div>
                      {entry.detalles && Object.keys(entry.detalles).length > 0 && (
                        <pre className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(entry.detalles, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'xml' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">XML Firmado</h2>
            {invoice.xml_firmado && (
              <button
                onClick={() => {
                  const blob = new Blob([invoice.xml_firmado!], { type: 'application/xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${invoice.encf || invoice.numero_factura}.xml`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                data-testid="download-xml-btn"
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                ↓ Descargar XML
              </button>
            )}
          </div>
          {invoice.xml_firmado ? (
            <pre
              data-testid="xml-content"
              className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto overflow-y-auto max-h-[600px] font-mono whitespace-pre-wrap"
            >
              {formatXML(invoice.xml_firmado)}
            </pre>
          ) : invoice.xml_content ? (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800 text-sm">
                XML generado pero aún no firmado.
              </div>
              <pre
                data-testid="xml-content"
                className="bg-gray-900 text-yellow-300 text-xs p-4 rounded-lg overflow-x-auto overflow-y-auto max-h-[600px] font-mono whitespace-pre-wrap"
              >
                {formatXML(invoice.xml_content)}
              </pre>
            </div>
          ) : (
            <div className="text-gray-500 text-sm py-8 text-center">
              El XML aún no ha sido generado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-500 text-sm shrink-0">{label}</span>
      <span
        data-testid={testId}
        className={`text-gray-900 text-sm text-right ${mono ? 'font-mono' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
  );
}

function AmountCard({
  label,
  value,
  highlight = false,
  testId,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  testId?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div
        data-testid={testId}
        className={`text-lg font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}
      >
        RD$ {(value || 0).toFixed(2)}
      </div>
    </div>
  );
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatXML(xml: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = xml.replace(/>\s*</g, '>\n<').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('</')) indent = Math.max(0, indent - 1);
      formatted += '  '.repeat(indent) + trimmed + '\n';
      if (!trimmed.startsWith('</') && !trimmed.endsWith('/>') && trimmed.includes('<') && !trimmed.includes('</')) {
        indent++;
      }
    }
    return formatted;
  } catch {
    return xml;
  }
}
