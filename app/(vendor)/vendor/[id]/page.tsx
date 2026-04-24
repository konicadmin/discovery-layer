import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { SubmitForReviewButton } from "./submit-button";

export const dynamic = "force-dynamic";

const REQUIRED_DOC_TYPES = [
  "gst_certificate",
  "psara_license",
  "epf_certificate",
  "esi_certificate",
] as const;

export default async function VendorOnboardingDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id },
    include: {
      organization: true,
      hqCity: true,
      complianceRecords: true,
      documents: { include: { documentFile: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      serviceAreas: true,
    },
  });
  if (!vendor) notFound();

  const completion = computeCompletion(vendor);
  const submittable = ["draft", "in_progress", "changes_requested"].includes(
    vendor.profileStatus,
  );
  const latestReview = vendor.reviews[0];

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-6">
      <header>
        <div className="text-xs text-gray-500">Vendor onboarding</div>
        <h1 className="text-xl font-semibold mt-1">{vendor.organization.displayName}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {vendor.hqCity?.name ?? "—"} · profile {vendor.profileStatus} · verification{" "}
          {vendor.verificationStatus}
        </div>
      </header>

      <section className="bg-white border rounded p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Onboarding completion</div>
          <div className="text-sm">{completion.percent}%</div>
        </div>
        <div className="h-2 bg-gray-100 rounded mt-2 overflow-hidden">
          <div
            className="h-full bg-green-500"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {completion.items.map((it) => (
            <li key={it.label} className="flex items-center gap-2">
              <span
                className={`inline-block w-3 h-3 rounded-full ${
                  it.done ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              <span className={it.done ? "text-gray-700" : "text-gray-500"}>{it.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {latestReview && (
        <section className="bg-white border rounded p-4">
          <div className="text-sm font-medium">Latest review</div>
          <div className="text-xs text-gray-500 mt-1">
            Status: {latestReview.status} · opened{" "}
            {latestReview.createdAt.toISOString().slice(0, 10)}
          </div>
          {latestReview.decisionNotes && (
            <div className="mt-2 text-sm bg-amber-50 border border-amber-200 rounded p-3">
              <div className="text-xs text-amber-800 font-medium mb-1">Reviewer notes</div>
              {latestReview.decisionNotes}
            </div>
          )}
        </section>
      )}

      <section className="bg-white border rounded p-4 space-y-2">
        <div className="text-sm font-medium">Sections</div>
        <Link
          href={`/admin/vendors/${vendor.id}`}
          className="block text-sm text-blue-700 hover:underline"
        >
          View full profile (admin view) →
        </Link>
      </section>

      <SubmitForReviewButton vendorProfileId={vendor.id} disabled={!submittable} />
    </main>
  );
}

function computeCompletion(vendor: {
  serviceSummary: string | null;
  hqCityId: string | null;
  organization: { gstin: string | null };
  serviceAreas: Array<{ id: string }>;
  complianceRecords: Array<{ complianceType: string; identifier: string | null }>;
  documents: Array<{ documentType: string }>;
}) {
  const items = [
    { label: "Service summary", done: Boolean(vendor.serviceSummary) },
    { label: "GSTIN provided", done: Boolean(vendor.organization.gstin) },
    { label: "HQ city set", done: Boolean(vendor.hqCityId) },
    { label: "Service area added", done: vendor.serviceAreas.length > 0 },
    {
      label: "PSARA compliance recorded",
      done: vendor.complianceRecords.some(
        (c) => c.complianceType === "psara" && Boolean(c.identifier),
      ),
    },
    ...REQUIRED_DOC_TYPES.map((type) => ({
      label: `Document: ${type}`,
      done: vendor.documents.some((d) => d.documentType === type),
    })),
  ];
  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { items, percent };
}
