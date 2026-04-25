-- CreateEnum
CREATE TYPE "DiscoveryCandidateStatus" AS ENUM ('new', 'reviewed', 'approved', 'crawled', 'rejected');

-- CreateTable
CREATE TABLE "discovery_candidates" (
    "id" TEXT NOT NULL,
    "service_category_id" TEXT,
    "vendor_name" TEXT,
    "homepage_url" TEXT,
    "search_term" TEXT,
    "notes" TEXT,
    "status" "DiscoveryCandidateStatus" NOT NULL DEFAULT 'new',
    "guessed_pricing_url" TEXT,
    "guess_confidence" DECIMAL(4,3),
    "guessed_at" TIMESTAMP(3),
    "approved_source_url_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discovery_candidates_status_created_at_idx" ON "discovery_candidates"("status", "created_at");

-- CreateIndex
CREATE INDEX "discovery_candidates_service_category_id_status_idx" ON "discovery_candidates"("service_category_id", "status");

-- AddForeignKey
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_approved_source_url_id_fkey" FOREIGN KEY ("approved_source_url_id") REFERENCES "source_urls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
