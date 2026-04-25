import { PrismaClient } from "@/generated/prisma";

const SECURITY_SEED_VENDOR_NAMES = [
  "Karnataka Watch & Ward",
  "Bengaluru Secure Solutions",
  "Whitefield Guard Services",
  "Electronic City Sentries",
  "Hosur Road Security Co",
  "Gotham Protective Services",
  "Bay Area Security Group",
  "Chicago Guardian Inc",
  "Thames Valley Security Ltd",
  "Berlin Wachdienst GmbH",
  "Paris Gardiennage SAS",
] as const;

async function main() {
  const prisma = new PrismaClient();
  try {
    const matched = await prisma.organization.findMany({
      where: { legalName: { in: [...SECURITY_SEED_VENDOR_NAMES] } },
      select: { id: true, legalName: true, region: true },
      orderBy: { legalName: "asc" },
    });

    const deleted = await prisma.organization.deleteMany({
      where: { id: { in: matched.map((org) => org.id) } },
    });

    console.log(
      JSON.stringify(
        {
          matched: matched.map((org) => ({
            id: org.id,
            legalName: org.legalName,
            region: org.region,
          })),
          deletedOrganizations: deleted.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
