-- CreateEnum
CREATE TYPE "PricingSignalType" AS ENUM ('starting_price', 'day_rate', 'night_rate', 'supervisor_rate', 'pgpm_rate', 'hourly_rate', 'daily_rate', 'range_min', 'range_max', 'package_monthly', 'other');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('per_guard_per_month', 'per_hour', 'per_day', 'per_shift', 'package_monthly', 'unspecified');

-- CreateEnum
CREATE TYPE "PricingSignalStatus" AS ENUM ('pending', 'published', 'suppressed', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "public_pricing_signals" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "source_url_id" TEXT,
    "crawl_run_id" TEXT,
    "signal_type" "PricingSignalType" NOT NULL,
    "price_value" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "unit" "PricingUnit" NOT NULL DEFAULT 'unspecified',
    "min_quantity" INTEGER,
    "min_contract_months" INTEGER,
    "extracted_text" TEXT NOT NULL,
    "normalized_pgpm" DECIMAL(12,2),
    "normalization_notes" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL,
    "freshness_score" DECIMAL(4,3),
    "observed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" "PricingSignalStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_pricing_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_pricing_signals_vendor_profile_id_status_idx" ON "public_pricing_signals"("vendor_profile_id", "status");

-- CreateIndex
CREATE INDEX "public_pricing_signals_status_created_at_idx" ON "public_pricing_signals"("status", "created_at");

-- AddForeignKey
ALTER TABLE "public_pricing_signals" ADD CONSTRAINT "public_pricing_signals_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
