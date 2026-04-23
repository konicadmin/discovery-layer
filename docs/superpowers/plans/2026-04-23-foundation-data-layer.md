# Foundation & Data Layer Plan

## Goal

Ship the first production-grade foundation for the procurement platform:

- Postgres schema for buyers, vendors, requirements, RFQs, quotes, verification, and auditability
- auth and role model for internal ops, buyers, and vendors
- core CRUD APIs for the main entities
- migrations, seeds, and local/dev deployment path
- a thin admin shell so the team can inspect and operate the system

This phase should end with a working backend and admin surface that the next phases can build on without reworking the data model.

## Product outcome

At the end of this phase, the team can:

- create buyer organizations and users
- create vendor organizations and vendor records
- store service coverage, compliance metadata, and commercial data
- create sourcing requests and RFQs
- capture multiple vendor quotes in normalized structure
- mark verification status and record evidence
- inspect all records from an internal admin shell

This is not yet the full buyer or vendor experience. It is the system of record that makes those workflows possible.

## Scope

### In scope

- database selection, schema design, and migration setup
- tenant-aware access model
- authentication and session handling
- role-based authorization
- core REST or RPC endpoints for all primary entities
- internal admin UI for CRUD and workflow inspection
- file metadata model for documents and evidence references
- event/audit log
- seed data for one category and one city
- local and staging deployment setup
- API contracts and engineering docs

### Out of scope

- vendor self-serve onboarding UX
- buyer self-serve sourcing UX
- AI requirement parsing
- AI ranking, recommendations, or chat
- scraping pipeline and public vendor pages
- deep analytics dashboards
- external integrations beyond essentials like object storage/email if needed

## Architecture decisions

### Recommended stack

- Frontend/admin: Next.js App Router
- Backend: Next.js route handlers or a typed backend layer already aligned with repo direction
- Database: Postgres
- ORM: Prisma or Drizzle
- Auth: Clerk, Auth.js, or Supabase Auth depending on existing repo preference
- Validation: Zod
- Background jobs: defer unless truly needed in this phase
- File storage: S3-compatible bucket for documents, but only integrate metadata + signed upload flow now

If the repo has no established stack, choose:

- Next.js
- Postgres
- Prisma
- Auth.js
- Zod

Reason: fastest hiring path, wide library support, and predictable developer ergonomics for an admin-heavy V1.

## Core domain model

Design for a curated procurement platform, not a directory. The key principle is:

- vendor entity is the durable identity
- onboarding completeness and trust review are separate lifecycles
- verification is a separate lifecycle
- quote data is versioned
- public evidence and uploaded evidence can coexist later without changing the core schema

### Main entities

1. `users`
2. `organizations`
3. `organization_memberships`
4. `vendor_profiles`
5. `vendor_service_areas`
6. `vendor_service_categories`
7. `vendor_compliance_records`
8. `vendor_documents`
9. `buyer_requirements`
10. `rfqs`
11. `rfq_recipients`
12. `quotes`
13. `quote_line_items`
14. `verification_reviews`
15. `audit_events`

### Optional but strongly recommended supporting tables

1. `cities`
2. `service_categories`
3. `facilities`
4. `contacts`
5. `tags`
6. `document_files`
7. `commercial_versions`
8. `evidence_items`

## Schema design

### `organizations`

Represents a company or operating entity.

Fields:

- `id`
- `type` (`buyer`, `vendor`, `internal`)
- `legal_name`
- `display_name`
- `gstin`
- `website`
- `primary_phone`
- `status`
- `created_at`
- `updated_at`

### `users`

Fields:

- `id`
- `email`
- `name`
- `phone`
- `auth_provider_id`
- `status`
- `last_login_at`
- `created_at`
- `updated_at`

### `organization_memberships`

Fields:

- `id`
- `organization_id`
- `user_id`
- `role` (`owner`, `buyer_admin`, `buyer_member`, `vendor_admin`, `vendor_member`, `ops_admin`, `ops_reviewer`)
- `status`
- `created_at`

### `vendor_profiles`

Holds curated vendor data distinct from org identity.

Fields:

