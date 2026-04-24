-- CreateEnum
CREATE TYPE "Region" AS ENUM ('IN', 'US', 'EU');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplianceType" ADD VALUE 'ein';
ALTER TYPE "ComplianceType" ADD VALUE 'us_state_security_license';
ALTER TYPE "ComplianceType" ADD VALUE 'workers_comp';
ALTER TYPE "ComplianceType" ADD VALUE 'vat';
ALTER TYPE "ComplianceType" ADD VALUE 'eu_security_license';
ALTER TYPE "ComplianceType" ADD VALUE 'gdpr_register';

-- AlterTable
ALTER TABLE "buyer_requirements" ADD COLUMN     "region" "Region" NOT NULL DEFAULT 'IN';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "default_currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "region" "Region" NOT NULL DEFAULT 'IN',
ADD COLUMN     "tax_id" TEXT;

-- AlterTable
ALTER TABLE "verification_checklist_items" ADD COLUMN     "region" "Region";

-- CreateIndex
CREATE INDEX "buyer_requirements_region_status_idx" ON "buyer_requirements"("region", "status");

-- CreateIndex
CREATE INDEX "organizations_region_idx" ON "organizations"("region");
