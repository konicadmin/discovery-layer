# Buyer Sourcing Flow Plan

## Goal

Ship the first buyer-facing procurement workflow for the platform:

- buyers can create a sourcing brief for one service category
- the system can shortlist relevant verified vendors using structured filters
- buyers can issue RFQs to selected vendors
- vendors can submit quotes against a standardized structure
- buyers can compare quotes in a normalized way and make a sourcing decision

This phase should end with a complete sourcing loop that works without AI and proves the core product value: better procurement outcomes from structured, trusted vendor data.

## Product outcome

At the end of this phase, the team can:

- onboard a buyer organization with internal and buyer-side users
- capture a structured requirement for security staffing in Bengaluru
- shortlist suitable verified vendors by serviceability and compliance
- issue an RFQ to multiple vendors
- collect quote responses in comparable format
- compare vendors on trust, serviceability, and commercials
- record sourcing outcomes and buyer decisions

This is the first true product loop for the buyer-paid SaaS.

## Scope

### In scope

- buyer organization setup
- buyer requirement intake form
- vendor shortlist generation using rules and filters
- RFQ creation and issuance
- vendor quote response flow for invited vendors
- normalized quote comparison UI
- internal notes and sourcing decision capture
- basic notifications and reminders for RFQ activity
- audit logging for sourcing events

### Out of scope

- AI requirement parsing
- AI-generated shortlist rationale
- AI-assisted negotiation or recommendations
- automated contract generation
- payment, billing, or invoicing
- scraped vendor acquisition and public pages
- dynamic pricing intelligence beyond submitted quotes

## Phase objective

Prove that buyers will use the platform to run a real sourcing process because it is faster, clearer, and more trustworthy than email threads and spreadsheets.

The thing to validate here is not search traffic or AI novelty. It is whether a buyer finds enough value in structured procurement workflow to pay.

## User roles

### Buyer side

- `buyer_admin`: owns the sourcing workflow, can create requirements, issue RFQs, and finalize decisions
- `buyer_member`: can draft requirements, review quotes, and collaborate internally

### Vendor side

- `vendor_admin`: can receive RFQs and submit final quotes
- `vendor_member`: can help prepare quote drafts

### Internal side

- `ops_admin`: can inspect all sourcing activity, support operations, and intervene if needed
- `ops_reviewer`: can monitor workflow health but should not be required for normal buyer actions

## Core user journeys

### Journey 1: buyer creates a sourcing brief

1. Buyer logs in and opens the sourcing dashboard.
2. Buyer creates a new requirement.
3. Buyer enters site details, headcount, shifts, term, start date, and mandatory compliance needs.
4. System validates required fields and saves draft.
5. Buyer reviews recommended shortlist candidates.

### Journey 2: buyer shortlists vendors and issues RFQ

1. Buyer sees vendors filtered by city, category, verification status, and serviceability.
2. Buyer reviews vendor summaries and selects recipients.
3. Buyer sets response deadline and sends RFQ.
4. Vendors receive notifications and can open the RFQ detail.

### Journey 3: vendors submit quotes

1. Vendor opens invited RFQ.
2. Vendor enters quote data in structured fields and line items.
3. Vendor saves draft, revises if needed, and submits.
4. System records versioned quote and status.

### Journey 4: buyer compares quotes and makes a decision

1. Buyer opens compare view after enough responses arrive.
2. Buyer sees normalized totals, line items, assumptions, and vendor trust signals.
3. Buyer adds internal notes and marks preferred vendor.
4. Buyer closes the RFQ with a decision outcome.

## UX surfaces

### Buyer web app

Minimum screens:

1. Buyer dashboard
2. Requirements list
3. New requirement form
4. Requirement detail
5. Vendor shortlist page
6. RFQ builder and issuance screen
7. RFQ detail and activity timeline
8. Quote compare table
9. Decision summary screen

### Vendor RFQ response view

Minimum screens:

1. RFQ inbox
2. RFQ detail
3. Quote draft form
4. Quote review and submit screen
5. Submitted quote history

