"use client";

import Link from "next/link";

/**
 * Route-level error boundary. Next.js renders this when a Server Component
 * throws during the render of any non-group route under /app that isn't
 * wrapped by a more specific error.tsx.
 *
 * The `digest` is a short id Next.js also writes to the server log, so ops
 * can correlate the user-facing incident with server-side stack traces.
 */
export default function RootError({
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
          Discovery Layer
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Something went wrong.</h1>
        <p className="mt-3 text-sm text-gray-600">
          The page could not be rendered. If this keeps happening, please report
          the identifier below — it&apos;s written to our server logs so we can
          trace the specific cause.
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
          <Link className="border px-4 py-2 text-sm" href="/">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
