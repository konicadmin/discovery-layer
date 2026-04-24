-- CreateEnum
CREATE TYPE "AiTaskType" AS ENUM ('requirement_parse', 'shortlist_rationale', 'quote_explanation', 'ops_summary');

-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "AiCitationSourceType" AS ENUM ('requirement', 'vendor_profile', 'compliance_record', 'quote', 'quote_line_item', 'shortlist_snapshot');

-- CreateTable
CREATE TABLE "ai_tasks" (
    "id" TEXT NOT NULL,
    "task_type" "AiTaskType" NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'queued',
    "model_name" TEXT NOT NULL,
    "input_hash" TEXT,
    "input_json" JSONB NOT NULL,
    "output_json" JSONB,
    "error_message" TEXT,
    "requested_by_user_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_citations" (
    "id" TEXT NOT NULL,
    "ai_task_id" TEXT NOT NULL,
    "source_type" "AiCitationSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "field_path" TEXT,
    "excerpt_text" TEXT,

    CONSTRAINT "ai_task_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_evaluations" (
    "id" TEXT NOT NULL,
    "task_type" "AiTaskType" NOT NULL,
    "dataset_name" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "input_json" JSONB NOT NULL,
    "expected_output_json" JSONB NOT NULL,
    "actual_output_json" JSONB,
    "score" DECIMAL(5,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_tasks_task_type_status_idx" ON "ai_tasks"("task_type", "status");

-- CreateIndex
CREATE INDEX "ai_tasks_entity_type_entity_id_idx" ON "ai_tasks"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_task_citations_ai_task_id_idx" ON "ai_task_citations"("ai_task_id");

-- CreateIndex
CREATE INDEX "ai_evaluations_task_type_dataset_name_idx" ON "ai_evaluations"("task_type", "dataset_name");

-- AddForeignKey
ALTER TABLE "ai_task_citations" ADD CONSTRAINT "ai_task_citations_ai_task_id_fkey" FOREIGN KEY ("ai_task_id") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
