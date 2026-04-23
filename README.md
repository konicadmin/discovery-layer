# discovery-layer

B2B procurement platform for fragmented service categories. V1 wedge: security
staffing in Bengaluru. See `docs/superpowers/plans/` for the full multi-phase
plan.

This repo currently implements **Phase 1 — Foundation & Data Layer**:

- Next.js 15 + TypeScript + Tailwind scaffold
- Postgres + Prisma schema (organizations, vendors, requirements, RFQs,
  versioned quotes, verification reviews, audit log)
- Authorization guards and OTP scaffolding
- Service functions: vendor creation, verification state machine, RFQ
  issuance, append-only quote versioning, audit logging
- Internal admin shell at `/admin` (vendors, verification queue,
  requirements, RFQs with compare view, audit log)
- Two API routes: `POST /api/vendors`, `POST /api/vendors/:id/transition`
- Vitest integration tests against real Postgres
- Seed script for Bengaluru + 5 sample vendors at varying lifecycle stages

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
