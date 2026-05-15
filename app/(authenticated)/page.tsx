'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Invoice } from '@/lib/db/invoices';
import InvoiceStatusBadge from '@/components/InvoiceStatusBadge';

type EstadoFilter = '' | 'pendiente' | 'xml_generado' | 'firmado' | 'enviado' | 'aceptado' | 'rechazado' | 'error';

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('');
  const [refreshing, setRefreshing] = useState(false);

  // AbortController ref to cancel in-flight requests when a new one starts
  const abortRef = useRef<AbortController | null>(null);

  const fetchInvoices = async (estado?: string) => {
    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (estado && estado !== '') {
        params.append('estado', estado);
      }
      const response = await fetch(`/api/invoices?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      setInvoices(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Cancelled — a newer request is in flight; ignore
        return;
      }
      setError(err instanceof Error ? err.message : 'Error fetching invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEstadoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as EstadoFilter;
    setEstadoFilter(value);
    fetchInvoices(value);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInvoices(estadoFilter);
    setRefreshing(false);
  };

  // Calculate statistics
  const stats = {
    total: invoices.length,
    aceptadas: invoices.filter((i) => i.estado === 'aceptado').length,
    pendientes: invoices.filter((i) => ['pendiente', 'xml_generado', 'firmado'].includes(i.estado)).length,
    enviadas: invoices.filter((i) => i.estado === 'enviado').length,
    errores: invoices.filter((i) => ['error', 'rechazado'].includes(i.estado)).length,
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Resumen de facturas electrónicas</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 transition-colors text-center font-medium"
          >
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <Link
            href="/upload"
            className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
          >
            Subir Facturas
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="stat-total">
          <div className="text-gray-600 text-xs sm:text-sm font-medium">Total</div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="stat-aceptadas">
          <div className="text-gray-600 text-xs sm:text-sm font-medium">Aceptadas</div>
          <div className="text-2xl sm:text-3xl font-bold text-green-600 mt-2">{stats.aceptadas}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="stat-en-proceso">
          <div className="text-gray-600 text-xs sm:text-sm font-medium">En Proceso</div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{stats.pendientes}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="text-gray-600 text-xs sm:text-sm font-medium">Enviadas</div>
          <div className="text-2xl sm:text-3xl font-bold text-yellow-600 mt-2">{stats.enviadas}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 col-span-2 sm:col-span-1" data-testid="stat-errores">
          <div className="text-gray-600 text-xs sm:text-sm font-medium">Errores</div>
          <div className="text-2xl sm:text-3xl font-bold text-red-600 mt-2">{stats.errores}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filtrar por Estado
        </label>
        <select
          value={estadoFilter}
          onChange={handleEstadoChange}
          data-testid="estado-filter"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="xml_generado">XML Generado</option>
          <option value="firmado">Firmado</option>
          <option value="enviado">Enviado</option>
          <option value="aceptado">Aceptado</option>
          <option value="rechazado">Rechazado</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* Invoices — empty/loading/error states */}
      <div data-testid="invoices-table">
        {loading ? (
          <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
            Cargando facturas...
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-red-600">
            Error: {error}
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
            No hay facturas
          </div>
        ) : (
          <>
            {/* Mobile: card list (no testids — e2e tests target the desktop table) */}
            <div className="md:hidden space-y-3" aria-hidden="false">
              {invoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  data-invoice-id={invoice.id}
                  className="block bg-white rounded-lg shadow p-4 active:bg-gray-50 transition-colors min-h-[80px]"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className="font-semibold text-gray-900 text-sm truncate">
                      {invoice.numero_factura}
                    </span>
                    <InvoiceStatusBadge estado={invoice.estado} />
                  </div>
                  <div className="text-xs text-gray-500 font-mono truncate">
                    {invoice.encf || '-'}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 flex items-center justify-between gap-3">
                    <span>{new Date(invoice.fecha_emision).toLocaleDateString('es-DO')}</span>
                    <span className="font-mono">{invoice.numero_cliente}</span>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-lg font-bold text-gray-900">
                      RD$ {invoice.total.toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Número Factura
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        e-NCF
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        RNC Comprador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Monto Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="hover:bg-gray-50 transition-colors"
                        data-testid="invoice-row"
                        data-invoice-id={invoice.id}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.numero_factura}
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap text-sm text-gray-600"
                          data-testid="encf-cell"
                        >
                          {invoice.encf || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {new Date(invoice.fecha_emision).toLocaleDateString('es-DO')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {invoice.numero_cliente}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          RD$ {invoice.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <InvoiceStatusBadge estado={invoice.estado} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
