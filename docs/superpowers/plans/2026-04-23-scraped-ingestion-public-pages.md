# Scraped Ingestion & Public Vendor Pages Plan

## Goal

Ship the supply-acquisition layer that sits on top of the curated procurement system:

- ingest public vendor evidence from selected web sources
- create unclaimed vendor records before direct onboarding
- attach freshness, provenance, and confidence to public evidence
- publish indexable public vendor pages without overstating trust
- convert public records into claimed and later verified vendors through the existing ops flow

This phase should end with a measured, trust-safe acquisition channel for vendor supply. It should not dilute the verified procurement product.

## Product outcome

At the end of this phase, the team can:

- discover vendors from public web sources in one target category and city
- create stub vendor records with evidence-backed fields
- keep public claims clearly separated from verified claims
- publish public vendor pages that can be claimed by vendors
- route claimed vendors into the existing onboarding and verification workflow
- measure whether public pages convert into claimed and verified supply

This is a growth and data-acquisition layer, not the core procurement loop.

## Scope

### In scope

- source discovery and URL intake
- web extraction for one category and one geography
- evidence and freshness model
- deduplication and canonical vendor identity logic
- public vendor page generation
- vendor claim flow from public pages
- SEO basics for public pages
- ops review tools for scraped records
- metrics for claim, verification, and usage conversion

### Out of scope

- generic crawl of the whole web
- automated verification from public data alone
- broad multi-category coverage
- open external MCP server
- buyer-facing price guarantees from scraped content
- autonomous web browsing agents in production

## Phase objective

Prove that public vendor pages can become a viable supply-acquisition channel without contaminating the trust surface of the procurement product.

The real questions this phase should answer are:

- can we source enough vendor coverage from the public web to matter
- can we keep public evidence honest and legible
- do unclaimed pages convert into claims and later verification

## Strategic guardrails

### Verified and public records must never blur

Publicly scraped data is useful for discovery, not trust. Every page and internal data surface must distinguish:

- unclaimed
- claimed
- verified

### Evidence beats assertion

Every public field should have provenance:

- source URL
- source type
- extraction date
- freshness score
- confidence score when inferred

### Narrow category focus is mandatory

Start with:

- security staffing
- Bengaluru
- 100 to 300 source sites maximum

Do not broaden scope until claim and verification economics are understood.

## System architecture

### Core components

1. source discovery queue
2. fetch and extract pipeline
3. canonicalization and deduplication service
4. evidence store
5. vendor stub creation and update logic
6. public page renderer
7. claim conversion flow
8. freshness and re-crawl scheduler

### Recommended processing stages

1. discover candidate URLs
2. fetch public page content
3. extract structured fields
4. normalize and score evidence
5. match to existing vendor or create stub
6. queue ops review when confidence is low or duplicates are likely
7. publish eligible public page
8. monitor claim and revisit freshness later

## Data model additions

### Reuse existing tables

- `organizations`
- `vendor_profiles`
- `vendor_service_areas`
- `vendor_service_categories`
- `vendor_compliance_records`
- `vendor_claims`
- `document_files`
- `audit_events`

### Add these tables

1. `source_urls`
2. `crawl_runs`
3. `extracted_vendor_candidates`
4. `evidence_items`
5. `vendor_public_snapshots`
6. `vendor_page_metrics`
7. `dedupe_reviews`

### `source_urls`

Fields:

- `id`
- `url`
- `domain`
- `source_type` (`vendor_site`, `directory`, `listing`, `social_profile`, `government_record`, `other`)
- `discovery_method` (`manual`, `search`, `import`)
- `status` (`queued`, `active`, `blocked`, `failed`, `archived`)
- `last_crawled_at`
- `next_crawl_at`
- `created_at`

### `crawl_runs`

Fields:

- `id`
- `source_url_id`
- `status` (`queued`, `running`, `completed`, `failed`)
- `http_status`
- `content_hash`
- `fetched_at`
- `error_message`
- `raw_text_storage_key`
- `created_at`

### `extracted_vendor_candidates`

Transient or reviewable extraction result before canonical merge.

Fields:

- `id`
- `crawl_run_id`
- `legal_name`
- `display_name`
- `website`
- `phone`
- `email`
- `city_text`
- `category_text`
- `service_summary`
- `extraction_confidence`
- `status` (`pending_match`, `matched`, `created_stub`, `rejected`)
- `created_at`

### `evidence_items`

This becomes the backbone of public truthfulness.

Fields:

- `id`
- `vendor_profile_id`
- `source_url_id`
- `crawl_run_id`
- `field_name`
- `raw_value`
- `normalized_value`
- `source_excerpt`
- `evidence_type` (`explicit`, `inferred`)
- `confidence_score`
- `freshness_score`
- `observed_at`
- `expires_at`
- `created_at`

### `vendor_public_snapshots`

Denormalized publishable surface for public pages.

Fields:

