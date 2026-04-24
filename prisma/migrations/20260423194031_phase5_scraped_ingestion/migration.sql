-- CreateEnum
CREATE TYPE "SourceUrlType" AS ENUM ('vendor_site', 'directory', 'listing', 'social_profile', 'government_record', 'other');

-- CreateEnum
CREATE TYPE "DiscoveryMethod" AS ENUM ('manual', 'search', 'import');

-- CreateEnum
CREATE TYPE "SourceUrlStatus" AS ENUM ('queued', 'active', 'blocked', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('pending_match', 'matched', 'created_stub', 'rejected');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('explicit', 'inferred');

-- CreateEnum
CREATE TYPE "PublicStatus" AS ENUM ('draft', 'published', 'suppressed');

-- CreateEnum
CREATE TYPE "DedupeReviewStatus" AS ENUM ('pending', 'merged', 'separate', 'rejected');

-- CreateTable
CREATE TABLE "source_urls" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "source_type" "SourceUrlType" NOT NULL,
    "discovery_method" "DiscoveryMethod" NOT NULL,
    "status" "SourceUrlStatus" NOT NULL DEFAULT 'queued',
    "last_crawled_at" TIMESTAMP(3),
    "next_crawl_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_runs" (
    "id" TEXT NOT NULL,
    "source_url_id" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'queued',
    "http_status" INTEGER,
    "content_hash" TEXT,
    "fetched_at" TIMESTAMP(3),
    "error_message" TEXT,
    "raw_text_storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_vendor_candidates" (
    "id" TEXT NOT NULL,
    "crawl_run_id" TEXT NOT NULL,
    "legal_name" TEXT,
    "display_name" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city_text" TEXT,
    "category_text" TEXT,
    "service_summary" TEXT,
    "extraction_confidence" DECIMAL(4,3),
    "status" "CandidateStatus" NOT NULL DEFAULT 'pending_match',
    "resolved_vendor_profile_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_vendor_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "source_url_id" TEXT,
    "crawl_run_id" TEXT,
    "field_name" TEXT NOT NULL,
    "raw_value" TEXT,
    "normalized_value" TEXT,
    "source_excerpt" TEXT,
    "evidence_type" "EvidenceType" NOT NULL DEFAULT 'explicit',
    "confidence_score" DECIMAL(4,3),
    "freshness_score" DECIMAL(4,3),
    "observed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_public_snapshots" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "page_title" TEXT NOT NULL,
    "meta_description" TEXT,
    "summary_json" JSONB NOT NULL,
    "public_status" "PublicStatus" NOT NULL DEFAULT 'draft',
    "claim_cta_variant" TEXT,
    "last_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_public_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_page_metrics" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "metric_date" DATE NOT NULL,
    "page_views" INTEGER NOT NULL DEFAULT 0,
    "claim_clicks" INTEGER NOT NULL DEFAULT 0,
    "claim_starts" INTEGER NOT NULL DEFAULT 0,
    "claims_completed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_page_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dedupe_reviews" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "existing_vendor_profile_id" TEXT,
    "review_status" "DedupeReviewStatus" NOT NULL DEFAULT 'pending',
    "review_notes" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dedupe_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_urls_url_key" ON "source_urls"("url");

-- CreateIndex
CREATE INDEX "source_urls_domain_idx" ON "source_urls"("domain");

-- CreateIndex
CREATE INDEX "source_urls_status_next_crawl_at_idx" ON "source_urls"("status", "next_crawl_at");

-- CreateIndex
CREATE INDEX "crawl_runs_source_url_id_status_idx" ON "crawl_runs"("source_url_id", "status");

-- CreateIndex
CREATE INDEX "extracted_vendor_candidates_status_idx" ON "extracted_vendor_candidates"("status");

-- CreateIndex
CREATE INDEX "evidence_items_vendor_profile_id_field_name_idx" ON "evidence_items"("vendor_profile_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_public_snapshots_slug_key" ON "vendor_public_snapshots"("slug");

-- CreateIndex
CREATE INDEX "vendor_public_snapshots_public_status_last_published_at_idx" ON "vendor_public_snapshots"("public_status", "last_published_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_page_metrics_snapshot_id_metric_date_key" ON "vendor_page_metrics"("snapshot_id", "metric_date");

-- CreateIndex
CREATE INDEX "dedupe_reviews_review_status_idx" ON "dedupe_reviews"("review_status");

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_url_id_fkey" FOREIGN KEY ("source_url_id") REFERENCES "source_urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_vendor_candidates" ADD CONSTRAINT "extracted_vendor_candidates_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_public_snapshots" ADD CONSTRAINT "vendor_public_snapshots_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_page_metrics" ADD CONSTRAINT "vendor_page_metrics_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_page_metrics" ADD CONSTRAINT "vendor_page_metrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "vendor_public_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedupe_reviews" ADD CONSTRAINT "dedupe_reviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "extracted_vendor_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
