import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="max-w-4xl text-4xl font-semibold">
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
      </section>
    </main>
  );
}
