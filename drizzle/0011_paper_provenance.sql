-- Paper execution writes provenance PAPER. The original ledger CHECKs omitted it, so
-- paper markOrderSubmitted failed (23514 orders_provenance_chk) and Chase never filled.
ALTER TABLE trading_decisions DROP CONSTRAINT IF EXISTS trading_decisions_provenance_chk;
ALTER TABLE trading_decisions
  ADD CONSTRAINT trading_decisions_provenance_chk
  CHECK (provenance IN ('LIVE', 'MIGRATED', 'RECONCILED', 'MOCK', 'PAPER'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_provenance_chk;
ALTER TABLE orders
  ADD CONSTRAINT orders_provenance_chk
  CHECK (provenance IN ('LIVE', 'MIGRATED', 'RECONCILED', 'MOCK', 'PAPER'));

ALTER TABLE fills DROP CONSTRAINT IF EXISTS fills_provenance_chk;
ALTER TABLE fills
  ADD CONSTRAINT fills_provenance_chk
  CHECK (provenance IN ('LIVE', 'MIGRATED', 'RECONCILED', 'MOCK', 'PAPER'));