- `id`
- `vendor_profile_id`
- `slug`
- `page_title`
- `meta_description`
- `summary_json`
- `public_status` (`draft`, `published`, `suppressed`)
- `claim_cta_variant`
- `last_published_at`
- `created_at`

### `vendor_page_metrics`

Fields:

- `id`
- `vendor_profile_id`
- `snapshot_id`
- `metric_date`
- `page_views`
- `claim_clicks`
- `claim_starts`
- `claims_completed`

### `dedupe_reviews`

Fields:

- `id`
- `candidate_id`
- `existing_vendor_profile_id`
- `review_status` (`pending`, `merged`, `separate`, `rejected`)
- `review_notes`
- `reviewed_by_user_id`
- `reviewed_at`

## Public data model rules

### Field classes

Split public fields into three buckets:

1. safe factual identity fields
2. serviceability and capability fields
3. commercial evidence fields

### Safe factual identity fields

Allowed if supported by evidence:

- vendor name
- website
- primary public phone or email
- city served
- category served
- short service summary

### Serviceability and capability fields

Allowed only when explicit on source page:

- office city
- site types served
- operating areas
- service categories

### Commercial evidence fields

Treat this as sparse and optional.

Allowed only with clear provenance:

- public starting price statements
- price ranges
- package-style offers
- rate-card snippets

Never imply complete comparable pricing if the source page only says "contact us."

## Public trust model

Every public vendor page needs a clear trust band.

### Public trust statuses

- `unclaimed_public_record`
- `claimed_not_verified`
- `verified_vendor`

### Labeling rules

- `unclaimed_public_record`: generated from public web evidence, not confirmed by vendor
- `claimed_not_verified`: vendor has claimed record but verification is incomplete
- `verified_vendor`: verified through the platform's onboarding and ops review process

### Visual disclosure rules

- show source count
- show last updated date
- show field freshness where important
- show "public web evidence" labels on scraped fields
- never use the platform's verification badge on scraped-only records

## Deduplication strategy

This is one of the highest-risk parts of the phase.

### Matching keys

- exact or fuzzy legal name
- website domain
- GSTIN if publicly available
- primary phone
- city and category overlap

### Merge logic

- auto-merge only on strong identifiers such as exact domain or GSTIN
- send ambiguous cases to ops review
- preserve all evidence when merging

### Human review triggers

- similar names with different domains
- same phone number across multiple names
- multi-city branches with unclear legal identity

## Claim flow

The public page should convert a vendor into the existing trust funnel.

### Claim journey

1. Vendor lands on public page.
2. Vendor clicks claim CTA.
3. Vendor verifies email or phone.
4. System creates or completes `vendor_claims`.
5. Vendor enters onboarding flow from Phase 2.
6. After approval, public status updates to verified.

### Claim rules

- one active claim token per vendor at a time
- suspicious claims route to ops review
- claim does not auto-verify any public field

## Public page UX

The page should feel useful, indexable, and honest.

### Minimum sections

1. vendor identity summary
2. category and service areas
3. evidence-backed details
4. trust and status panel
5. source and freshness information
6. claim CTA

### Content rules

- keep summaries short and factual
- separate explicit evidence from inferred data
- avoid superlatives and marketing copy not present in source
- do not fabricate missing fields for completeness

## SEO basics

This should be pragmatic, not overbuilt.

### Minimum SEO work

- clean category-city-vendor slugs
- title and meta description generation
- sitemap support for published pages
- canonical URLs
- structured data where appropriate for organization details

### Publishing rules

- suppress pages with too little evidence
- suppress pages with unresolved duplicate risk
- suppress pages for blocked domains or takedown requests

## Ops console additions

Minimum screens:

1. source URL queue
2. extraction review queue
3. duplicate review queue
4. public page preview
5. claim conversion dashboard

## Extraction approach

Keep extraction bounded and reviewable.

### Inputs

- curated source URLs
- target field schema
- extraction prompts or rules

### Outputs

- normalized identity fields
- serviceability fields
- optional commercial evidence
- confidence score per field
- source excerpt per field

### Important rule

If extraction confidence is low, store the evidence item but do not publish the field automatically.

## Freshness model

Public web data decays quickly.

### Freshness scoring

Use a simple score based on:

- age of latest crawl
- source type reliability
- field stability
- evidence consistency across crawls

### Refresh cadence

- higher cadence for published high-traffic pages
- lower cadence for low-signal or low-traffic records
- immediate review if a previously published page loses core evidence

## Metrics

This phase should be judged on conversion and data quality, not raw page count.

### Core metrics

- discovered source URLs
- extracted candidate vendors
- dedupe merge rate
- published pages
- page views
- claim starts
- claim completions
- claim-to-verification conversion
- percentage of published pages with strong evidence

## API surface

### Internal ingestion APIs

- `POST /api/internal/sources`
- `POST /api/internal/crawls/run`
- `POST /api/internal/extractions/:crawlRunId/process`
- `POST /api/internal/candidates/:id/match`
- `POST /api/internal/public-pages/:vendorId/publish`

