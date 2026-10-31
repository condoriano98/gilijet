import { MarketingTags } from '@/features/marketing/components/marketing-tags';
import { SiteHeader } from '@/app/(customer)/_components/site-header';
import { SiteFooter } from '@/app/(customer)/_components/site-footer';

// Sync layout. The auth-aware buttons live in <AuthNav>, a client
// component that fetches /api/auth/me on mount. This keeps the
// layout — and all child routes that don't otherwise read cookies
// or hit the DB — fully statically renderable.
//
// `gj-brand` scopes the electric-blue Gilifast (Figma) palette to the
// consumer surface; operator/admin keep the Mekari palette.
export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gj-brand flex min-h-screen flex-col bg-[#F9F9F9]">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <MarketingTags />
    </div>
  );
}
