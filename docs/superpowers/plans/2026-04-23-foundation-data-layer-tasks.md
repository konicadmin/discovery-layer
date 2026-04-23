# Foundation & Data Layer — Task Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Companion to:** `2026-04-23-foundation-data-layer.md` (design spec — scope, schema rationale, access model, weekly outcomes). Read that first; this file converts it into bite-sized TDD tasks.

**Goal:** Ship a working backend + thin admin shell: 15+ Postgres tables, auth + RBAC, CRUD APIs for orgs/vendors/requirements/RFQs/quotes, verification state machine, audit log, seeds. Every downstream subsystem (vendor onboarding UI, buyer sourcing UI, AI layer, scraping ingestion) builds on this.

**Architecture:** Single Next.js 15 app (App Router). REST API routes under `app/api/*`. PostgreSQL via Prisma. Zod at API boundaries. Domain logic as pure-ish functions in `src/server/services/*` that take a Prisma client argument (so tests inject a Testcontainers client). **Quote submissions are append-only** — new versions never overwrite old ones. **Verification is a separate lifecycle** from profile completeness. Tests are TDD with real Postgres via Testcontainers — DB mocks are forbidden.

**Tech Stack:** Next.js 15, TypeScript 5.6, Prisma 5, PostgreSQL 16, Zod 3, NextAuth v5 (admin) + phone-OTP (buyers/vendors), argon2, ulid, Vitest 1.6, Testcontainers 10, Tailwind CSS (admin only), pnpm 9.

---

## File Structure

All new files (greenfield repo aside from the existing design doc):

