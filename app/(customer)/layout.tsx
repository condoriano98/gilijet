import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthNav } from "@/components/customer/auth-nav";

// Sync layout. The auth-aware buttons live in <AuthNav>, a client
// component that fetches /api/auth/me on mount. This keeps the
// layout — and all child routes that don't otherwise read cookies
// or hit the DB — fully statically renderable.
//
// `gj-brand` scopes the electric-blue Gilibali (Figma) palette to the
// consumer surface; operator/admin keep the Mekari palette.
export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gj-brand flex min-h-screen flex-col bg-[#F9F9F9]">
      {/* Blue utility bar (Figma) — contact left, language right */}
      <div className="bg-brand text-white">
        <div className="container flex h-9 items-center justify-between text-xs sm:text-[13px]">
          <div className="flex items-center gap-3">
            <a href="https://wa.me/6281236061818" className="hover:underline">+62 812-3606-1818</a>
            <span className="text-white/40">|</span>
            <a href="mailto:info@balinusafast.com" className="hidden hover:underline sm:inline">info@balinusafast.com</a>
          </div>
          <span className="text-white/90">English</span>
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-2">
          <Link
            href="/"
            className="shrink-0 text-2xl font-extrabold tracking-tight text-brand"
          >
            Gili<span className="text-brand-cyan">bali</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="rounded-full px-2 text-brand-ink hover:bg-brand-periwinkle hover:text-brand sm:px-3">
              <Link href="/blog">Blog</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full px-2 text-brand-ink hover:bg-brand-periwinkle hover:text-brand sm:px-3">
              <Link href="/b">Find booking</Link>
            </Button>
            <AuthNav />
            <Button asChild size="sm" className="ml-1 rounded-pill bg-brand px-4 font-semibold text-white hover:bg-brand-dark">
              <Link href="/search">Book now</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}

/* Signature Gilibali footer: electric-blue field, real links, stacked
   translucent white waves along the bottom edge (Figma "Footer"). */
function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-brand text-white">
      <div className="container relative z-10 grid gap-8 pb-32 pt-14 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xl font-extrabold tracking-tight">
            Gili<span className="text-brand-cyan">bali</span>
          </div>
          <p className="mt-3 max-w-xs text-white/80">
            Let Journey Begin with Gilibali! Book fast boats across Indonesia —
            verified operators, transparent prices, fair refunds.
          </p>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold">Company</div>
          <ul className="space-y-2 text-white/80">
            <li><Link href="/about" className="hover:text-white hover:underline">About</Link></li>
            <li><Link href="/contact" className="hover:text-white hover:underline">Contact</Link></li>
            <li><Link href="/blog" className="hover:text-white hover:underline">Blog</Link></li>
            <li><Link href="/operator/login" className="hover:text-white hover:underline">For operators</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold">Legal</div>
          <ul className="space-y-2 text-white/80">
            <li><Link href="/terms" className="hover:text-white hover:underline">Terms of Service</Link></li>
            <li><Link href="/privacy" className="hover:text-white hover:underline">Privacy Policy</Link></li>
            <li><Link href="/refunds" className="hover:text-white hover:underline">Refund Policy</Link></li>
            <li><Link href="/legal/wahana-virendra" className="hover:text-white hover:underline">Wahana Virendra Terms</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold">Support</div>
          <ul className="space-y-2 text-white/80">
            <li><Link href="/b" className="hover:text-white hover:underline">Find my booking</Link></li>
            <li><a href="mailto:info@balinusafast.com" className="hover:text-white hover:underline">info@balinusafast.com</a></li>
            <li><a href="https://wa.me/6281236061818" className="hover:text-white hover:underline">WhatsApp</a></li>
          </ul>
        </div>
      </div>

      <div className="container relative z-10 -mt-24 pb-10 text-xs text-white/70">
        © {year} CV Hi Bali Nusa Tenggara · Payments processed by Xendit,
        licensed by Bank Indonesia
      </div>

      <WaveBand />
    </footer>
  );
}

function WaveBand() {
  const Wave = ({ opacity, bottom }: { opacity: number; bottom: number }) => (
    <svg
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      className="absolute inset-x-0 h-[90px] w-full"
      style={{ bottom, opacity }}
    >
      <path
        d="M0,48 C240,86 480,10 720,38 C960,66 1200,20 1440,52 L1440,90 L0,90 Z"
        fill="#fff"
      />
    </svg>
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 overflow-hidden">
      <Wave opacity={0.14} bottom={26} />
      <Wave opacity={0.2} bottom={12} />
      <Wave opacity={0.32} bottom={0} />
    </div>
  );
}