### Public page APIs

- `GET /api/public/vendors/:slug`
- `POST /api/public/vendors/:slug/claim`

### Internal metrics APIs

- `GET /api/admin/public-pages/metrics`
- `GET /api/admin/dedupe-queue`

## Delivery plan

### Week 1: source intake, evidence model, and stub creation

Outcomes:

- source URLs can be added and crawled
- extracted fields can be stored as evidence
- vendor stubs can be created safely

Tasks:

1. Add source, crawl, candidate, and evidence tables.
2. Build source intake UI for ops.
3. Build basic fetch and extraction pipeline for one source type.
4. Build stub vendor creation from reviewed candidates.
5. Add audit logging for ingestion events.

Exit criteria:

- ops can create stub vendors from public evidence without touching core vendor verification logic

### Week 2: dedupe, public snapshots, and basic public pages

Outcomes:

- public records can be merged safely and rendered as pages

Tasks:

1. Build dedupe rules and manual review queue.
2. Build public snapshot generation.
3. Build public vendor page route and template.
4. Add trust-status panel and evidence disclosures.
5. Add suppression rules for weak records.

Exit criteria:

- at least a sample set of public pages can be published with clear disclosure and no duplicate chaos

### Week 3: claim flow and ops dashboards

Outcomes:

- vendors can claim public pages and enter the onboarding funnel

Tasks:

1. Build claim CTA and claim token flow.
2. Connect claim completion to Phase 2 onboarding.
3. Build claim conversion dashboard.
4. Add suspicious-claim review handling.
5. Add public page metrics collection.

Exit criteria:

- a vendor can claim a public record and continue into the existing onboarding workflow

### Week 4: freshness, SEO, and pilot measurement

Outcomes:

- system is ready for a limited pilot in one city/category

Tasks:

1. Add freshness scoring and recrawl scheduling.
2. Add sitemap and metadata generation.
3. Run quality review on a pilot set of published pages.
4. Track claim and verification conversion for pilot cohort.
5. Tighten publishing thresholds based on early data.

Exit criteria:

- pilot pages are live, measurable, and clearly separated from verified supply

## Testing strategy

### Unit tests

- dedupe scoring
- freshness score calculation
- publish eligibility rules
- claim token validation

### Integration tests

1. Source URL is added and crawled.
2. Candidate extraction creates evidence items.
3. Candidate matches or creates vendor stub.
4. Public page is published with correct trust label.
5. Vendor claims page and enters onboarding flow.
6. Verified status later updates the public page correctly.

### Manual QA scenarios

1. Weak evidence page is suppressed.
2. Duplicate-looking vendors are held for review.
3. Page clearly shows unclaimed versus verified status.
4. Claim flow works from mobile and desktop.
5. Source evidence on the page matches stored excerpts.

## Important implementation notes

### This phase is not a directory business by default

Public pages should feed the procurement product. If page production starts driving roadmap choices away from trust and sourcing workflow, the phase is going off course.

### Public evidence should be append-only where practical

Do not overwrite previous evidence blindly. Keep historical evidence for debugging freshness and extraction quality.

### Suppression is a feature

It is better to publish fewer truthful pages than many thin or misleading ones.

### Build for later MCP, but do not expose it yet

The evidence model and public snapshots should be machine-readable later, but do not ship external agent access until the trust and governance model is stable.

## Risks

### Risk: trust surface gets diluted by scraped stubs

Mitigation:

- separate public trust labels
- no verification badge on scraped-only records
- suppression thresholds for weak evidence

### Risk: service pages rarely contain usable pricing

Mitigation:

- treat pricing as optional evidence
- optimize pages for identity and serviceability first
- do not position public data as complete quote intelligence

### Risk: dedupe errors pollute vendor identity

Mitigation:

- conservative auto-merge rules
- manual review queue
- evidence preservation on merge

### Risk: claim conversion is too low

Mitigation:

- start with a narrow category and geography
- measure page quality and CTA variants
- use claimed records as the success metric, not crawl volume

## Deliverables

1. Public source intake and crawl pipeline
2. Evidence and freshness model
3. Stub vendor creation and dedupe workflow
4. Public vendor page templates
5. Claim flow into onboarding
6. SEO and basic metrics
7. Pilot dashboards for conversion and quality

## Definition of done

This phase is done when:

- the system can create and maintain evidence-backed public vendor records
- public pages clearly distinguish unclaimed, claimed, and verified states
- vendors can claim those pages and enter onboarding
- published pages are measurable and governed by suppression rules
- the team can evaluate whether public supply acquisition is worth scaling

## Recommendation after this phase

Build Phase 6 next only if the data is trustworthy enough: external machine-readable access such as MCP or a governed data API.

Reason:

- external access only makes sense once the curated dataset, public evidence model, and trust labels are stable
- exposing unstable or weakly governed data too early would damage credibility
