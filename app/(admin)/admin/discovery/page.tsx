import { DiscoveryCandidateStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { CandidateRow } from "./candidate-row";
import { CrawlBatchButton } from "./crawl-batch-button";
import { NewCandidateForm } from "./new-candidate-form";

export const dynamic = "force-dynamic";

export default async function DiscoveryQueue() {
  const [candidates, counts, categories] = await Promise.all([
    prisma.discoveryCandidate.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        serviceCategory: { select: { code: true, label: true } },
        approvedSource: { select: { id: true, url: true, status: true } },
      },
    }),
    prisma.discoveryCandidate.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
      select: { id: true, code: true, label: true },
    }),
  ]);

  const bucket: Record<string, number> = {};
  for (const c of counts) bucket[c.status] = c._count._all;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Discovery candidates</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Source backlog. Add a vendor name, homepage, or category/search term
            here. Run the pricing-page guesser, then approve a candidate URL —
            approval registers it in <code>source_urls</code>. Click <em>Crawl
            approved</em> to fetch + extract pricing signals into the review
            queue.
          </p>
          <div className="mt-2 text-xs text-gray-500">
            new {bucket.new ?? 0} · reviewed {bucket.reviewed ?? 0} · approved{" "}
            {bucket.approved ?? 0} · crawled {bucket.crawled ?? 0} · rejected{" "}
            {bucket.rejected ?? 0}
          </div>
        </div>
        <CrawlBatchButton approvedCount={bucket.approved ?? 0} />
      </div>

      <NewCandidateForm categories={categories} />

      <div>
        <h2 className="text-sm font-semibold mb-2">Backlog</h2>
        <table className="min-w-full text-sm bg-white border">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Vendor / search</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Homepage</th>
              <th className="px-3 py-2">Guessed pricing URL</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <CandidateRow
                key={c.id}
                id={c.id}
                vendorName={c.vendorName}
                searchTerm={c.searchTerm}
                category={c.serviceCategory?.label ?? null}
                homepageUrl={c.homepageUrl}
                guessedPricingUrl={c.guessedPricingUrl}
                guessConfidence={
                  c.guessConfidence != null ? Number(c.guessConfidence) : null
                }
                status={c.status as DiscoveryCandidateStatus}
                approvedSourceId={c.approvedSource?.id ?? null}
                approvedSourceUrl={c.approvedSource?.url ?? null}
                createdAt={c.createdAt.toISOString()}
              />
            ))}
            {candidates.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-gray-500 text-sm"
                >
                  No candidates yet — add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
