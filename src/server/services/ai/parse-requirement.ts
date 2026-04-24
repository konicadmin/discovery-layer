import { AiTaskType } from "@/generated/prisma";
import { ValidationError } from "@/lib/errors";
import { type Db, withTx } from "@/server/db/with-tx";
import { getAiProvider } from "./provider-factory";
import { recordAiTask } from "./tasks";
import type { RequirementExtraction } from "./provider";

export async function parseRequirement(
  db: Db,
  args: {
    rawText: string;
    categoryCode: string;
    requestedByUserId?: string;
  },
) {
  if (!args.rawText?.trim()) {
    throw new ValidationError("rawText required");
  }
  const provider = getAiProvider();

  return withTx(db, async (tx) => {
    const cities = await tx.city.findMany({ select: { id: true, name: true } });
    const result = await recordAiTask<ReturnType<typeof freeze>>(tx, {
      taskType: AiTaskType.requirement_parse,
      modelName: provider.modelName,
      input: { rawText: args.rawText, categoryCode: args.categoryCode },
      requestedByUserId: args.requestedByUserId,
      run: async () => {
        const extraction = await provider.extractRequirement({
          rawText: args.rawText,
          categoryCode: args.categoryCode,
          knownCities: cities,
        });
        return {
          output: {
            data: extraction.data as Partial<RequirementExtraction>,
            missingFields: extraction.missingFields,
            ambiguousFields: extraction.ambiguousFields,
            confidenceByField: extraction.confidenceByField,
            normalizedSummary: extraction.normalizedSummary,
          },
        };
      },
    });

    return { taskId: result.task.id, ...result.output };
  });
}

// helper type alias for recordAiTask generic inference
function freeze() {
  return {} as {
    data: Partial<RequirementExtraction>;
    missingFields: string[];
    ambiguousFields: string[];
    confidenceByField: Record<string, number>;
    normalizedSummary: string;
  };
}
