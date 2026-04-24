"use client";

/**
 * Catches errors that happen while rendering the root layout itself —
 * when app/error.tsx can't be used because the layout isn't mounted.
 * Must include <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: 0,
          background: "#fff",
          color: "#111827",
        }}
      >
        <main style={{ maxWidth: 560, padding: "64px 24px", margin: "0 auto" }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6b7280",
            }}
          >
            Discovery Layer
          </p>
          <h1 style={{ fontSize: 24, marginTop: 12 }}>
            Something went wrong at the root.
          </h1>
          <p style={{ marginTop: 12, color: "#4b5563", fontSize: 14 }}>
            We couldn&apos;t render the application shell. Please report the
            identifier below if this keeps happening.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              digest: {error.digest}
            </p>
          )}
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#111827",
                color: "#fff",
                border: 0,
                padding: "10px 16px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
