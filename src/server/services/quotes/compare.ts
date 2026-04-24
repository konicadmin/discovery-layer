import { QuoteSubmissionStatus } from "@/generated/prisma";
import { NotFoundError } from "@/lib/errors";
import { type Db, withTx } from "@/server/db/with-tx";

export type CompareRow = {
  vendorProfileId: string;
  vendorName: string;
  verificationStatus: string;
  quoteId: string;
  versionNumber: number;
  submittedAt: Date | null;
  validUntil: Date | null;
  currency: string;
  monthlySubtotal: number | null;
  statutoryCostTotal: number | null;
  serviceFeeTotal: number | null;
  grandTotal: number | null;
  assumptions: Record<string, unknown> | null;
  lineItems: Array<{
    lineType: string;
    label: string;
    amount: number | null;
    notes: string | null;
  }>;
  flags: string[];
};

export type CompareResult = {
  rfqId: string;
  rfqCode: string;
  rows: CompareRow[];
  missingResponses: string[]; // vendor display names with no submitted quote
};

function toNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof x === "object" && x && "toNumber" in (x as object)) {
    const fn = (x as { toNumber: () => number }).toNumber;
    return typeof fn === "function" ? fn.call(x) : null;
  }
  return null;
}

export async function compareRfq(db: Db, rfqId: string): Promise<CompareResult> {
  return withTx(db, async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: rfqId },
      include: {
        recipients: {
          include: { vendorProfile: { include: { organization: true } } },
        },
        quotes: {
          include: {
            vendorProfile: { include: { organization: true } },
            lineItems: true,
          },
        },
      },
    });
    if (!rfq) throw new NotFoundError("rfq", rfqId);

    // Latest submitted version per vendor.
    const latestByVendor = new Map<string, (typeof rfq.quotes)[number]>();
    for (const q of rfq.quotes) {
      if (q.submissionStatus !== QuoteSubmissionStatus.submitted) continue;
      const prev = latestByVendor.get(q.vendorProfileId);
      if (!prev || prev.versionNumber < q.versionNumber) {
        latestByVendor.set(q.vendorProfileId, q);
      }
    }

    const rows: CompareRow[] = [];
    const missing: string[] = [];
    for (const recipient of rfq.recipients) {
      const q = latestByVendor.get(recipient.vendorProfileId);
      if (!q) {
        missing.push(recipient.vendorProfile.organization.displayName);
        continue;
      }

      const flags: string[] = [];
      if (q.validUntil && q.validUntil.getTime() < Date.now()) flags.push("quote_expired");
      const assumptions =
        (q.assumptionsJson as Record<string, unknown> | null | undefined) ?? null;
      if (!assumptions || Object.keys(assumptions).length === 0) {
        flags.push("assumptions_missing");
      }
      if (!q.grandTotal) flags.push("grand_total_missing");
      if (q.lineItems.length === 0) flags.push("line_items_missing");

      rows.push({
        vendorProfileId: q.vendorProfileId,
        vendorName: q.vendorProfile.organization.displayName,
        verificationStatus: q.vendorProfile.verificationStatus,
        quoteId: q.id,
        versionNumber: q.versionNumber,
        submittedAt: q.submittedAt,
        validUntil: q.validUntil,
        currency: q.currency,
        monthlySubtotal: toNumber(q.monthlySubtotal),
        statutoryCostTotal: toNumber(q.statutoryCostTotal),
        serviceFeeTotal: toNumber(q.serviceFeeTotal),
        grandTotal: toNumber(q.grandTotal),
        assumptions,
        lineItems: q.lineItems.map((li) => ({
          lineType: li.lineType,
          label: li.label,
          amount: toNumber(li.amount),
          notes: li.notes ?? null,
        })),
        flags,
      });
    }

    rows.sort((a, b) => (a.grandTotal ?? Infinity) - (b.grandTotal ?? Infinity));

    return { rfqId: rfq.id, rfqCode: rfq.rfqCode, rows, missingResponses: missing };
  });
}