- `id`
- `organization_id`
- `service_summary`
- `year_established`
- `employee_band`
- `hq_city_id`
- `operating_cities_count`
- `profile_status` (`draft`, `in_progress`, `submitted`, `changes_requested`, `under_review`, `active`)
- `verification_status` (`unverified`, `pending`, `verified`, `rejected`, `suspended`)
- `verification_score`
- `claimed_at`
- `verified_at`
- `created_by_source` (`ops`, `vendor_signup`, `import`, `scrape`)
- `created_at`
- `updated_at`

### `vendor_service_categories`

Fields:

- `id`
- `vendor_profile_id`
- `service_category_id`
- `primary_category`
- `active`

For V1, seed only one category: security staffing.

### `vendor_service_areas`

Fields:

- `id`
- `vendor_profile_id`
- `city_id`
- `locality`
- `serviceable`
- `notes`

### `vendor_compliance_records`

Tracks structured compliance attributes.

Fields:

- `id`
- `vendor_profile_id`
- `compliance_type` (`gst`, `psara`, `epf`, `esi`, `labour_license`, `iso`, `other`)
- `identifier`
- `issuing_authority`
- `status`
- `valid_from`
- `valid_to`
- `last_checked_at`
- `source_type` (`vendor_upload`, `ops_review`, `public_source`)
- `notes`

### `document_files`

Fields:

- `id`
- `storage_key`
- `file_name`
- `mime_type`
- `file_size`
- `uploaded_by_user_id`
- `created_at`

### `vendor_documents`

Fields:

- `id`
- `vendor_profile_id`
- `document_file_id`
- `document_type`
- `status`
- `reviewed_by_user_id`
- `reviewed_at`
- `notes`

### `buyer_requirements`

The normalized sourcing brief.

Fields:

- `id`
- `buyer_organization_id`
- `title`
- `service_category_id`
- `city_id`
- `site_type`
- `headcount_required`
- `shift_pattern`
- `relief_required`
- `contract_term_months`
- `start_date`
- `compliance_requirements_json`
- `special_requirements_json`
- `status` (`draft`, `active`, `closed`, `cancelled`)
- `created_by_user_id`
- `created_at`
- `updated_at`

### `rfqs`

Fields:

- `id`
- `buyer_requirement_id`
- `buyer_organization_id`
- `rfq_code`
- `issue_date`
- `response_deadline`
- `status` (`draft`, `issued`, `collecting_quotes`, `closed`, `awarded`, `cancelled`)
- `notes`
- `created_by_user_id`
- `created_at`

### `rfq_recipients`

Fields:

- `id`
- `rfq_id`
- `vendor_profile_id`
- `contact_user_id`
- `recipient_status` (`queued`, `sent`, `viewed`, `responded`, `declined`)
- `sent_at`
- `viewed_at`
- `responded_at`

### `quotes`

One row per vendor submission version.

Fields:

- `id`
- `rfq_id`
- `vendor_profile_id`
- `version_number`
- `currency`
- `billing_unit`
- `monthly_subtotal`
- `statutory_cost_total`
- `service_fee_total`
- `grand_total`
- `assumptions_json`
- `valid_until`
- `submission_status` (`draft`, `submitted`, `withdrawn`, `superseded`)
- `submitted_at`
- `created_by_user_id`
- `created_at`

Constraint:

- unique on `rfq_id`, `vendor_profile_id`, `version_number`

### `quote_line_items`

Needed so comparisons are not trapped in blobs.

Fields:

- `id`
- `quote_id`
- `line_type` (`guard_wage`, `supervisor_wage`, `relief_factor`, `statutory`, `admin_fee`, `equipment`, `other`)
- `label`
- `quantity`
- `unit`
- `unit_price`
- `amount`
- `notes`

### `verification_reviews`

Captures the ops workflow and decisions.

Fields:

- `id`
- `vendor_profile_id`
- `review_type` (`initial`, `renewal`, `claim_review`, `exception`)
- `status` (`pending`, `in_review`, `approved`, `rejected`, `needs_changes`)
- `assigned_to_user_id`
- `completed_by_user_id`
- `checklist_json`
- `decision_notes`
- `created_at`
- `updated_at`
- `completed_at`

### `audit_events`

This matters early because trust and ops require traceability.

