"use client";

import Link from "next/link";

// Customer-route error boundary. Less drastic than global-error.tsx —
// renders inside the customer layout (so header/footer still work).
export default function CustomerRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          We hit an unexpected issue loading this page. Please try again.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
