import { prisma } from "@/server/db/client";
import { PricingDecisionRow } from "./decision-row";

export const dynamic = "force-dynamic";

export default async function PricingQueue() {
  const [pending, counts] = await Promise.all([
    prisma.publicPricingSignal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        vendorProfile: { include: { organization: true, hqCity: true } },
      },
    }),
    prisma.publicPricingSignal.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);
  const bucket: Record<string, number> = {};
  for (const c of counts) bucket[c.status] = c._count._all;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pricing signals</h1>
        <div className="text-xs text-gray-500">
          pending {bucket.pending ?? 0} · published {bucket.published ?? 0} · rejected{" "}
          {bucket.rejected ?? 0} · expired {bucket.expired ?? 0}
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Extracted from public web sources. A signal is visible on the vendor&apos;s
        public page only after approval. Approval does <em>not</em> imply
        verification — it only asserts the extraction is faithful to the source
        text.
      </p>
      <table className="min-w-full text-sm bg-white border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-3 py-2">Vendor</th>
            <th className="px-3 py-2">Signal</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Normalized PGPM</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Excerpt</th>
            <th className="px-3 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((s) => (
            <PricingDecisionRow
              key={s.id}
              id={s.id}
              vendorName={s.vendorProfile.organization.displayName}
              city={s.vendorProfile.hqCity?.name ?? "—"}
              signalType={s.signalType}
              unit={s.unit}
              priceValue={Number(s.priceValue)}
              currency={s.currency}
              normalizedPgpm={s.normalizedPgpm ? Number(s.normalizedPgpm) : null}
              normalizationNotes={s.normalizationNotes}
              confidence={Number(s.confidence)}
              excerpt={s.extractedText}
              minQuantity={s.minQuantity}
              minContractMonths={s.minContractMonths}
            />
          ))}
          {pending.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">
                No pending pricing signals.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
