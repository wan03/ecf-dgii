-- Function to assign next e-NCF atomically
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
  -- Lock the row to prevent concurrent assignments
  SELECT * INTO v_row FROM ncf_sequences
  WHERE company_id = p_company_id AND tipo_ecf = p_tipo_ecf
  FOR UPDATE;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'No active NCF sequence found for company % and tipo_ecf %', p_company_id, p_tipo_ecf;
  END IF;

  -- Extract numeric part from current sequence
  v_current_num := CAST(SUBSTRING(v_row.secuencia_actual, 4) AS BIGINT);
  v_next_num := v_current_num + 1;

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
    updated_at = NOW()
  WHERE company_id = p_company_id AND tipo_ecf = p_tipo_ecf;

  RETURN v_next_encf;
END;
$$ LANGUAGE plpgsql;

-- Function to check if sequence is near expiry or exhaustion
CREATE OR REPLACE FUNCTION check_sequence_alerts()
RETURNS TABLE(
  sequence_id UUID,
  tipo_ecf INTEGER,
  alert_type VARCHAR,
  remaining_count BIGINT
) AS $$
DECLARE
  v_current_num BIGINT;
  v_final_num BIGINT;
  v_remaining BIGINT;
  v_record RECORD;
BEGIN
  FOR v_record IN SELECT id, tipo_ecf, secuencia_actual, secuencia_final, fecha_vencimiento
                  FROM ncf_sequences
                  WHERE estado = 'activo'
  LOOP
    v_current_num := CAST(SUBSTRING(v_record.secuencia_actual, 4) AS BIGINT);
    v_final_num := CAST(SUBSTRING(v_record.secuencia_final, 4) AS BIGINT);
    v_remaining := v_final_num - v_current_num;

    -- Check if sequence expires within 30 days
    IF v_record.fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days' THEN
      RETURN QUERY SELECT
        v_record.id,
        v_record.tipo_ecf,
        'near_expiry'::VARCHAR,
        v_remaining;
    END IF;

    -- Check if less than 100 sequences remaining
    IF v_remaining < 100 THEN
      RETURN QUERY SELECT
        v_record.id,
        v_record.tipo_ecf,
        'nearly_exhausted'::VARCHAR,
        v_remaining;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
