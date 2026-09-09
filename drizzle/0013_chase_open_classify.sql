-- Chase 09:16 classifier: PDF 09:16 candle (default) vs legacy 60-minute EMA step.
ALTER TABLE chase_settings
  ADD COLUMN IF NOT EXISTS open_classify text NOT NULL DEFAULT 'pdf_0916';

ALTER TABLE chase_settings DROP CONSTRAINT IF EXISTS chase_settings_open_classify_chk;

ALTER TABLE chase_settings
  ADD CONSTRAINT chase_settings_open_classify_chk
  CHECK (open_classify IN ('pdf_0916', 'legacy_60m'));
