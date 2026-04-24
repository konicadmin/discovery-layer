import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="border-b bg-gray-50">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Discovery Layer
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold">
            Global public pricing intelligence for buyers, search engines, and AI agents.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600">
            We fetch public vendor pricing pages, extract visible rates, keep the
            source evidence, and publish reviewed pricing signals across US,
            Europe, and global B2B markets.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="border bg-gray-950 px-4 py-2 text-sm text-white" href="/pricing">
              Explore pricing
            </Link>
            <Link className="border px-4 py-2 text-sm" href="/llms.txt">
              Agent entry point
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-8 md:grid-cols-3">
        <div>
          <h2 className="text-sm font-semibold">Real public evidence</h2>
          <p className="mt-2 text-sm text-gray-600">
            Pricing rows come from fetched public pages and stay pending until reviewed.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Global categories</h2>
          <p className="mt-2 text-sm text-gray-600">
            The model is category-agnostic: SaaS, APIs, services, infrastructure,
            marketplaces, and any market where public pricing exists.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">LLM-readable by default</h2>
          <p className="mt-2 text-sm text-gray-600">
            Canonical pages, markdown mirrors, sitemap, robots policy, and llms.txt
            make the public dataset easy to cite.
          </p>
        </div>
      </section>
    </main>
  );
}
