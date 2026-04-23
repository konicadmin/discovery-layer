# Vendor Onboarding & Ops Verification Plan

## Goal

Ship the first trust workflow for the procurement platform:

- vendors can register and create an account
- vendors can complete a structured profile for one service category
- vendors can upload required documents
- internal ops can review, approve, reject, and request changes
- the system produces a clear verified/unverified state with auditability

This phase should end with a working vendor intake and verification system that creates trusted supply for buyer sourcing.

## Product outcome

At the end of this phase, the team can:

- invite or register a vendor into the system
- let a vendor claim and manage their organization profile
- collect compliance, serviceability, and commercial metadata in structured form
- upload and review proof documents
- run a verification queue with explicit decisions and notes
- expose verification state to downstream sourcing workflows

This is the trust engine. It is not yet the full buyer experience, and it does not yet include scraped supply acquisition.

## Scope

### In scope

- vendor sign-up and login
- vendor organization claim/create flow
- vendor profile completion for security staffing
- service area and category configuration
- document upload flow
- compliance record capture
- internal ops review console
- verification checklist and decision workflow
- notification events for important status changes
- audit logging for every material state transition

### Out of scope

- public vendor directory pages
- scraped evidence ingestion
- AI-assisted document extraction
- buyer RFQ UI
- quote submission UX beyond schema readiness
- automated external compliance verification integrations unless one is trivial

## Phase objective

Prove that the product can produce trusted vendor records faster and with less operational chaos than spreadsheets, email, and WhatsApp.

The main thing to de-risk here is not growth. It is trust. If this phase works, every later buyer workflow has a credible supply base to sit on.

## User roles

### Vendor side

- `vendor_admin`: primary owner of vendor account, can edit all vendor data and submit for review
- `vendor_member`: can assist with updates and uploads

### Internal side

- `ops_admin`: can override, assign, and finalize any review
- `ops_reviewer`: can review documents, update checklist, request changes, approve, or reject

## Core user journeys

### Journey 1: vendor self-registration

1. Vendor lands on registration page.
2. Vendor signs up with email/phone.
3. Vendor creates or claims organization.
4. Vendor sees onboarding checklist.
5. Vendor fills profile, serviceability, and compliance fields.
6. Vendor uploads required documents.
7. Vendor submits profile for review.

### Journey 2: ops-assisted vendor creation

1. Internal team creates vendor shell record.
2. Vendor receives invite.
3. Vendor claims account and completes missing details.
4. Ops reviews and verifies.

### Journey 3: review and verification

1. Ops opens verification queue.
2. Ops sees missing fields, expiring docs, and status.
3. Ops reviews checklist and attachments.
4. Ops requests changes or approves.
5. Vendor receives status update and can respond if changes are needed.

## UX surfaces

### Vendor mobile web app

This should be mobile-first because many vendor operators will complete it on phone.

Minimum screens:

1. Sign up / sign in
2. Create or claim company
3. Onboarding checklist dashboard
4. Company profile form
5. Service coverage form
6. Compliance details form
7. Document upload center
8. Review status timeline
9. Request changes screen

### Internal ops console

Minimum screens:

1. Verification queue
2. Vendor profile detail
3. Document review panel
4. Checklist review panel
5. Decision modal for approve/reject/request changes
6. Reviewer assignment view
7. Audit history panel

## Data model additions and usage

This phase should reuse the Phase 1 foundation and add only what improves the onboarding lifecycle.

### Reuse existing tables

- `organizations`
- `users`
- `organization_memberships`
- `vendor_profiles`
- `vendor_service_areas`
- `vendor_service_categories`
- `vendor_compliance_records`
- `document_files`
- `vendor_documents`
- `verification_reviews`
- `audit_events`

### Add or refine these tables

1. `vendor_claims`
2. `verification_checklist_items`
3. `verification_review_items`
4. `notifications`
5. `vendor_contacts` if contact structure needs to be richer than org membership

### `vendor_claims`

Used for invite/claim flow, and later for scraped/unclaimed vendor records.

Fields:

- `id`
- `vendor_profile_id`
- `claim_email`
- `claim_phone`
- `claim_token`
- `status` (`pending`, `claimed`, `expired`, `cancelled`)
- `claimed_by_user_id`
- `expires_at`
- `created_at`

### `verification_checklist_items`

Category-specific checklist definitions.

Fields:

- `id`
- `service_category_id`
- `code`
- `label`
- `description`
- `required`
- `sort_order`
- `active`

Examples for security staffing:

- GST verified
- PSARA provided
- EPF registration provided
- ESI registration provided
- serviceability city confirmed
- escalation contact present
- replacement SLA stated

