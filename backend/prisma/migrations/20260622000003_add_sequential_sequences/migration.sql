-- Create sequences for atomic sequential number generation
-- Eliminates the race condition from count() + 1 pattern

CREATE SEQUENCE IF NOT EXISTS claim_number_seq MINVALUE 1 START 1;
CREATE SEQUENCE IF NOT EXISTS fire_ext_code_seq MINVALUE 1 START 1;

-- Initialize sequences to the current row count so next value doesn't collide
DO $$
DECLARE
  claim_count INTEGER;
  ext_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO claim_count FROM claims;
  IF claim_count > 0 THEN
    PERFORM setval('claim_number_seq', claim_count);
  END IF;

  SELECT COUNT(*) INTO ext_count FROM fire_extinguishers;
  IF ext_count > 0 THEN
    PERFORM setval('fire_ext_code_seq', ext_count);
  END IF;
END $$;
