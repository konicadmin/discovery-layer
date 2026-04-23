# discovery-layer

B2B procurement platform for fragmented service categories. V1 wedge: security
staffing in Bengaluru. See `docs/superpowers/plans/` for the full multi-phase
plan.

This repo currently implements all five roadmap phases:
**Phase 1 — Foundation & Data Layer**,
**Phase 2 — Vendor Onboarding & Ops Verification**,
**Phase 3 — Buyer Sourcing Flow**,
**Phase 4 — AI Layer**, and
**Phase 5 — Scraped Ingestion & Public Vendor Pages**.

Phase 1 (foundation):

- Next.js 15 + TypeScript + Tailwind scaffold
- Postgres + Prisma schema (organizations, vendors, requirements, RFQs,
  versioned quotes, verification reviews, audit log)
- Authorization guards and OTP scaffolding
- Service functions: vendor creation, verification state machine, RFQ
  issuance, append-only quote versioning, audit logging
- Internal admin shell at `/admin` (vendors, verification queue,
  requirements, RFQs with compare view, audit log)
- Vitest integration tests against real Postgres
- Seed script for Bengaluru + 5 sample vendors at varying lifecycle stages

Phase 2 (onboarding + verification):

- Schema additions: `vendor_claims`, `notifications`
- Claim flow: send claim → invite notification → accept (binds existing
  user or creates one and grants `vendor_admin`)
- Vendor profile services: profile/org update, service area, compliance
  upsert, document attach
- Verification review workflow: open, assign, set checklist item
  (pending/pass/fail/not_applicable), request changes, approve, reject —
  approval is **gated** on every required checklist item being
  `pass` or `not_applicable`
- Notifications: dispatcher writes a `notifications` row and logs the
  template; swap the inner `deliver` with a real provider later
- Document review: ops marks docs `verified`/`rejected` with notes
- `withTx` helper so services compose without nested `$transaction`
- New API routes:
  - `POST /api/vendors/:id/send-claim`, `POST /api/vendor-claims/accept`
  - `PATCH /api/vendors/:id/profile`, `POST /api/vendors/:id/documents`
  - `POST /api/vendors/:id/submit-for-review`
  - `POST /api/admin/reviews/:id/assign`
  - `PATCH /api/admin/reviews/:id/checklist-items/:itemId`
  - `POST /api/admin/reviews/:id/decision` (approve/reject/request_changes)
  - `POST /api/admin/documents/:id/review`
- New admin UI: review detail page at `/admin/reviews/:id` with inline
  checklist editing and a decision panel that disables `Approve` until
  all required items are resolved
- New vendor portal: `/vendor/claim` for claim acceptance,
  `/vendor/:id` onboarding dashboard with completion checklist and
  Submit-for-review button

Phase 3 (buyer sourcing):

- Schema additions: `rfq_decisions`, `rfq_messages`
- Shortlist engine (deterministic, rules-based): hard filters on
  verified + active + category + city, weighted score across
  category/city/compliance/completeness/response-behavior/recency,
  persists `vendor_shortlist_snapshots`, exposes per-reason detail
- RFQ decision capture (`awarded` / `closed_no_award` / `cancelled`)
  with audit and RFQ status transition; `awarded` enforces invited
  vendor
- Normalized compare builder: latest submitted quote per vendor,
  sorted by grand total, with anomaly flags
  (quote_expired, assumptions_missing, grand_total_missing,
  line_items_missing)
- Inline RFQ messages (`rfq_messages` with visibility + message type)
- Buyer portal at `/buyer`: dashboard, new-requirement form,
  requirement detail with live shortlist panel, RFQ compare page
  with decision panel
- New API routes:
  - `GET/POST /api/buyer/requirements`
  - `POST /api/buyer/requirements/:id/shortlist`
  - `GET /api/buyer/requirements/:id/shortlist`
  - `POST /api/buyer/requirements/:id/rfqs` (create + add recipients +
    optional issue)
  - `GET /api/buyer/rfqs/:id/compare`
  - `POST /api/buyer/rfqs/:id/decision`

Phase 4 (AI layer):

- Schema additions: `ai_tasks`, `ai_task_citations`, `ai_evaluations`
- `AiProvider` interface with three touchpoints:
  `extractRequirement`, `explainShortlist`, `explainCompare`
- **Deterministic provider** ships by default (regex extraction +
  grounded template generation), so no API keys required. A swap
  point in `provider-factory.ts` wires in an Anthropic-backed
  provider when `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` are
  set.
- `recordAiTask` wraps every call in an `ai_tasks` row with status,
  input/output payloads, citations, and error capture — so QA,
  debugging, and offline evals have a uniform audit trail
- Grounding guarantees: `explainShortlist` only emits citations
  matching stored `vendor_shortlist_snapshots`; `explainCompare`
  only references submitted quotes in the compare view