### `verification_review_items`

Stores the actual checklist decision per review.

Fields:

- `id`
- `verification_review_id`
- `checklist_item_id`
- `status` (`pending`, `pass`, `fail`, `not_applicable`)
- `notes`
- `reviewed_by_user_id`
- `reviewed_at`

### `notifications`

Fields:

- `id`
- `organization_id`
- `user_id`
- `channel` (`email`, `sms`, `in_app`)
- `template_key`
- `payload_json`
- `status`
- `sent_at`
- `created_at`

## Onboarding checklist design

Keep the checklist legible and finite. The goal is completion, not exhaustive enterprise onboarding.

### Checklist sections

1. Company identity
2. Service offering
3. Service coverage
4. Compliance and licenses
5. Operating contacts
6. Supporting documents
7. Review submission

### Required fields for V1

#### Company identity

- legal name
- display name
- GSTIN
- primary phone
- website or business profile URL
- HQ city

#### Service offering

- category
- short service summary
- years in operation
- employee band

#### Service coverage

- city served
- locality notes optional
- site types served
- minimum contract scope optional

#### Compliance

- PSARA status and identifier where relevant
- EPF status and identifier
- ESI status and identifier
- labour license if relevant

#### Operations

- primary contact
- escalation contact
- replacement SLA
- onboarding lead time

#### Documents

- GST certificate
- PSARA license if relevant
- EPF proof
- ESI proof
- one company proof document

## State model

Use a crisp state machine. Avoid ambiguous labels.

### Profile states

- `draft`
- `in_progress`
- `submitted`
- `changes_requested`
- `under_review`
- `active`

### Verification states

- `unverified`
- `pending`
- `verified`
- `rejected`
- `suspended`

### Review rules

- vendor can edit freely in `draft`, `in_progress`, `changes_requested`
- submitting creates or reopens a `verification_review`
- submitting sets `profile_status` to `submitted` and `verification_status` to `pending`
- ops moves review to `under_review`
- approval sets `profile_status` to `active` and `verification_status` to `verified`
- rejection keeps the profile in a review state and sets `verification_status` to `rejected`
- request changes sets `profile_status` to `changes_requested` and keeps `verification_status` at `pending`

## API surface

### Vendor auth and claim

- `POST /api/vendor-auth/signup`
- `POST /api/vendor-auth/login`
- `POST /api/vendor-claims/accept`
- `POST /api/vendors/:id/send-claim`

### Vendor onboarding

- `GET /api/vendor/me`
- `PATCH /api/vendor/me/profile`
- `PATCH /api/vendor/me/service-areas`
- `PATCH /api/vendor/me/compliance-records`
- `POST /api/vendor/me/documents`
- `POST /api/vendor/me/submit-for-review`

### Ops review

- `GET /api/admin/verification-queue`
- `GET /api/admin/vendors/:id/review`
- `POST /api/admin/reviews/:id/assign`
- `PATCH /api/admin/reviews/:id/checklist-items/:itemId`
- `POST /api/admin/reviews/:id/request-changes`
- `POST /api/admin/reviews/:id/approve`
- `POST /api/admin/reviews/:id/reject`

### Notifications

- `POST /api/internal/notifications/dispatch`

This can still be implemented as a server-side helper initially; the route only matters if jobs/services are split later.

## Validation and trust rules

### Form validation

- GSTIN format validation
- phone/email validation
- required field validation by category
- date validity checks for licenses
- reject unsupported file types and oversized uploads

### Review validation

- approval blocked if required checklist items are not passed or explicitly marked not applicable
- approval blocked if required documents are missing
- request changes requires reviewer notes
- rejection requires reviewer notes

### Audit requirements

Log these actions at minimum:

- vendor account created
- vendor claim accepted
- vendor profile submitted
- document uploaded
- review assigned
- checklist item changed
- changes requested
- review approved/rejected
- vendor profile suspended

## Notifications

Keep notifications simple and transactional.

### Events to send

- invite/claim email
- submission received
- changes requested
- verification approved
- verification rejected

### Delivery guidance

- start with email
- add SMS only if already available cheaply
- always reflect message status in app timeline even if delivery fails

## Delivery plan

### Week 1: vendor auth, claim flow, and onboarding shell

Outcomes:

- vendor can sign up, sign in, and access a basic dashboard
- ops can create and send a claim/invite
- vendor can create or claim organization identity

Tasks:

1. Add vendor auth routes and session handling.
2. Build create-or-claim company flow.
3. Add `vendor_claims` table and token lifecycle.
4. Build vendor onboarding dashboard with checklist progress.
5. Build company identity forms.

Exit criteria:

