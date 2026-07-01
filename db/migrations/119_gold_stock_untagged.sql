-- Separate untagged (bulk) weight from tagged (individual piece) weight
-- within the same category entry row.
-- total_weight_g = tagged pieces total weight (has qty)
-- untagged_weight_g = bulk weight with no individual tracking (no qty)
alter table gold_stock_entries
  add column if not exists untagged_weight_g numeric(10,3) not null default 0;