- New API routes:
  - `POST /api/ai/requirements/parse`
  - `POST /api/ai/shortlists/:requirementId/explain`
  - `POST /api/ai/rfqs/:rfqId/compare/explain`
- Buyer UI: AI rationale panels on requirement detail (shortlist
  explanation) and RFQ detail (compare explanation), both lazy
  (explicit Explain click)

Phase 5 (scraped ingestion + public pages):

- Schema additions: `source_urls`, `crawl_runs`,
  `extracted_vendor_candidates`, `evidence_items`,
  `vendor_public_snapshots`, `vendor_page_metrics`,
  `dedupe_reviews`
- Fetcher + Extractor interfaces so tests exercise the pipeline
  without network flakiness. Production plugs in a real provider
  (e.g. Exa, ScrapingBee, headless Chromium) at the same seam
- Candidate matching: auto-merge on exact domain or phone; fuzzy
  name matches route to a dedupe review queue
- Stub creation: candidates promote to a `createdBySource=scrape`
  vendor profile with per-field `evidence_items` (confidence,
  freshness, source URL, observed-at)
- Publishing: `publishSnapshot` suppresses weak records (< 2 evidence
  items), generates a canonical slug, and stores the public summary
  JSON. Trust band derives from `(createdBySource, claimedAt,
  verificationStatus)` — one of `unclaimed_public_record`,
  `claimed_not_verified`, `verified_vendor`
- Public page at `/vendors/:slug` with trust-band chip, public
  evidence table (field + value + type + observed date), and a
  claim form that funnels into the Phase 2 claim flow
- Page metrics: `vendor_page_metrics` tracks daily page views,
  claim clicks, claim starts, claims completed
- New API routes:
  - `GET/POST /api/internal/sources`
  - `POST /api/internal/candidates/:id/match`
  - `POST /api/internal/candidates/:id/create-stub`
  - `POST /api/internal/public-pages/:vendorId/publish`
  - `GET /api/public/vendors/:slug`
  - `POST /api/public/vendors/:slug/claim`

## Local setup

Requires Postgres 14+ on `localhost:5432` with a superuser `discovery`
(password `discovery`) and databases `discovery` (dev) and `discovery_test`
(tests). The original plan prescribed docker-compose; this repo runs against
a local Postgres directly because the build environment lacks a Docker
daemon.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Visit <http://localhost:3000/admin> for the ops console.

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

CI (`.github/workflows/ci.yml`) runs all four against an ephemeral Postgres
service container.

## Repository layout

```
app/                 # Next.js App Router
  (admin)/           # Internal ops console
  api/               # REST endpoints
prisma/
  schema.prisma      # Foundation schema (Phase B)
  migrations/        # Generated migrations
  seed.ts            # Bengaluru + 5 vendors
src/
  lib/               # Shared utilities (id, errors, validation)
  server/
    auth/            # Session type, OTP scaffold
    db/client.ts     # Prisma singleton
    services/        # Domain services (Prisma-injected)
      audit/
      authz/
      organizations/
      quotes/
      requirements/
      rfqs/
      vendors/
      verification/
tests/integration/   # Vitest + real Postgres
docs/superpowers/    # Phase plans (Phase 1–5)
```

## Deviations from the published plan

- **No Docker dependency.** `docker-compose.yml` is omitted; the dev DB and
  the test DB live on a local Postgres. CI uses GitHub Actions service
  containers instead of Testcontainers.
- **NextAuth deferred.** The Phase 1 spec named NextAuth v5 beta + phone OTP.
  V1 ships only the session type, the authorization guards, and an
  in-memory OTP store. Provider integration is a follow-on task.
- **Admin shell uses Server Components without auth gating yet.** Routes
  must be protected before being exposed to anyone outside the local
  development environment.

## Plan documents

- [Roadmap overview](docs/superpowers/plans/2026-04-23-product-roadmap-overview.md)
- [Phase 1 — Foundation & Data Layer](docs/superpowers/plans/2026-04-23-foundation-data-layer.md) (this phase)
- [Phase 1 task list](docs/superpowers/plans/2026-04-23-foundation-data-layer-tasks.md)
- [Phase 2 — Vendor Onboarding & Ops Verification](docs/superpowers/plans/2026-04-23-vendor-onboarding-ops-verification.md)
- [Phase 3 — Buyer Sourcing Flow](docs/superpowers/plans/2026-04-23-buyer-sourcing-flow.md)
- [Phase 4 — AI Layer](docs/superpowers/plans/2026-04-23-ai-layer.md)
- [Phase 5 — Scraped Ingestion & Public Pages](docs/superpowers/plans/2026-04-23-scraped-ingestion-public-pages.md)
