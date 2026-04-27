-- Create company_config table
CREATE TABLE company_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rnc VARCHAR(255) NOT NULL UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  nombre_comercial VARCHAR(255),
  direccion VARCHAR(500) NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(255),
  certificado_path VARCHAR(500),
  certificado_password_encrypted VARCHAR(500),
  tipo_ingresos VARCHAR(2) DEFAULT '01',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ncf_sequences table
CREATE TABLE ncf_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_config(id) ON DELETE CASCADE,
  tipo_ecf INTEGER NOT NULL DEFAULT 31,
  secuencia_inicial VARCHAR(13) NOT NULL,
  secuencia_actual VARCHAR(13) NOT NULL,
  secuencia_final VARCHAR(13) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  numero_autorizacion VARCHAR(50),
  estado VARCHAR(20) DEFAULT 'activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, tipo_ecf)
);

-- Create invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_config(id) ON DELETE CASCADE,
  numero_factura VARCHAR(50) NOT NULL,
  encf VARCHAR(13),
  numero_cliente VARCHAR(50),
  razon_social_cliente VARCHAR(255),
  direccion_cliente VARCHAR(500),
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  subtotal NUMERIC(15,2) NOT NULL,
  monto_gravado_i1 NUMERIC(15,2) DEFAULT 0,
  monto_gravado_i2 NUMERIC(15,2) DEFAULT 0,
  monto_gravado_i3 NUMERIC(15,2) DEFAULT 0,
  itbis_1 NUMERIC(15,2) DEFAULT 0,
  itbis_2 NUMERIC(15,2) DEFAULT 0,
  itbis_3 NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL,
  tipo_pago INTEGER DEFAULT 1,
  tipo_ingresos VARCHAR(2) DEFAULT '01',
  estado VARCHAR(50) DEFAULT 'pendiente',
  estado_dgii VARCHAR(50),
  track_id VARCHAR(100),
  xml_content TEXT,
  xml_firmado TEXT,
  intentos_envio INTEGER DEFAULT 0,
  error_message TEXT,
  respuesta_dgii JSONB,
  fecha_envio TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit_log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  estado_anterior VARCHAR(50),
  estado_nuevo VARCHAR(50),
  detalles JSONB,
  usuario VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_ncf_sequences_company_id ON ncf_sequences(company_id);
CREATE INDEX idx_ncf_sequences_tipo_ecf ON ncf_sequences(tipo_ecf);
CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_estado ON invoices(estado);
CREATE INDEX idx_invoices_encf ON invoices(encf);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);
CREATE INDEX idx_audit_log_invoice_id ON audit_log(invoice_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncf_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
