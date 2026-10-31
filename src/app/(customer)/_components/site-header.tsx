import Link from 'next/link';
import { Button } from '@/shared/ui/button';
import { AuthNav } from '@/app/(customer)/_components/auth-nav';
import { MobileNav } from '@/app/(customer)/_components/mobile-nav';
import { Logo } from '@/app/(customer)/_components/logo';

/**
 * White header of the redesign. Below `sm` only "Book now" and the menu render:
 * the full row is wider than any phone and made the whole document scroll
 * sideways. Everything else lives in <MobileNav>.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-line bg-white/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-2 lg:h-[72px]">
        <Link href="/" className="shrink-0 text-brand" aria-label="Gilifast home">
          <Logo className="items-start" />
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full px-3 text-[15px] font-medium text-brand-text hover:bg-brand-surface hover:text-brand sm:inline-flex">
            <Link href="/blog">Blog</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full px-3 text-[15px] font-medium text-brand-text hover:bg-brand-surface hover:text-brand sm:inline-flex">
            <Link href="/b">Find booking</Link>
          </Button>
          <AuthNav />
          <Button asChild size="sm" className="ml-1 h-10 rounded-pill bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
            <Link href="/search">Book now</Link>
          </Button>
          <MobileNav />
        </nav>
      </div>
    </header>
  );
}
