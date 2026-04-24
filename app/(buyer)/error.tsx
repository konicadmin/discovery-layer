"use client";

export default function BuyerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-xl">
        <h1 className="text-lg font-semibold">Buyer page failed to render</h1>
        <p className="mt-2 text-sm text-gray-600">
          We couldn&apos;t load your sourcing view. This is usually a transient
          backend issue — try again.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-500">
            digest: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 border bg-gray-950 px-4 py-2 text-sm text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
