import { prisma } from "@/server/db/client";
import { RequirementForm } from "./requirement-form";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage() {
  const [orgs, cities, categories] = await Promise.all([
    prisma.organization.findMany({ where: { type: "buyer" }, orderBy: { displayName: "asc" } }),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
    }),
  ]);
  const users = await prisma.user.findMany({ take: 50, orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">New sourcing brief</h1>
      <p className="text-xs text-gray-500">
        Creates a draft requirement. Generate the shortlist and issue an RFQ from the
        detail page.
      </p>
      <RequirementForm
        buyers={orgs.map((o) => ({ id: o.id, label: o.displayName }))}
        cities={cities.map((c) => ({ id: c.id, label: `${c.name}, ${c.state}` }))}
        categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        users={users.map((u) => ({ id: u.id, label: `${u.name} (${u.email ?? "—"})` }))}
      />
    </div>
  );
}