Fields:

- `id`
- `actor_user_id`
- `actor_organization_id`
- `entity_type`
- `entity_id`
- `action`
- `before_json`
- `after_json`
- `context_json`
- `created_at`

## Access model

### Roles

- `ops_admin`: full system access
- `ops_reviewer`: vendor review + operational records
- `buyer_admin`: manage buyer org, requirements, RFQs, compare quotes
- `buyer_member`: create/edit drafts, limited final actions
- `vendor_admin`: manage vendor profile, documents, quote submissions
- `vendor_member`: assist with limited editing

### Authorization rules

- all business records are scoped by organization
- internal users can cross tenant boundaries with explicit role checks
- vendors can only access RFQs they were invited to
- buyers can only access their own requirements, RFQs, and received quotes
- raw audit logs are internal-only

## API surface

Keep the API boring and explicit. Favor typed contracts over smart abstractions.

### Organization and user APIs

- `POST /api/organizations`
- `GET /api/organizations/:id`
- `PATCH /api/organizations/:id`
- `POST /api/organizations/:id/members`

### Vendor APIs

- `POST /api/vendors`
- `GET /api/vendors`
- `GET /api/vendors/:id`
- `PATCH /api/vendors/:id`
- `POST /api/vendors/:id/service-areas`
- `POST /api/vendors/:id/compliance-records`
- `POST /api/vendors/:id/documents`
- `POST /api/vendors/:id/verification-reviews`

### Buyer requirement APIs

- `POST /api/requirements`
- `GET /api/requirements`
- `GET /api/requirements/:id`
- `PATCH /api/requirements/:id`

### RFQ APIs

- `POST /api/rfqs`
- `GET /api/rfqs/:id`
- `PATCH /api/rfqs/:id`
- `POST /api/rfqs/:id/recipients`
- `POST /api/rfqs/:id/issue`

### Quote APIs

- `POST /api/rfqs/:id/quotes`
- `GET /api/rfqs/:id/quotes`
- `GET /api/quotes/:id`
- `PATCH /api/quotes/:id`
- `POST /api/quotes/:id/submit`

### Internal/admin APIs

- `GET /api/admin/dashboard`
- `GET /api/admin/audit-events`
- `GET /api/admin/verification-queue`

## Admin shell

The admin shell is not polish work; it is leverage.

### Minimum screens

1. Login
2. Organizations list/detail
3. Vendors list/detail
4. Verification queue
5. Buyer requirements list/detail
6. RFQs list/detail
7. Quotes compare table
8. Audit event viewer

### UX rules

- optimize for operations speed, not brand polish
- every important status should be filterable
- every key record should show timeline/history
- key actions should be explicit and logged

## Delivery plan

### Week 1: setup and schema

Outcomes:

- choose stack and scaffold app
- connect Postgres
- implement migration workflow
- create initial schema for auth, orgs, vendors, buyers, RFQs, quotes, audit
- seed cities and service category

Tasks:

1. Initialize app structure if not already present.
2. Add DB package, migration tooling, env handling.
3. Implement base schema and foreign keys.
4. Add enums and status constants.
5. Generate first migration.
6. Create seed script with:
   - Bengaluru
   - security staffing category
   - one internal ops org
   - one sample buyer org
   - five sample vendors

Exit criteria:

- fresh setup boots locally
- migrations run from zero
- seeds produce usable demo data

### Week 2: auth, RBAC, vendor and buyer APIs

Outcomes:

- sign-in works
- users attach to orgs with roles
- vendor and buyer requirement CRUD works

Tasks:

1. Integrate auth provider.
2. Build session helpers.
3. Implement authorization middleware/helpers.
4. Build vendor CRUD endpoints.
5. Build buyer requirement CRUD endpoints.
6. Add audit event writes for create/update actions.
7. Add request validation and error handling.

Exit criteria:

- authenticated users can access only allowed data
- vendor and requirement records can be created and edited end to end

### Week 3: RFQs, quotes, and admin shell

Outcomes:

- buyers can create RFQs
- invited vendors can submit quotes
- internal team can inspect all records

Tasks:

