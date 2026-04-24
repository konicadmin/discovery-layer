import { beforeAll, afterAll, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { PrismaClient } from "@/generated/prisma";

/**
 * Integration tests run against a real Postgres database.
 *
 * In an environment with Docker available, the original plan calls for
 * Testcontainers to spin up an ephemeral container per run. This harness
 * targets a long-lived local Postgres at TEST_DATABASE_URL instead, drops
 * and recreates the schema on startup, and truncates between tests.
 */

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://discovery:discovery@localhost:5432/discovery_test?schema=public";

let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) throw new Error("Prisma not initialized — setup.ts missing?");
  return prisma;
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_URL;

  // Drop & recreate the public schema to guarantee a clean migration run.
  const adminPrisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await adminPrisma.$executeRawUnsafe(`CREATE SCHEMA public`);
  await adminPrisma.$disconnect();

  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "inherit",
  });

  prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
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
});