### Internal visibility

Minimum screens:

1. Sourcing pipeline overview
2. RFQ detail inspector
3. Quote submission monitor

## Data model additions and refinements

This phase should mostly reuse the foundation schema and operational vendor base.

### Reuse existing tables

- `organizations`
- `users`
- `organization_memberships`
- `vendor_profiles`
- `vendor_service_areas`
- `vendor_service_categories`
- `vendor_compliance_records`
- `buyer_requirements`
- `rfqs`
- `rfq_recipients`
- `quotes`
- `quote_line_items`
- `audit_events`

### Add or refine these tables

1. `buyer_requirement_sites`
2. `rfq_messages`
3. `rfq_decisions`
4. `vendor_shortlist_snapshots`
5. `quote_attachments` if quote support docs are needed

### `buyer_requirement_sites`

Use this if one requirement may later involve multiple sites. Even if V1 mostly uses one site, this prevents repainting the schema.

Fields:

- `id`
- `buyer_requirement_id`
- `site_name`
- `site_type`
- `city_id`
- `locality`
- `address_text`
- `headcount_required`
- `shift_pattern`
- `operating_hours`
- `start_date`
- `notes`

### `vendor_shortlist_snapshots`

Stores who was recommended at the time of sourcing and why, even before AI.

Fields:

- `id`
- `buyer_requirement_id`
- `vendor_profile_id`
- `match_score`
- `match_reasons_json`
- `excluded`
- `excluded_reason`
- `created_at`

This is useful for auditability and later AI/ranking comparisons.

### `rfq_messages`

Tracks structured communication on an RFQ timeline.

Fields:

- `id`
- `rfq_id`
- `sender_user_id`
- `sender_org_id`
- `message_type` (`comment`, `clarification`, `system_update`, `deadline_reminder`)
- `body`
- `visibility` (`internal`, `buyer_vendor`, `system`)
- `created_at`

### `rfq_decisions`

Captures sourcing outcomes cleanly.

Fields:

- `id`
- `rfq_id`
- `selected_vendor_profile_id`
- `decision_status` (`awarded`, `closed_no_award`, `cancelled`, `reopened`)
- `decision_notes`
- `decided_by_user_id`
- `decided_at`

## Requirement schema

Keep the requirement structured around procurement logic, not a generic free-text brief.

### Required fields for security staffing

- requirement title
- city
- site type
- number of guards
- shift pattern
- day/night coverage
- relief staffing requirement
- supervisor requirement
- contract term
- target start date
- required compliance
- special site constraints
- response deadline

### Optional but useful fields

- preferred vendor size band
- union/non-union preference if relevant
- equipment expectation
- training requirement
- onboarding timeline expectation
- incumbent vendor presence

## Shortlisting logic

Phase 3 should use deterministic rules. Do not add model scoring yet.

### Shortlist filters

- vendor is `verified`
- vendor serves required category
- vendor serves required city
- required compliance records are present and valid
- vendor is active and not suspended

### Match scoring

Use a simple weighted score:

- category match
- city/serviceability match
- compliance completeness
- profile completeness
- optional operational fit fields

This score is only for sorting. The buyer should still decide.

### Exclusion reasons

Always show why vendors were excluded:

- not verified
- city not served
- required compliance missing
- category mismatch
- inactive or suspended

## RFQ workflow

### RFQ lifecycle states

- `draft`
- `ready_to_issue`
- `issued`
- `collecting_quotes`
- `decision_pending`
- `awarded`
- `closed_no_award`
- `cancelled`

### Recipient lifecycle states

- `queued`
- `sent`
- `viewed`
- `responded`
- `declined`
- `expired`

### Workflow rules

- RFQ cannot be issued with zero recipients
- RFQ deadline must be after issue time
- only verified vendors can receive RFQs
- invited vendor can submit multiple draft edits but only submitted versions count
- issuing or closing an RFQ writes timeline events

## Quote normalization model

The compare experience is the product core. Avoid blobs and screenshots.

### Summary fields

