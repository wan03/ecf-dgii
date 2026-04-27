'use client';

import { useEffect, useState } from 'react';

interface CompanyConfig {
  id?: string;
  rnc: string;
  razon_social: string;
  nombre_comercial?: string;
  direccion: string;
  telefono?: string;
  email?: string;
  tipo_ingresos?: string;
  certificado_path?: string;
  dgii_ambiente?: string;
}

interface NCFSequence {
  id: string;
  tipo_ecf: number;
  secuencia_inicial: string;
  secuencia_actual: string;
  secuencia_final: string;
  fecha_vencimiento: string;
  numero_autorizacion?: string;
  estado: string;
}

interface NewSequenceForm {
  secuencia_inicial: string;
  secuencia_final: string;
  fecha_vencimiento: string;
  numero_autorizacion: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<CompanyConfig>({
    rnc: '',
    razon_social: '',
    nombre_comercial: '',
    direccion: '',
    telefono: '',
    email: '',
    tipo_ingresos: '01',
    dgii_ambiente: 'certificacion',
  });
  const [sequences, setSequences] = useState<NCFSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [showNewSeq, setShowNewSeq] = useState(false);
  const [newSeq, setNewSeq] = useState<NewSequenceForm>({
    secuencia_inicial: 'E310000000001',
    secuencia_final: 'E310000999999',
    fecha_vencimiento: '',
    numero_autorizacion: '',
  });
  const [savingSeq, setSavingSeq] = useState(false);
  const [seqError, setSeqError] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (data.sequences) setSequences(data.sequences);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      setSaveMsg({ type: 'success', text: 'Configuración guardada correctamente.' });
      await fetchSettings();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error desconocido' });
    } finally {
      setSaving(false);
    }
  };

  const handleCertUpload = async () => {
    if (!certFile) return;
    setUploadingCert(true);
    try {
      const formData = new FormData();
      formData.append('certificate', certFile);
      const res = await fetch('/api/settings/certificate', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir certificado');
      setSaveMsg({ type: 'success', text: 'Certificado subido correctamente.' });
      setCertFile(null);
      await fetchSettings();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error al subir certificado' });
    } finally {
      setUploadingCert(false);
    }
  };

  const handleSaveSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSeq(true);
    setSeqError('');
    try {
      const res = await fetch('/api/settings/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSeq, tipo_ecf: 31 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar secuencia');
      setShowNewSeq(false);
      setNewSeq({ secuencia_inicial: 'E310000000001', secuencia_final: 'E310000999999', fecha_vencimiento: '', numero_autorizacion: '' });
      await fetchSettings();
    } catch (err) {
      setSeqError(err instanceof Error ? err.message : 'Error al guardar secuencia');
    } finally {
      setSavingSeq(false);
    }
  };

  const getRemainingCount = (seq: NCFSequence): number => {
    const current = parseInt(seq.secuencia_actual.slice(3), 10);
    const final = parseInt(seq.secuencia_final.slice(3), 10);
    return final - current;
  };

  const isExpiringSoon = (seq: NCFSequence): boolean => {
    const days = Math.floor((new Date(seq.fecha_vencimiento).getTime() - Date.now()) / 86400000);
    return days <= 30;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando configuración...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">Datos de la empresa, certificado digital y secuencias NCF</p>
      </div>

      {saveMsg && (
        <div
          data-testid={saveMsg.type === 'success' ? 'success-message' : 'rnc-error'}
          className={`rounded-lg p-4 ${saveMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
        >
          {saveMsg.text}
        </div>
      )}

      {/* Company Config */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Datos de la Empresa (Emisor)</h2>
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="RNC Emisor *" required>
              <input
                type="text"
                value={config.rnc}
                onChange={e => setConfig(c => ({ ...c, rnc: e.target.value }))}
                placeholder="101234567"
                maxLength={11}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                required
              />
            </Field>
            <Field label="Razón Social *" required>
              <input
                type="text"
                value={config.razon_social}
                onChange={e => setConfig(c => ({ ...c, razon_social: e.target.value }))}
                placeholder="Empresa S.A.S."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </Field>
            <Field label="Nombre Comercial">
              <input
                type="text"
                value={config.nombre_comercial || ''}
                onChange={e => setConfig(c => ({ ...c, nombre_comercial: e.target.value }))}
                placeholder="Mi Empresa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="Dirección *" required>
              <input
                type="text"
                value={config.direccion}
                onChange={e => setConfig(c => ({ ...c, direccion: e.target.value }))}
                placeholder="Calle Principal #1, Santo Domingo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="text"
                value={config.telefono || ''}
                onChange={e => setConfig(c => ({ ...c, telefono: e.target.value }))}
                placeholder="809-555-0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="Correo de Notificaciones">
              <input
                type="email"
                value={config.email || ''}
                onChange={e => setConfig(c => ({ ...c, email: e.target.value }))}
                placeholder="admin@empresa.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="Tipo de Ingresos (defecto)">
              <select
                value={config.tipo_ingresos === '01' || config.tipo_ingresos === '02' ? config.tipo_ingresos : '01'}
                onChange={e => setConfig(c => ({ ...c, tipo_ingresos: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="01">01 — Ingresos por Operaciones (No financieros)</option>
                <option value="02">02 — Ingresos Financieros</option>
              </select>
            </Field>
            <Field label="Ambiente DGII">
              <select
                value={config.dgii_ambiente || 'certificacion'}
                onChange={e => setConfig(c => ({ ...c, dgii_ambiente: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="certificacion">Certificación (Pruebas)</option>
                <option value="produccion">Producción</option>
              </select>
            </Field>
          </div>
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium"
            >
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>

      {/* Certificate */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Certificado Digital (.p12)</h2>
        <p className="text-gray-500 text-sm mb-4">
          Certificado emitido por una entidad acreditada por INDOTEL. La contraseña del certificado se configura en la variable de entorno <code className="bg-gray-100 px-1 rounded font-mono">CERT_PASSWORD</code> en Vercel.
        </p>
        {config.certificado_path && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-800 text-sm font-medium">Certificado cargado: <span className="font-mono">{config.certificado_path}</span></span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".p12,.pfx"
            onChange={e => setCertFile(e.target.files?.[0] || null)}
            data-testid="cert-input"
            className="block text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {certFile && (
            <button
              onClick={handleCertUpload}
              disabled={uploadingCert}
              data-testid="upload-cert-btn"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-sm font-medium"
            >
              {uploadingCert ? 'Subiendo...' : 'Subir Certificado'}
            </button>
          )}
          {config.certificado_path && (
            <span data-testid="cert-status" className="text-green-700 text-sm">cargado</span>
          )}
        </div>
      </div>

      {/* NCF Sequences */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Secuencias NCF</h2>
            <p className="text-gray-500 text-sm mt-1">Secuencias autorizadas por la DGII para e-CF tipo 31</p>
          </div>
          <button
            onClick={() => setShowNewSeq(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + Agregar Secuencia
          </button>
        </div>

        {showNewSeq && (
          <form onSubmit={handleSaveSequence} className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-blue-900 mb-3">Nueva Secuencia NCF</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="e-NCF Inicial">
                <input type="text" value={newSeq.secuencia_inicial} onChange={e => setNewSeq(s => ({ ...s, secuencia_inicial: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" placeholder="E310000000001" required />
              </Field>
              <Field label="e-NCF Final">
                <input type="text" value={newSeq.secuencia_final} onChange={e => setNewSeq(s => ({ ...s, secuencia_final: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" placeholder="E310000999999" required />
              </Field>
              <Field label="Fecha Vencimiento">
                <input type="date" value={newSeq.fecha_vencimiento} onChange={e => setNewSeq(s => ({ ...s, fecha_vencimiento: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </Field>
              <Field label="Número de Autorización">
                <input type="text" value={newSeq.numero_autorizacion} onChange={e => setNewSeq(s => ({ ...s, numero_autorizacion: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" placeholder="Opcional" />
              </Field>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={savingSeq} data-testid="save-sequence-btn"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium">
                {savingSeq ? 'Guardando...' : 'Guardar Secuencia'}
              </button>
              <button type="button" onClick={() => setShowNewSeq(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                Cancelar
              </button>
            </div>
            {seqError && (
              <div data-testid="seq-error" className="text-red-700 text-sm mt-2">{seqError}</div>
            )}
          </form>
        )}

        {sequences.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No hay secuencias configuradas. Agrega tu primera secuencia autorizada por la DGII.
          </div>
        ) : (
          <div className="space-y-3" data-testid="sequences-table">
            {sequences.map(seq => {
              const remaining = getRemainingCount(seq);
              const expiringSoon = isExpiringSoon(seq);
              const daysLeft = Math.floor((new Date(seq.fecha_vencimiento).getTime() - Date.now()) / 86400000);
              return (
                <div
                  key={seq.id}
                  data-testid="sequence-row"
                  className={`border rounded-lg p-4 ${expiringSoon ? 'border-yellow-300 bg-yellow-50' : remaining < 100 ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${seq.estado === 'activo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {seq.estado}
                        </span>
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {seq.secuencia_actual} → {seq.secuencia_final}
                        </span>
                        {(expiringSoon || remaining < 100) && (
                          <span data-testid="seq-alert-badge" className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            alerta
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Vence: <strong className={expiringSoon ? 'text-yellow-700' : ''}>{new Date(seq.fecha_vencimiento).toLocaleDateString('es-DO')} ({daysLeft} días)</strong></span>
                        <span>
                          Disponibles:{' '}
                          <strong
                            data-testid="seq-disponibles"
                            className={remaining < 100 ? 'text-orange-700' : 'text-gray-700'}
                          >
                            {remaining.toLocaleString()}
                          </strong>
                        </span>
                        {seq.numero_autorizacion && <span>Auth: <span className="font-mono">{seq.numero_autorizacion}</span></span>}
                      </div>
                    </div>
                  </div>
                  {expiringSoon && (
                    <div data-testid="seq-expiry-warning" className="mt-2 text-xs font-medium text-yellow-700">
                      Secuencia próxima a vencer — solicita renovación a DGII
                    </div>
                  )}
                  {!expiringSoon && remaining < 100 && (
                    <div className="mt-2 text-xs font-medium text-orange-700">
                      Pocas secuencias disponibles — solicita más a DGII
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">Variables de Entorno Requeridas en Vercel</h2>
        <div className="space-y-2 text-sm font-mono">
          {[
            ['NEXT_PUBLIC_SUPABASE_URL', 'URL de tu proyecto Supabase'],
            ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Clave anon de Supabase'],
            ['SUPABASE_SERVICE_ROLE_KEY', 'Clave service role de Supabase'],
            ['CERT_PASSWORD', 'Contraseña del certificado .p12'],
            ['DGII_URL_BASE', 'URL base DGII (test o prod)'],
            ['DGII_CRON_SECRET', 'Secret para proteger el endpoint cron'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{key}</span>
              <span className="text-blue-700 text-xs not-italic font-sans">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-blue-700 text-xs mt-4 font-sans">
          Las variables SMTP para email (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, NOTIFICATION_EMAIL) también pueden configurarse en Vercel.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
