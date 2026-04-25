import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { getPrisma } from "./setup";

describe("service categories seed", () => {
  beforeAll(() => {
    execSync("pnpm db:seed", {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "pipe",
    });
  });

  it("seeds ai_models, ai_infra, dev_tools, saas_ops, data_infra", async () => {
    const prisma = getPrisma();
    const codes = ["ai_models", "ai_infra", "dev_tools", "saas_ops", "data_infra"];
    const rows = await prisma.serviceCategory.findMany({
      where: { code: { in: codes } },
      orderBy: { code: "asc" },
    });
    expect(rows.map((r) => r.code).sort()).toEqual([...codes].sort());
  });
});
