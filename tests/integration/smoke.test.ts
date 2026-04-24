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
