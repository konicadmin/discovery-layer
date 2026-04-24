-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PricingUnit" ADD VALUE 'per_seat_per_month';
ALTER TYPE "PricingUnit" ADD VALUE 'per_seat_per_year';
ALTER TYPE "PricingUnit" ADD VALUE 'per_user_per_month';
ALTER TYPE "PricingUnit" ADD VALUE 'per_1m_input_tokens';
ALTER TYPE "PricingUnit" ADD VALUE 'per_1m_output_tokens';
ALTER TYPE "PricingUnit" ADD VALUE 'per_1k_tokens';
ALTER TYPE "PricingUnit" ADD VALUE 'per_api_call';
ALTER TYPE "PricingUnit" ADD VALUE 'per_request';
ALTER TYPE "PricingUnit" ADD VALUE 'per_1k_requests';
ALTER TYPE "PricingUnit" ADD VALUE 'usage_metered';
ALTER TYPE "PricingUnit" ADD VALUE 'flat_monthly';
ALTER TYPE "PricingUnit" ADD VALUE 'flat_annual';
ALTER TYPE "PricingUnit" ADD VALUE 'one_time';
