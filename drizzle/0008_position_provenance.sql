-- Paper vs live book on positions (orders/fills/trades already have provenance).
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'LIVE';

UPDATE positions p
SET provenance = t.provenance
FROM trades t
WHERE t.position_id = p.id
  AND t.provenance IN ('PAPER', 'MOCK')
  AND p.provenance = 'LIVE';
