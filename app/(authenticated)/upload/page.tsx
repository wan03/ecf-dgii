'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadZone from '@/components/UploadZone';

interface ProcessError {
  invoiceNumber: string;
  error: string;
  step: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    processed: number;
    errors: ProcessError[];
  } | null>(null);
  const handleUpload = async (file: File) => {
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
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
            invoiceNumber: 'UPLOAD_ERROR',
            error: error instanceof Error ? error.message : 'Error desconocido',
            step: 'upload',
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Subir Facturas</h1>
        <p className="text-gray-600 mt-2">
          Carga un archivo exportado desde Odoo para procesarlo automáticamente
        </p>
      </div>

      {/* Upload Zone or Results */}
      {!result ? (
        <div className="bg-white rounded-lg shadow p-8">
          <UploadZone onUpload={handleUpload} isLoading={loading} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Success Summary */}
          {result.processed > 0 && (
            <div data-testid="result-message" className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-start">
                <svg
                  className="w-6 h-6 text-green-600 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-green-900">
                    {result.processed} factura{result.processed !== 1 ? 's' : ''} procesada{result.processed !== 1 ? 's' : ''} exitosamente
                  </h3>
                  <p className="text-green-700 mt-1">
                    Las facturas han sido creadas y serán procesadas automáticamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="space-y-3" data-testid="error-list">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <svg
                  className="w-6 h-6 text-red-600 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Errores Encontrados ({result.errors.length})
              </h3>
              <div className="space-y-2">
                {result.errors.map((error, idx) => (
                  <div
                    key={idx}
                    className="bg-red-50 border border-red-200 rounded p-4"
                  >
                    <p className="font-medium text-red-900">
                      {error.invoiceNumber}
                    </p>
                    <p className="text-red-700 text-sm mt-1">{error.error}</p>
                    <p className="text-red-600 text-xs mt-1">Paso: {error.step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setResult(null);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Subir Otro Archivo
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Volver al Dashboard
            </button>
          </div>

          {result.processed > 0 && result.errors.length === 0 && (
            <div className="text-center text-gray-600 text-sm">
              Redirigiendo al dashboard en 3 segundos...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
