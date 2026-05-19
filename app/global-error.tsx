"use client";

// Global error boundary. Renders when something throws above any
// other error boundary or layout — including in the root layout
// itself. Gives us a useful page (and the error digest) instead of
// the bare "Application error" Vercel page.
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
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(to bottom, #f0f9ff, #ffffff)",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 32,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 8px",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: "#64748b",
              margin: "0 0 24px",
              fontSize: 14,
            }}
          >
            The page failed to load. Our team has been notified. Please try
            again in a moment.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontFamily: "ui-monospace, monospace",
                margin: "0 0 24px",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                background: "#0ea5e9",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "10px 20px",
                background: "white",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