**Config / infra**
- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.example`, `.gitignore`
- `docker-compose.yml` — local Postgres on port 5433
- `.github/workflows/ci.yml`

**Database**
- `prisma/schema.prisma` — all models (added in Phase B, one cluster per task)
- `prisma/seed.ts` — Bengaluru, security category, one ops org, one buyer org, 5 sample vendors

**Shared libs**
- `src/server/db/client.ts` — Prisma singleton (prod) / injectable client (tests)
- `src/lib/result.ts`, `src/lib/id.ts`, `src/lib/errors.ts`
- `src/lib/validation/common.ts`

**Validation (Zod at API boundaries)**
- `src/lib/validation/vendor.ts`, `requirement.ts`, `rfq.ts`, `quote.ts`

**Domain services (DB-aware, Prisma-injected)**
- `src/server/services/organizations/*.ts`
- `src/server/services/vendors/create-vendor.ts`, `update-vendor.ts`, `add-service-area.ts`, `add-compliance-record.ts`, `add-document.ts`
- `src/server/services/verification/state-machine.ts`, `transition.ts`
- `src/server/services/requirements/create-requirement.ts`
- `src/server/services/rfqs/create-rfq.ts`, `issue-rfq.ts`, `add-recipient.ts`
- `src/server/services/quotes/create-quote.ts`, `submit-quote.ts`, `new-version.ts`
- `src/server/services/audit/log-event.ts`
- `src/server/services/authz/guards.ts`

**Auth**
- `src/server/auth/admin.ts` (NextAuth config)
- `src/server/auth/otp.ts`, `src/server/auth/otp-in-memory.ts`
- `src/server/auth/session.ts`

**API routes**
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/otp/request/route.ts`, `app/api/otp/verify/route.ts`
- `app/api/organizations/route.ts`, `app/api/organizations/[id]/route.ts`, `app/api/organizations/[id]/members/route.ts`
- `app/api/vendors/route.ts`, `app/api/vendors/[id]/route.ts`, `app/api/vendors/[id]/service-areas/route.ts`, `app/api/vendors/[id]/compliance-records/route.ts`, `app/api/vendors/[id]/documents/route.ts`, `app/api/vendors/[id]/verification-reviews/route.ts`
- `app/api/requirements/route.ts`, `app/api/requirements/[id]/route.ts`
- `app/api/rfqs/route.ts`, `app/api/rfqs/[id]/route.ts`, `app/api/rfqs/[id]/recipients/route.ts`, `app/api/rfqs/[id]/issue/route.ts`, `app/api/rfqs/[id]/quotes/route.ts`
- `app/api/quotes/[id]/route.ts`, `app/api/quotes/[id]/submit/route.ts`

**Admin shell** (`app/(admin)/*`)
- `layout.tsx`, `page.tsx` (dashboard), `vendors/page.tsx`, `vendors/[id]/page.tsx`, `verification/page.tsx`, `requirements/page.tsx`, `rfqs/page.tsx`, `rfqs/[id]/page.tsx`, `audit/page.tsx`
- `app/login/page.tsx`, `app/globals.css`, `app/layout.tsx`

**Tests** (integration, real Postgres)
- `tests/integration/setup.ts`
- `tests/integration/smoke.test.ts`
- `tests/integration/vendor-crud.test.ts`
- `tests/integration/compliance-documents.test.ts`
- `tests/integration/verification-state.test.ts`
- `tests/integration/requirement-rfq.test.ts`
- `tests/integration/quote-versioning.test.ts`
- `tests/integration/authz.test.ts`
- `tests/integration/audit.test.ts`
- `tests/integration/e2e-sourcing-flow.test.ts`

---

## Task Index

- Phase A — Bootstrap: A1–A4
- Phase B — Schema: B1–B6
- Phase C — Auth & RBAC: C1–C4
- Phase D — Org / Vendor services + APIs: D1–D5
- Phase E — Verification state machine: E1–E2
- Phase F — Requirement / RFQ / Quote services + APIs: F1–F5
- Phase G — Audit log: G1
- Phase H — Admin shell: H1–H4
- Phase I — Seeds + E2E smoke: I1–I2

---

## Phase A — Project Bootstrap

### Task A1: Initialize Next.js 15 + TypeScript + Tailwind scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `eslint.config.mjs`

- [ ] **Step 1: Bootstrap package manager and git**

```bash
cd /Users/C/Documents/discovery-layer
git init 2>/dev/null || true
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "discovery-layer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "3.23.8",
    "@prisma/client": "5.22.0",
    "next-auth": "5.0.0-beta.22",
    "argon2": "0.41.1",
    "ulid": "2.3.0"
  },
  "devDependencies": {
    "@types/node": "20.17.6",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "typescript": "5.6.3",
    "prisma": "5.22.0",
    "tsx": "4.19.2",
    "vitest": "1.6.0",
    "@testcontainers/postgresql": "10.13.2",
    "tailwindcss": "3.4.14",
    "postcss": "8.4.49",
    "autoprefixer": "10.4.20",
    "eslint": "9.14.0",
    "eslint-config-next": "15.0.3"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write Next/Tailwind/ESLint config files**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
  serverExternalPackages: ["argon2", "@prisma/client"],
};
export default nextConfig;
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`eslint.config.mjs`:
```js
import next from "eslint-config-next";
export default [...next];
```

`.gitignore`:
```
node_modules
.next
.env
.env.local
*.log
coverage
.DS_Store
```

`.env.example`:
```
DATABASE_URL=postgresql://discovery:discovery@localhost:5433/discovery?schema=public
NEXTAUTH_SECRET=replace-me-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
OTP_PROVIDER=memory
SEED_ADMIN_EMAIL=admin@konic.net
SEED_ADMIN_PASSWORD=change-me-on-first-login
```

- [ ] **Step 5: Write minimal app shell**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.tsx`:
```tsx
import "./globals.css";
export const metadata = { title: "Discovery Layer", description: "B2B service procurement" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-semibold">Discovery Layer</h1></main>;
}
```

- [ ] **Step 6: Install, typecheck, build**

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm build
```
Expected: `pnpm build` prints "Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 15 + TS + Tailwind scaffold"
```

---

### Task A2: Postgres via docker-compose + Prisma scaffold

**Files:**
- Create: `docker-compose.yml`, `prisma/schema.prisma` (header only), `src/server/db/client.ts`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: discovery-postgres
    environment:
      POSTGRES_USER: discovery
      POSTGRES_PASSWORD: discovery
      POSTGRES_DB: discovery
    ports: ["5433:5432"]
    volumes: ["discovery-pg:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U discovery -d discovery"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  discovery-pg:
```

- [ ] **Step 2: Start Postgres and verify health**

```bash
docker compose up -d postgres
until docker compose ps postgres --format json | grep -q '"Health":"healthy"'; do sleep 1; done
echo "postgres healthy"
```

- [ ] **Step 3: Write minimal Prisma schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 4: Write the Prisma client singleton**

`src/server/db/client.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type DB = PrismaClient;
```

- [ ] **Step 5: Generate client, create init migration, apply**

```bash
pnpm db:generate
pnpm prisma migrate dev --name init --create-only
pnpm db:migrate:deploy
```
Expected: `prisma/migrations/*_init/` directory exists and `migrate deploy` reports migrations applied.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml prisma src/server/db/client.ts
git commit -m "chore: add Postgres docker-compose + Prisma scaffold"
```

---

### Task A3: Vitest + Testcontainers integration harness

**Files:**
- Create: `vitest.config.ts`, `tests/integration/setup.ts`, `tests/integration/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts", "src/**/*.test.ts"],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["tests/integration/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 2: Write Testcontainers harness**

`tests/integration/setup.ts`:
```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) throw new Error("Prisma not initialized — setup.ts missing?");
  return prisma;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("discovery_test")
    .withUsername("discovery")
    .withPassword("discovery")
    .start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
});

afterEach(async () => {
  const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length === 0) return;
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});
```

- [ ] **Step 3: Write the failing smoke test**

`tests/integration/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getPrisma } from "./setup";

describe("integration harness", () => {
  it("connects to a freshly migrated Postgres", async () => {
    const prisma = getPrisma();
    const rows: { one: number }[] = await prisma.$queryRawUnsafe(`SELECT 1 AS one`);
    expect(rows[0]?.one).toBe(1);
  });

  it("has the prisma migrations table", async () => {
    const prisma = getPrisma();
    const rows: { count: bigint }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS count FROM _prisma_migrations`,
    );
    expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test
```
Expected: 2 passing, Testcontainers pulls `postgres:16-alpine` once.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests
git commit -m "test: add Vitest + Testcontainers integration harness"
```

---

### Task A4: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Verify every command runs locally**

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
```
Expected: all five commands exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: add lint/typecheck/test pipeline"
```

---

<!-- PHASE_B_MARKER -->
