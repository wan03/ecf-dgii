-- Migration: invoice_lines table
-- Stores per-line detail for each invoice so the system can reconstruct
-- the full ECF31Data from persisted state (e.g. for retries).

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  numero_linea INTEGER NOT NULL,
  nombre_bien_servicio VARCHAR(500) NOT NULL,
  indicador_bien_o_servicio INTEGER NOT NULL DEFAULT 2,
  descripcion TEXT,
  cantidad NUMERIC(15,4) NOT NULL,
  unidad_medida VARCHAR(10) NOT NULL,
  precio_unitario NUMERIC(15,4) NOT NULL,
  descuento_monto NUMERIC(15,2) DEFAULT 0,
  monto_item NUMERIC(15,2) NOT NULL,
  itbis NUMERIC(15,2) DEFAULT 0,
  codigo_itbis INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invoice_id, numero_linea)
);

CREATE INDEX idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON invoice_lines FOR ALL USING (auth.role() = 'service_role');
