import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyRegionPricingPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  permanentRedirect(`/pricing/${category}`);
}
