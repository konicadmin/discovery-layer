-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('buyer', 'vendor', 'internal');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'suspended');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'buyer_admin', 'buyer_member', 'vendor_admin', 'vendor_member', 'ops_admin', 'ops_reviewer');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'removed');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('draft', 'in_progress', 'submitted', 'changes_requested', 'under_review', 'active');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "VendorSource" AS ENUM ('ops', 'vendor_signup', 'import', 'scrape');

-- CreateEnum
CREATE TYPE "ComplianceType" AS ENUM ('gst', 'psara', 'epf', 'esi', 'labour_license', 'iso', 'other');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('not_provided', 'pending', 'active', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('vendor_upload', 'ops_review', 'public_source');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('gst_certificate', 'psara_license', 'epf_certificate', 'esi_certificate', 'labour_license', 'insurance', 'sample_invoice', 'reference_letter', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'in_review', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('initial', 'renewal', 'claim_review', 'exception');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'in_review', 'approved', 'rejected', 'needs_changes');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('pending', 'pass', 'fail', 'not_applicable');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('draft', 'active', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('draft', 'ready_to_issue', 'issued', 'collecting_quotes', 'decision_pending', 'awarded', 'closed_no_award', 'cancelled');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('queued', 'sent', 'viewed', 'responded', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "QuoteSubmissionStatus" AS ENUM ('draft', 'submitted', 'withdrawn', 'superseded');

-- CreateEnum
CREATE TYPE "QuoteLineType" AS ENUM ('guard_wage', 'supervisor_wage', 'relief_factor', 'statutory', 'admin_fee', 'equipment', 'other');

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "gstin" TEXT,
    "website" TEXT,
    "primary_phone" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "auth_provider_id" TEXT,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_summary" TEXT,
    "year_established" INTEGER,
    "employee_band" TEXT,
    "hq_city_id" TEXT,
    "operating_cities_count" INTEGER NOT NULL DEFAULT 0,
    "profile_status" "ProfileStatus" NOT NULL DEFAULT 'draft',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "verification_score" INTEGER,
    "claimed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_by_source" "VendorSource" NOT NULL DEFAULT 'ops',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_service_categories" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "service_category_id" TEXT NOT NULL,
    "primary_category" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vendor_service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_service_areas" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "locality" TEXT,
    "serviceable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "vendor_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_compliance_records" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "compliance_type" "ComplianceType" NOT NULL,
    "identifier" TEXT,
    "issuing_authority" TEXT,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'not_provided',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "source_type" "SourceType" NOT NULL DEFAULT 'vendor_upload',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_compliance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "document_file_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_reviews" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "review_type" "ReviewType" NOT NULL DEFAULT 'initial',
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "assigned_to_user_id" TEXT,
    "completed_by_user_id" TEXT,
    "decision_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "verification_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_checklist_items" (
    "id" TEXT NOT NULL,
    "service_category_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "verification_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_review_items" (
    "id" TEXT NOT NULL,
    "verification_review_id" TEXT NOT NULL,
    "checklist_item_id" TEXT NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "verification_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_requirements" (
    "id" TEXT NOT NULL,
    "buyer_organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "service_category_id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "site_type" TEXT,
    "headcount_required" INTEGER,
    "shift_pattern" TEXT,
    "relief_required" BOOLEAN NOT NULL DEFAULT false,
    "contract_term_months" INTEGER,
    "start_date" TIMESTAMP(3),
    "compliance_requirements_json" JSONB,
    "special_requirements_json" JSONB,
    "status" "RequirementStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "buyer_requirement_id" TEXT NOT NULL,
    "buyer_organization_id" TEXT NOT NULL,
    "rfq_code" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3),
    "response_deadline" TIMESTAMP(3),
    "status" "RfqStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_recipients" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "recipient_status" "RecipientStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "rfq_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billing_unit" TEXT NOT NULL DEFAULT 'pgpm',
    "monthly_subtotal" DECIMAL(12,2),
    "statutory_cost_total" DECIMAL(12,2),
    "service_fee_total" DECIMAL(12,2),
    "grand_total" DECIMAL(12,2),
    "assumptions_json" JSONB,
    "valid_until" TIMESTAMP(3),
    "submission_status" "QuoteSubmissionStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "line_type" "QuoteLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_shortlist_snapshots" (
    "id" TEXT NOT NULL,
    "buyer_requirement_id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "match_score" DECIMAL(6,4),
    "match_reasons_json" JSONB,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excluded_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_shortlist_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_organization_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "context_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_state_key" ON "cities"("name", "state");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_code_key" ON "service_categories"("code");

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_role_key" ON "organization_memberships"("organization_id", "user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_organization_id_key" ON "vendor_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "vendor_profiles_profile_status_idx" ON "vendor_profiles"("profile_status");

-- CreateIndex
CREATE INDEX "vendor_profiles_verification_status_idx" ON "vendor_profiles"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_service_categories_vendor_profile_id_service_categor_key" ON "vendor_service_categories"("vendor_profile_id", "service_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_service_areas_vendor_profile_id_city_id_locality_key" ON "vendor_service_areas"("vendor_profile_id", "city_id", "locality");

-- CreateIndex
CREATE INDEX "vendor_compliance_records_vendor_profile_id_compliance_type_idx" ON "vendor_compliance_records"("vendor_profile_id", "compliance_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_files_storage_key_key" ON "document_files"("storage_key");

-- CreateIndex
CREATE INDEX "vendor_documents_vendor_profile_id_document_type_idx" ON "vendor_documents"("vendor_profile_id", "document_type");

-- CreateIndex
CREATE INDEX "verification_reviews_status_idx" ON "verification_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "verification_checklist_items_service_category_id_code_key" ON "verification_checklist_items"("service_category_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "verification_review_items_verification_review_id_checklist__key" ON "verification_review_items"("verification_review_id", "checklist_item_id");

-- CreateIndex
CREATE INDEX "buyer_requirements_buyer_organization_id_status_idx" ON "buyer_requirements"("buyer_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_rfq_code_key" ON "rfqs"("rfq_code");

-- CreateIndex
CREATE INDEX "rfqs_status_idx" ON "rfqs"("status");

-- CreateIndex
CREATE INDEX "rfq_recipients_vendor_profile_id_recipient_status_idx" ON "rfq_recipients"("vendor_profile_id", "recipient_status");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_recipients_rfq_id_vendor_profile_id_key" ON "rfq_recipients"("rfq_id", "vendor_profile_id");

-- CreateIndex
CREATE INDEX "quotes_rfq_id_idx" ON "quotes"("rfq_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_rfq_id_vendor_profile_id_version_number_key" ON "quotes"("rfq_id", "vendor_profile_id", "version_number");

-- CreateIndex
CREATE INDEX "quote_line_items_quote_id_idx" ON "quote_line_items"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_shortlist_snapshots_buyer_requirement_id_vendor_prof_key" ON "vendor_shortlist_snapshots"("buyer_requirement_id", "vendor_profile_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_hq_city_id_fkey" FOREIGN KEY ("hq_city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_service_categories" ADD CONSTRAINT "vendor_service_categories_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_service_categories" ADD CONSTRAINT "vendor_service_categories_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_compliance_records" ADD CONSTRAINT "vendor_compliance_records_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_document_file_id_fkey" FOREIGN KEY ("document_file_id") REFERENCES "document_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_checklist_items" ADD CONSTRAINT "verification_checklist_items_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_review_items" ADD CONSTRAINT "verification_review_items_verification_review_id_fkey" FOREIGN KEY ("verification_review_id") REFERENCES "verification_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_review_items" ADD CONSTRAINT "verification_review_items_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "verification_checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_review_items" ADD CONSTRAINT "verification_review_items_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_buyer_organization_id_fkey" FOREIGN KEY ("buyer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyer_requirement_id_fkey" FOREIGN KEY ("buyer_requirement_id") REFERENCES "buyer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyer_organization_id_fkey" FOREIGN KEY ("buyer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_recipients" ADD CONSTRAINT "rfq_recipients_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_recipients" ADD CONSTRAINT "rfq_recipients_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_shortlist_snapshots" ADD CONSTRAINT "vendor_shortlist_snapshots_buyer_requirement_id_fkey" FOREIGN KEY ("buyer_requirement_id") REFERENCES "buyer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_shortlist_snapshots" ADD CONSTRAINT "vendor_shortlist_snapshots_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