- monthly subtotal
- statutory costs
- management or service fee
- equipment or add-ons
- taxes if represented
- grand total
- valid until

### Structured assumptions

- headcount basis
- shift basis
- relief assumption
- weekly off assumption
- supervisor inclusion
- replacement SLA
- billing frequency

### Line item categories

- manpower
- statutory
- administrative fee
- equipment
- onboarding cost
- other

### Quote rules

- submitted quote becomes immutable
- new revision creates a new quote version
- compare view defaults to latest submitted version per vendor

## Buyer compare UI

This screen should feel operational and trustworthy, not “smart.”

### Columns to show

- vendor name
- verification status
- coverage city
- key compliance indicators
- monthly subtotal
- service fee
- grand total
- assumptions summary
- quote submitted at
- internal notes

### Compare affordances

- sort by total cost
- filter by responded only
- expand line-item breakdown
- pin selected vendors for side-by-side comparison
- view vendor profile inline
- flag quote anomalies manually

### Decision capture

Buyer should be able to:

- mark preferred vendor
- record no-award reason
- close sourcing cycle

## Notifications and reminders

Keep messaging simple and action-focused.

### Events

- RFQ issued
- vendor viewed RFQ
- vendor submitted quote
- deadline reminder
- RFQ closed

### Reminder logic

- reminder 48 hours before deadline
- reminder 12 hours before deadline if still no response
- stop reminders after submit or decline

## API surface

### Buyer requirement APIs

- `POST /api/buyer/requirements`
- `GET /api/buyer/requirements`
- `GET /api/buyer/requirements/:id`
- `PATCH /api/buyer/requirements/:id`
- `POST /api/buyer/requirements/:id/shortlist`

### Shortlist APIs

- `GET /api/buyer/requirements/:id/shortlist`
- `PATCH /api/buyer/requirements/:id/shortlist`

### RFQ APIs

- `POST /api/buyer/rfqs`
- `GET /api/buyer/rfqs`
- `GET /api/buyer/rfqs/:id`
- `PATCH /api/buyer/rfqs/:id`
- `POST /api/buyer/rfqs/:id/issue`
- `POST /api/buyer/rfqs/:id/close`

### Vendor response APIs

- `GET /api/vendor/rfqs`
- `GET /api/vendor/rfqs/:id`
- `POST /api/vendor/rfqs/:id/quotes`
- `PATCH /api/vendor/quotes/:id`
- `POST /api/vendor/quotes/:id/submit`
- `POST /api/vendor/rfqs/:id/decline`

### Compare and decision APIs

- `GET /api/buyer/rfqs/:id/compare`
- `POST /api/buyer/rfqs/:id/decision`
- `POST /api/buyer/rfqs/:id/messages`

## Delivery plan

### Week 1: buyer requirement flow and shortlist engine

Outcomes:

- buyer can create structured requirements
- system generates filtered shortlist candidates from verified vendors

Tasks:

1. Build buyer dashboard and requirement list.
2. Build new requirement form with validation.
3. Add shortlist service using rules-based filters.
4. Add shortlist snapshot persistence.
5. Build shortlist review screen with include/exclude actions.

Exit criteria:

- buyer can create a requirement and see a valid shortlist from seeded verified vendors

### Week 2: RFQ creation and vendor inbox

Outcomes:

- buyer can issue RFQ
- vendor can see invited RFQs

Tasks:

1. Build RFQ creation flow from a requirement.
2. Build recipient selection and deadline controls.
3. Implement RFQ issue action and notifications.
4. Build vendor RFQ inbox and detail page.
5. Add activity timeline entries for issuance and recipient events.

Exit criteria:

- buyer can issue an RFQ and invited vendors can open it

### Week 3: quote submission and compare UI

Outcomes:

- vendor can submit quotes
- buyer can compare normalized responses

Tasks:

1. Build quote draft form with line-item entry.
2. Implement quote versioning and submission guards.
3. Build compare table with totals, assumptions, and breakdown view.
4. Add vendor profile inline drawer or detail panel.
5. Add manual internal notes for quote review.

Exit criteria:

