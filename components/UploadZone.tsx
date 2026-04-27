'use client';

import { useRef, useState } from 'react';

interface Props {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

export default function UploadZone({ onUpload, isLoading }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isValidFile(file)) {
        setFileName(file.name);
        onUpload(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isValidFile(file)) {
        setFileName(file.name);
        onUpload(file);
      }
    }
  };

  const isValidFile = (file: File): boolean => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];

    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidType && !hasValidExtension) {
      setFileError('Por favor, selecciona un archivo .xlsx o .csv');
      return false;
    }

    setFileError('');
    return true;
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-blue-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors bg-blue-50"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isLoading}
        data-testid="file-input"
      />

      <svg
        className="w-16 h-16 mx-auto text-blue-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
        />
      </svg>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Arrastra tu archivo aquí o haz clic
      </h3>
      <p className="text-gray-600 mb-6">
        Acepta archivos .xlsx o .csv exportados desde Odoo
      </p>

      {fileName && (
        <p data-testid="file-name" className="text-sm text-gray-700 mb-3">
          Archivo: <span className="font-mono">{fileName}</span>
        </p>
      )}

      {fileError && (
        <p data-testid="file-error" className="text-sm text-red-600 mb-3">
          {fileError}
        </p>
      )}

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
        data-testid="process-btn"
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
      >
        {isLoading ? 'Procesando...' : 'Seleccionar Archivo'}
      </button>

      <div className="mt-6 text-sm text-gray-600">
        <p className="font-medium mb-2">Columnas requeridas de Odoo:</p>
        <ul className="text-left inline-block">
          <li>• Número de factura</li>
          <li>• Fecha de emisión</li>
          <li>• Cliente / Razón Social</li>
          <li>• RNC / NIF del cliente</li>
          <li>• Dirección</li>
          <li>• Montos (subtotal, ITBIS, total)</li>
        </ul>
      </div>
    </div>
  );
}