1. Implement RFQ CRUD + recipient linking.
2. Implement quote versioning and line-item storage.
3. Build compare table in admin shell.
4. Build vendors list and vendor detail pages.
5. Build requirements and RFQs list/detail pages.
6. Build basic verification queue UI.

Exit criteria:

- sample sourcing flow works through admin shell
- quote versions and line items render correctly

### Week 4: hardening and staging readiness

Outcomes:

- system is testable, documented, and ready for phase 2 feature work

Tasks:

1. Add integration tests for key flows.
2. Add role-based access tests.
3. Add audit log assertions for critical mutations.
4. Add signed upload metadata flow for documents.
5. Write developer docs and ERD.
6. Deploy staging environment.
7. Run a dry-run sourcing scenario with seeded data.

Exit criteria:

- staging environment is usable
- key flows are covered by tests
- schema is stable enough for onboarding flow buildout

## Testing strategy

### Unit tests

- schema validation
- authorization helpers
- quote normalization calculations
- status transition guards

### Integration tests

- buyer creates requirement and RFQ
- buyer invites vendor
- vendor submits quote
- ops reviewer changes verification status
- unauthorized access is blocked

### Manual QA scenarios

1. Internal ops creates a vendor and marks review pending.
2. Buyer creates a requirement for 20 guards in Bengaluru.
3. Buyer issues RFQ to 3 vendors.
4. Vendor submits two quote versions.
5. Buyer/admin compares quotes and sees line-item breakdown.
6. Audit logs show the whole history.

## Key implementation notes

### Quote versioning

Do not overwrite commercial records. New submissions create new quote versions. This protects trust, negotiation history, and future analytics.

### Flexible fields

Use structured columns for core compare fields and `json` only for category-specific tails. If everything goes into JSON now, the compare workflow becomes expensive to rebuild later.

### Verification status

Keep verification as a separate lifecycle from profile completeness. A vendor can have a complete profile and still be unverified.

### Profile status

Track onboarding progress separately from trust status. This avoids overloading `verification_status` with workflow states like `draft` or `changes_requested`.

### Evidence readiness

Even though scraped ingestion is out of scope here, leave a clean extension point:

- `created_by_source`
- `source_type` on compliance/evidence records
- optional `evidence_items` table later

That prevents a painful schema rewrite in Phase 1b.

## Risks

### Risk: overdesign before real usage

Mitigation:

- keep to one category
- keep category schema under 15 primary fields
- avoid generic marketplace abstractions

### Risk: auth and RBAC complexity slows velocity

Mitigation:

- use simple org-role memberships
- avoid custom policy engines in V1

### Risk: quote schema misses real pricing nuance

Mitigation:

- model both summary totals and line items
- review fields with 3 to 5 real vendor quote samples before locking migration

### Risk: admin shell becomes accidental end-user product

Mitigation:

- keep it intentionally operational
- optimize for correctness and speed, not visual polish

## Deliverables

1. Working Postgres schema and migrations
2. Seed script and local bootstrap docs
3. Auth + RBAC layer
4. CRUD APIs for organizations, vendors, requirements, RFQs, and quotes
5. Admin shell with operational list/detail views
6. Audit trail for critical actions
7. Staging deployment
8. Technical documentation and ERD

## Suggested file/module breakdown

If you are building this in a typical Next.js repo, a practical structure is:

- `src/app/(admin)/...`
- `src/app/api/...`
- `src/server/auth/...`
- `src/server/db/schema/...`
- `src/server/db/migrations/...`
- `src/server/services/vendors/...`
- `src/server/services/rfqs/...`
- `src/server/services/quotes/...`
- `src/server/services/audit/...`
- `src/lib/validation/...`

## Definition of done

This phase is done when:

- a new engineer can clone the repo, run migrations, seed data, and boot the app
- internal ops can inspect and update the full sourcing data model from the admin shell
- buyers and vendors can be represented safely with correct tenancy boundaries
- RFQs and quote versions can be stored without data loss or schema hacks
- the next phase can start without revisiting core tables

## Recommendation after this phase

Build Phase 2 next: vendor onboarding + ops verification.

Reason:

- it validates the trust layer early
- it creates the first proprietary data
- it is a stronger prerequisite for buyer-facing sourcing than AI or scraping
