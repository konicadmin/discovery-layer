-- AlterTable
ALTER TABLE "public_pricing_signals" ADD COLUMN     "plan_id" TEXT,
ADD COLUMN     "product_id" TEXT;

-- CreateIndex
CREATE INDEX "public_pricing_signals_product_id_idx" ON "public_pricing_signals"("product_id");

-- CreateIndex
CREATE INDEX "public_pricing_signals_plan_id_idx" ON "public_pricing_signals"("plan_id");

-- AddForeignKey
ALTER TABLE "public_pricing_signals" ADD CONSTRAINT "public_pricing_signals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_pricing_signals" ADD CONSTRAINT "public_pricing_signals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