- at least 3 invited vendors can submit comparable quotes in a test scenario

### Week 4: decision workflow, reminders, and hardening

Outcomes:

- buyer can complete sourcing cycle end to end

Tasks:

1. Build decision capture and RFQ closure flow.
2. Add reminder notifications and stop conditions.
3. Add tests for permission boundaries and workflow transitions.
4. Run pilot dry-runs with internal or design-partner scenarios.
5. Tighten confusing quote fields based on real responses.

Exit criteria:

- one complete sourcing cycle can move from draft requirement to awarded or closed-no-award

## Testing strategy

### Unit tests

- shortlist rule scoring
- RFQ status transition guards
- quote line-item total calculations
- decision closure rules

### Integration tests

1. Buyer creates requirement.
2. System generates shortlist from verified vendor pool.
3. Buyer selects vendors and issues RFQ.
4. Vendors receive and open RFQ.
5. Vendors submit structured quotes.
6. Buyer compares and records decision.
7. Audit history reflects key sourcing events.

### Manual QA scenarios

1. Buyer creates a requirement from desktop and edits draft later.
2. Vendor receives RFQ and responds from a simple web flow.
3. Buyer compares 3 quotes with different assumptions.
4. One vendor declines and stops receiving reminders.
5. Buyer closes with no award and records reason.

## Suggested implementation structure

- `src/app/(buyer)/...`
- `src/app/(vendor)/rfqs/...`
- `src/app/api/buyer/requirements/...`
- `src/app/api/buyer/rfqs/...`
- `src/app/api/vendor/rfqs/...`
- `src/server/services/requirements/...`
- `src/server/services/shortlisting/...`
- `src/server/services/rfqs/...`
- `src/server/services/quotes/...`
- `src/server/services/decisions/...`
- `src/lib/validation/sourcing/...`

## Important implementation notes

### Rules-first is intentional

Do not skip to AI parsing or ranking before this workflow works manually. If the deterministic workflow is not valuable, AI only hides the weakness.

### Shortlist output should be auditable

Store shortlist reasons and exclusions. This will matter later when buyers ask why a vendor did or did not appear.

### Compare should reveal assumptions, not just totals

Many bad procurement choices happen because two quotes look similar at summary level but rely on different staffing or compliance assumptions. Make those assumptions visible.

### Award decision should remain explicit

Do not auto-select cheapest quote. The system should help compare, not pretend cost alone is the decision.

## Risks

### Risk: too few verified vendors for useful shortlists

Mitigation:

- only launch this phase once Phase 2 has a credible verified base in one city/category
- allow ops-assisted vendor creation where needed

### Risk: quote structure is too rigid for vendors

Mitigation:

- keep a compact required line-item model
- allow assumptions and notes fields
- review 3 to 5 real quote samples before locking form

### Risk: buyers still export to spreadsheets

Mitigation:

- make compare view immediately useful
- show line-item breakdowns, assumptions, and trust signals in one screen
- capture internal notes in-product

### Risk: RFQ workflow becomes ops-heavy

Mitigation:

- keep buyer actions self-serve
- use internal users only for support, not core execution

## Deliverables

1. Buyer requirement intake flow
2. Rules-based shortlist engine
3. RFQ creation and issuance flow
4. Vendor RFQ inbox and quote response flow
5. Normalized compare UI
6. Decision capture and RFQ closure
7. Notification and reminder logic
8. Test coverage for end-to-end sourcing flow

## Definition of done

This phase is done when:

- a buyer can create a sourcing request without internal engineering help
- the platform can shortlist relevant verified vendors for that request
- invited vendors can submit structured quotes through the product
- buyer can compare responses without spreadsheet cleanup
- the sourcing cycle can be formally closed with an outcome

## Recommendation after this phase

Build Phase 4 next: AI layer on top of the sourcing workflow.

Reason:

- by then there is a real workflow, real data, and real friction to assist
- AI can improve intake, explanation, and speed without carrying the product alone
- it is safer to add AI to a useful product than to use AI to compensate for a weak workflow
