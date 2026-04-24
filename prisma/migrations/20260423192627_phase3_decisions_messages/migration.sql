-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('awarded', 'closed_no_award', 'cancelled', 'reopened');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('comment', 'clarification', 'system_update', 'deadline_reminder');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('internal', 'buyer_vendor', 'system');

-- CreateTable
CREATE TABLE "rfq_decisions" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "selected_vendor_profile_id" TEXT,
    "decision_status" "DecisionStatus" NOT NULL,
    "reason_code" TEXT,
    "decision_notes" TEXT,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_messages" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "sender_org_id" TEXT,
    "message_type" "MessageType" NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfq_decisions_rfq_id_idx" ON "rfq_decisions"("rfq_id");

-- CreateIndex
CREATE INDEX "rfq_messages_rfq_id_created_at_idx" ON "rfq_messages"("rfq_id", "created_at");

-- AddForeignKey
ALTER TABLE "rfq_decisions" ADD CONSTRAINT "rfq_decisions_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_messages" ADD CONSTRAINT "rfq_messages_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
