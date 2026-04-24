-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('app', 'api', 'library', 'platform', 'bundle');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'starter', 'pro', 'team', 'business', 'enterprise', 'unspecified');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "product_kind" "ProductKind" NOT NULL DEFAULT 'app',
    "canonical_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL DEFAULT 'unspecified',
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_slug_idx" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_vendor_profile_id_slug_key" ON "products"("vendor_profile_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "plans_product_id_slug_key" ON "plans"("product_id", "slug");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
