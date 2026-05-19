import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCustomerSession, type CustomerSession } from "@/lib/auth";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defensive: never let an auth issue 500 the entire customer-facing
  // site. If the cookie is malformed, env is misconfigured, or the JWT
  // lib throws, fall back to the logged-out UI.
  let session: CustomerSession | null = null;
  try {
    session = await getCustomerSession();
  } catch (err) {
    console.error("[layout] getCustomerSession failed:", err);
  }
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-sky-700"
          >
            Gilijet
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/b">Find booking</Link>
            </Button>
            {session ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/account">
                  {session.fullName.split(" ")[0]}
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/account/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/account/register">Sign up</Link>
                </Button>
              </>
            )}
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/operator/login">Operator</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-white">
        <div className="container py-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <div className="font-semibold text-slate-900">Gilijet</div>
              <p className="mt-2 text-xs text-slate-600">
                Boat tickets across Indonesia. Verified operators, transparent
                prices, fair refunds.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Company</div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  <Link href="/about" className="text-slate-600 hover:text-sky-700 hover:underline">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-slate-600 hover:text-sky-700 hover:underline">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/operator/login" className="text-slate-600 hover:text-sky-700 hover:underline">
                    For operators
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Legal</div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  <Link href="/terms" className="text-slate-600 hover:text-sky-700 hover:underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-slate-600 hover:text-sky-700 hover:underline">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/refunds" className="text-slate-600 hover:text-sky-700 hover:underline">
                    Refund Policy
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Support</div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  <Link href="/b" className="text-slate-600 hover:text-sky-700 hover:underline">
                    Find my booking
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@gilijet.com"
                    className="text-slate-600 hover:text-sky-700 hover:underline"
                  >
                    support@gilijet.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://wa.me/6281234567890"
                    className="text-slate-600 hover:text-sky-700 hover:underline"
                  >
                    WhatsApp
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} PT Gilijet Nusantara · Payments
            processed by Xendit, licensed by Bank Indonesia
          </div>
        </div>
      </footer>
    </div>
  );
}
