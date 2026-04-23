import { AiTaskType } from "@prisma/client";
import { type Db, withTx } from "@/server/db/with-tx";
import { compareRfq } from "@/server/services/quotes/compare";
import { getAiProvider } from "./provider-factory";
import { recordAiTask } from "./tasks";
import type { Citation } from "./provider";

export async function explainCompare(
  db: Db,
  args: { rfqId: string; requestedByUserId?: string },
) {
  const provider = getAiProvider();

  return withTx(db, async (tx) => {
    const compare = await compareRfq(tx, args.rfqId);

    const result = await recordAiTask<{
      summary: string;
      bullets: string[];
      watchouts: string[];
      citations: Citation[];
    }>(tx, {
      taskType: AiTaskType.quote_explanation,
      modelName: provider.modelName,
      input: { rfqId: args.rfqId, rowCount: compare.rows.length },
      entity: { type: "rfq", id: args.rfqId },
      requestedByUserId: args.requestedByUserId,
      run: async () => {
        const output = await provider.explainCompare({
          rfqCode: compare.rfqCode,
          rows: compare.rows.map((r) => ({
            vendorProfileId: r.vendorProfileId,
            vendorName: r.vendorName,
            grandTotal: r.grandTotal,
            monthlySubtotal: r.monthlySubtotal,
            statutoryCostTotal: r.statutoryCostTotal,
            serviceFeeTotal: r.serviceFeeTotal,
            flags: r.flags,
            assumptions: r.assumptions,
          })),
          missingResponses: compare.missingResponses,
        });
        return { output, citations: output.citations };
      },
    });

    return { taskId: result.task.id, ...result.output };
  });
}
