# Product Roadmap Overview

## Program thesis

Build a procurement product first, then layer in acceleration and acquisition:

1. foundation and data layer
2. vendor onboarding and ops verification
3. buyer sourcing flow
4. AI assistance on top of the workflow
5. scraped ingestion and public vendor pages as a supply-acquisition layer

This order protects the trust surface and keeps every phase independently testable.

## Phase sequence

### Phase 1

[Foundation & Data Layer](/Users/C/Documents/discovery-layer/docs/superpowers/plans/2026-04-23-foundation-data-layer.md)

Build the system of record: schema, auth, RBAC, APIs, seeds, admin shell, and auditability.

### Phase 2

[Vendor Onboarding & Ops Verification](/Users/C/Documents/discovery-layer/docs/superpowers/plans/2026-04-23-vendor-onboarding-ops-verification.md)

Build the trust engine: vendor claim/register flow, structured profile completion, document upload, checklist review, and verification.

### Phase 3

[Buyer Sourcing Flow](/Users/C/Documents/discovery-layer/docs/superpowers/plans/2026-04-23-buyer-sourcing-flow.md)

Build the paid workflow: requirement intake, rules-based shortlisting, RFQ issuance, quote collection, compare, and decision capture.

### Phase 4

[AI Layer](/Users/C/Documents/discovery-layer/docs/superpowers/plans/2026-04-23-ai-layer.md)

Add assistive AI: requirement parsing, shortlist rationale, quote explanations, evals, and rollout controls.

### Phase 5

[Scraped Ingestion & Public Vendor Pages](/Users/C/Documents/discovery-layer/docs/superpowers/plans/2026-04-23-scraped-ingestion-public-pages.md)

Add the acquisition layer: public evidence ingestion, stub vendor creation, freshness, public pages, claim flow, and conversion measurement.

## Program-level rules

- verified vendor records and scraped public records must stay clearly separated
- structured fields stay primary even when AI is added
- quote data should remain versioned and comparable
- every phase should be useful without needing the next one
- growth layers should not weaken the trust layer

## Suggested execution order

If one team is building sequentially:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

If a larger team is parallelizing after Phase 1:

1. start Phase 2 immediately
2. start Phase 3 once Phase 2 data contracts are stable
3. start Phase 4 only after Phase 3 core UX is usable
4. start Phase 5 only after verified-supply economics are visible

## Key checkpoints

- after Phase 2: do verified vendors complete onboarding and pass review at an acceptable rate
- after Phase 3: do buyers complete sourcing in-product and find compare views valuable
- after Phase 4: do AI features measurably reduce effort without harming trust
- after Phase 5: do public pages convert into claimed and later verified vendors

## Next optional layer

Only after these phases are stable should the team consider:

- governed MCP access
- external machine-readable data APIs
- broader category expansion
- more aggressive acquisition loops
