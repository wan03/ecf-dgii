interface Props {
  estado: string;
  testId?: string;
}

export default function InvoiceStatusBadge({ estado, testId = 'status-badge' }: Props) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    pendiente: { bg: 'bg-gray-100', text: 'text-gray-800' },
    xml_generado: { bg: 'bg-blue-100', text: 'text-blue-800' },
    firmado: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    enviado: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    aceptado: { bg: 'bg-green-100', text: 'text-green-800' },
    rechazado: { bg: 'bg-red-100', text: 'text-red-800' },
    error: { bg: 'bg-red-100', text: 'text-red-800' },
  };

  const colors = colorMap[estado] || colorMap.pendiente;

  const labelMap: Record<string, string> = {
    pendiente: 'Pendiente',
    xml_generado: 'XML Generado',
    firmado: 'Firmado',
    enviado: 'Enviado',
    aceptado: 'Aceptado',
    rechazado: 'Rechazado',
    error: 'Error',
  };

  const label = labelMap[estado] || estado;

  return (
    <span
      data-testid={testId}
      data-estado={estado}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {label}
    </span>
  );
}
