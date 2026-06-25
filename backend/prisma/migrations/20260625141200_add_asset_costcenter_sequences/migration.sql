-- Create sequences for atomic sequential code generation
-- Eliminates race conditions from count()+1 and while-loop patterns

CREATE SEQUENCE IF NOT EXISTS asset_code_seq MINVALUE 1 START 1;
CREATE SEQUENCE IF NOT EXISTS cost_center_code_seq MINVALUE 1 START 1;

-- Initialize sequences to current row counts to avoid collisions with existing data
DO $$
DECLARE
  asset_count INTEGER;
  cc_count    INTEGER;
BEGIN
  SELECT COUNT(*) INTO asset_count FROM assets;
  IF asset_count > 0 THEN
    PERFORM setval('asset_code_seq', asset_count);
  END IF;

  SELECT COUNT(*) INTO cc_count FROM cost_centers;
  IF cc_count > 0 THEN
    PERFORM setval('cost_center_code_seq', cc_count);
  END IF;
END $$;
