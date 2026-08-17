'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProcessError {
  invoiceNumber: string;
  error: string;
  step: string;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoFirstOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default function SyncPage() {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(isoFirstOfMonth());
  const [dateTo, setDateTo] = useState(isoToday());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    processed: number;
    errors: ProcessError[];
  } | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/invoices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo }),
      });

      const data = await response.json();
      setResult(data);

      if (response.ok && data.processed > 0 && data.errors.length === 0) {
        setTimeout(() => {
          router.push('/');
        }, 3000);
      }
    } catch (error) {
      setResult({
        processed: 0,
        errors: [
          {
            invoiceNumber: 'SYNC_ERROR',
            error: error instanceof Error ? error.message : 'Error desconocido',
            step: 'sync',
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Sincronizar desde Odoo
        </h1>
        <p className="text-gray-600 mt-2">
          Trae las facturas de venta emitidas en un rango de fechas directamente desde
          Odoo, sin exportar archivos.
        </p>
      </div>

      {/* Date range form */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700">
              Desde
            </label>
            <input
              id="dateFrom"
              data-testid="sync-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700">
              Hasta
            </label>
            <input
              id="dateTo"
              data-testid="sync-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {dateFrom > dateTo && (
          <p className="text-sm text-red-600">
            La fecha inicial no puede ser posterior a la final.
          </p>
        )}

        <button
          type="button"
          data-testid="sync-submit"
          onClick={handleSync}
          disabled={loading || dateFrom > dateTo}
          className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sincronizando…' : 'Sincronizar facturas'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {result.processed > 0 && (
            <div
              data-testid="result-message"
              className="bg-green-50 border border-green-200 rounded-lg p-6"
            >
              <h3 className="text-lg font-medium text-green-900">
                {result.processed} factura{result.processed !== 1 ? 's' : ''} procesada
                {result.processed !== 1 ? 's' : ''} exitosamente
              </h3>
              <p className="text-green-700 mt-1">
                Las facturas han sido creadas y serán procesadas automáticamente.
              </p>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="space-y-3" data-testid="error-list">
              <h3 className="text-lg font-semibold text-gray-900">
                Errores Encontrados ({result.errors.length})
              </h3>
              <div className="space-y-2">
                {result.errors.map((error, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded p-4">
                    <p className="font-medium text-red-900">{error.invoiceNumber}</p>
                    <p className="text-red-700 text-sm mt-1">{error.error}</p>
                    <p className="text-red-600 text-xs mt-1">Paso: {error.step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Sincronizar otro rango
          </button>
        </div>
      )}
    </div>
  );
}
