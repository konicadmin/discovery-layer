ALTER TABLE "public_pricing_signals"
  ALTER COLUMN "price_value" TYPE DECIMAL(18,6),
  ALTER COLUMN "normalized_pgpm" TYPE DECIMAL(18,6);
