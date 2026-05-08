ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS dgii_ambiente VARCHAR(20) NOT NULL DEFAULT 'certificacion';
