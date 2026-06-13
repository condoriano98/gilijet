import Link from "next/link";
import { isGoogleOAuthEnabled } from "@/lib/google-oauth";

export function GoogleSignInButton({
  next,
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  if (!isGoogleOAuthEnabled()) return null;

  const href = next
    ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
    : "/api/auth/google/start";

  return (
    <>
      <Link
        href={href}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <GoogleGlyph />
        {label}
      </Link>
      <div className="relative my-3 text-center text-xs uppercase tracking-wide text-slate-400">
        <span className="bg-white px-2 relative z-10">or</span>
        <span className="absolute inset-x-0 top-1/2 -z-0 border-t border-slate-200" />
      </div>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.92A9 9 0 0 0 0 9c0 1.45.35 2.82.92 4.05l3.05-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A9 9 0 0 0 .92 4.95l3.05 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
