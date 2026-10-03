-- Kitchen Stock database update 0007: barcodes on items.
-- Keeps the barcode number of a scanned item, so food recall alerts can match it exactly.
-- Safe to run more than once. Until it's run, the app saves everything except barcodes.

alter table public.items add column if not exists upc text
  check (upc is null or upc ~ '^[0-9]{6,14}$');
