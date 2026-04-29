-- Migration: allow multiple NCF sequences per (company_id, tipo_ecf)
--
-- In the real DGII workflow, a company can have overlapping or consecutive
-- sequences of the same tipo_ecf (e.g., an expiring one and a new one).
-- The UNIQUE(company_id, tipo_ecf) constraint was too restrictive.
--
-- We keep at most ONE *active* sequence per type enforced at the application
-- level; the DB now simply stores the history.

-- 1. Drop the overly-restrictive unique constraint.
ALTER TABLE ncf_sequences
  DROP CONSTRAINT IF EXISTS ncf_sequences_company_id_tipo_ecf_key;

-- 2. Re-index for query performance (company_id + tipo_ecf is still a common filter).
CREATE INDEX IF NOT EXISTS idx_ncf_sequences_company_tipo
  ON ncf_sequences(company_id, tipo_ecf);

-- 3. Update assign_next_encf to explicitly pick the single ACTIVE sequence.
--    Without the UNIQUE constraint the SELECT could return multiple rows;
--    filtering by estado = 'activo' (+ LIMIT 1 via FOR UPDATE OF) is safe
--    because the app guarantees at most one active sequence per type.
CREATE OR REPLACE FUNCTION assign_next_encf(
  p_company_id UUID,
  p_tipo_ecf INTEGER DEFAULT 31
)
RETURNS VARCHAR AS $$
DECLARE
  v_row ncf_sequences%ROWTYPE;
  v_current_num BIGINT;
  v_next_num BIGINT;
  v_next_encf VARCHAR;
BEGIN
  -- Lock the *active* row to prevent concurrent assignments
  SELECT * INTO v_row
  FROM ncf_sequences
  WHERE company_id = p_company_id
    AND tipo_ecf   = p_tipo_ecf
    AND estado     = 'activo'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'No active NCF sequence found for company % and tipo_ecf %', p_company_id, p_tipo_ecf;
  END IF;

  -- Extract numeric part from current sequence
  v_current_num := CAST(SUBSTRING(v_row.secuencia_actual, 4) AS BIGINT);
  v_next_num    := v_current_num + 1;

  -- Build next ENCF (format: E310000000001)
  v_next_encf := 'E31' || LPAD(v_next_num::TEXT, 10, '0');

  -- Check if we're exceeding the final sequence
  IF CAST(SUBSTRING(v_row.secuencia_final, 4) AS BIGINT) < v_next_num THEN
    RAISE EXCEPTION 'NCF sequence exhausted for company %', p_company_id;
  END IF;

  -- Update the sequence
  UPDATE ncf_sequences
  SET
    secuencia_actual = v_next_encf,
    updated_at       = NOW()
  WHERE id = v_row.id;

  RETURN v_next_encf;
END;
$$ LANGUAGE plpgsql;
