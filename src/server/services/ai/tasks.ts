import { createHash } from "node:crypto";
import {
  AiCitationSourceType,
  AiTaskStatus,
  AiTaskType,
  type Prisma,
} from "@prisma/client";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import type { Citation } from "./provider";

function hashInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
}

export async function recordAiTask<T>(
  db: Db,
  args: {
    taskType: AiTaskType;
    modelName: string;
    input: unknown;
    entity?: { type: string; id: string };
    requestedByUserId?: string;
    run: () => Promise<{ output: T; citations?: Citation[] }>;
  },
) {
  return withTx(db, async (tx) => {
    const task = await tx.aiTask.create({
      data: {
        id: newId(),
        taskType: args.taskType,
        status: AiTaskStatus.running,
        modelName: args.modelName,
        inputHash: hashInput(args.input),
        inputJson: args.input as Prisma.InputJsonValue,
        entityType: args.entity?.type,
        entityId: args.entity?.id,
        requestedByUserId: args.requestedByUserId,
      },
    });

    try {
      const result = await args.run();
      const updated = await tx.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.completed,
          outputJson: result.output as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      if (result.citations?.length) {
        await tx.aiTaskCitation.createMany({
          data: result.citations.map((c) => ({
            id: newId(),
            aiTaskId: task.id,
            sourceType: c.sourceType as AiCitationSourceType,
            sourceId: c.sourceId,
            fieldPath: c.fieldPath,
            excerptText: c.excerptText,
          })),
        });
      }
      return { task: updated, output: result.output };
    } catch (err) {
      await tx.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.failed,
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  });
}
