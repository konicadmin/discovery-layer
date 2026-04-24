"use client";

import Link from "next/link";

export default function VendorPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="mx-auto max-w-xl px-5 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Vendor profile
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          This vendor page is temporarily unavailable.
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          We couldn&apos;t render the public vendor record. Please try again.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-500">
            digest: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="border bg-gray-950 px-4 py-2 text-sm text-white"
          >
            Try again
          </button>
          <Link className="border px-4 py-2 text-sm" href="/pricing">
            Browse pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
