import { AiTaskType } from "@/generated/prisma";
import { NotFoundError } from "@/lib/errors";
import { type Db, withTx } from "@/server/db/with-tx";
import { getAiProvider } from "./provider-factory";
import { recordAiTask } from "./tasks";
import type { Citation } from "./provider";

type Reason = { component: string; score: number; weight: number; detail: string };

export async function explainShortlist(
  db: Db,
  args: { requirementId: string; requestedByUserId?: string },
) {
  const provider = getAiProvider();

  return withTx(db, async (tx) => {
    const requirement = await tx.buyerRequirement.findUnique({
      where: { id: args.requirementId },
      include: { city: true, serviceCategory: true },
    });
    if (!requirement) throw new NotFoundError("buyer_requirement", args.requirementId);

    const snapshots = await tx.vendorShortlistSnapshot.findMany({
      where: { buyerRequirementId: requirement.id },
      include: { vendorProfile: { include: { organization: true } } },
      orderBy: { matchScore: "desc" },
    });

    const rows = snapshots.map((s) => ({
      vendorProfileId: s.vendorProfileId,
      vendorName: s.vendorProfile.organization.displayName,
      score: s.matchScore ? Number(s.matchScore) : 0,
      reasons: (s.matchReasonsJson as unknown as Reason[]) ?? [],
    }));

    const result = await recordAiTask<{
      summary: string;
      bullets: string[];
      watchouts: string[];
      citations: Citation[];
    }>(tx, {
      taskType: AiTaskType.shortlist_rationale,
      modelName: provider.modelName,
      input: { requirementId: requirement.id, rowCount: rows.length },
      entity: { type: "buyer_requirement", id: requirement.id },
      requestedByUserId: args.requestedByUserId,
      run: async () => {
        const output = await provider.explainShortlist({
          requirement: {
            title: requirement.title,
            cityName: requirement.city.name,
            headcount: requirement.headcountRequired ?? undefined,
            shiftPattern: requirement.shiftPattern ?? undefined,
          },
          rows,
        });
        return { output, citations: output.citations };
      },
    });

    return { taskId: result.task.id, ...result.output };
  });
}