- a vendor can reach a logged-in onboarding dashboard
- an invited vendor can claim a pre-created company

### Week 2: service, compliance, and document capture

Outcomes:

- vendor can complete required fields and upload files

Tasks:

1. Build service offering and service area forms.
2. Build compliance record forms.
3. Add signed upload flow and document metadata handling.
4. Build document upload center with status labels.
5. Add completion logic for checklist sections.

Exit criteria:

- vendor can submit all required onboarding data without ops intervention

### Week 3: ops review console and workflow states

Outcomes:

- ops can review, assign, request changes, approve, or reject

Tasks:

1. Build verification queue filters and sorting.
2. Build vendor review detail page.
3. Seed verification checklist definitions for security staffing.
4. Build checklist review UI with per-item pass/fail states.
5. Implement review decisions and status transitions.
6. Add audit event writes for all review actions.

Exit criteria:

- ops can process a vendor from submitted to final decision

### Week 4: notifications, hardening, and live pilot readiness

Outcomes:

- system is ready for first real vendor pilot

Tasks:

1. Add transactional email templates.
2. Build vendor timeline/status page.
3. Add guardrails for missing docs and invalid approvals.
4. Add test coverage for critical onboarding and review flows.
5. Run 5 to 10 pilot vendor dry runs.
6. Tighten confusing fields based on pilot feedback.

Exit criteria:

- first real vendors can complete onboarding with support but without manual spreadsheet fallback

## Testing strategy

### Unit tests

- checklist completion logic
- profile state transition guards
- claim token validation
- document upload validation

### Integration tests

1. Ops creates vendor shell and sends invite.
2. Vendor claims account and completes profile.
3. Vendor uploads required docs and submits review.
4. Reviewer requests changes.
5. Vendor updates and resubmits.
6. Reviewer approves.
7. Verification status updates correctly across all views.

### Manual QA scenarios

1. Vendor signs up from phone-sized viewport.
2. Vendor pauses midway and resumes later.
3. Reviewer catches an expired or missing document.
4. Reviewer requests changes with notes.
5. Vendor sees notes, updates, and resubmits successfully.
6. Verified status is visible in admin and vendor views.

## Suggested implementation structure

- `src/app/(vendor)/...`
- `src/app/(admin)/verification/...`
- `src/app/api/vendor-auth/...`
- `src/app/api/vendor-claims/...`
- `src/app/api/vendor/me/...`
- `src/app/api/admin/reviews/...`
- `src/server/services/vendor-onboarding/...`
- `src/server/services/verification/...`
- `src/server/services/notifications/...`
- `src/lib/validation/vendor-onboarding/...`

## Important implementation notes

### Mobile-first is a product decision

Do not treat responsive support as a polish item. Vendor completion rates will depend on basic mobile usability.

### Structured data first

Do not accept giant free-text responses for key fields like serviceability, compliance, SLA, or staffing capability. If those fields are not structured now, buyer comparison gets harder later.

### Review checklist should be configurable

Even with one category, store checklist definitions in the database. You will want category-specific verification later.

### Keep “verified” narrow

Verified should mean:

- identity was reviewed
- required compliance was reviewed
- operational fields were completed
- a human reviewer approved

It should not imply service quality or future performance guarantees.

## Risks

### Risk: vendors abandon the flow midway

Mitigation:

- mobile-first design
- visible progress checklist
- tight required field set
- save-as-you-go

### Risk: ops queue becomes bottleneck

Mitigation:

- clear queue prioritization
- checklist-driven reviews
- explicit missing-info detection before assignment

### Risk: verification standards drift across reviewers

Mitigation:

- shared checklist definitions
- required decision notes
- audit trail and spot review by ops admin

### Risk: document collection becomes messy and manual

Mitigation:

- fixed document types
- file status labels
- one review panel with side-by-side checklist

## Deliverables

1. Vendor sign-up and claim flow
2. Vendor onboarding dashboard and forms
3. Document upload center
4. Verification queue and review console
5. Checklist-based review system
6. Transactional notifications
7. Test coverage for the full onboarding lifecycle
8. Pilot-ready workflow for first verified vendors

## Definition of done

This phase is done when:

- a vendor can register or claim a company account without internal engineering help
- the vendor can complete onboarding and submit for review from a phone
- ops can verify or reject vendors from a structured queue
- every key action is auditable
- verified vendors are ready to be used in the buyer sourcing flow

## Recommendation after this phase

Build Phase 3 next: buyer sourcing flow.

Reason:

- once trusted supply exists, the next risk to validate is buyer workflow
- sourcing and RFQ behavior are the shortest path to proving willingness to pay
- AI can layer on top after the manual workflow is already useful
