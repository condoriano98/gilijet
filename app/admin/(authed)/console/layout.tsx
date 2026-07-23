import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";

const tabs = [
  { href: "/admin/console", label: "Overview" },
  { href: "/admin/console/coupons", label: "Coupons" },
  { href: "/admin/console/pricing", label: "Pricing" },
];

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Owner-only: every page and action under /console also re-checks this.
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Owner Console</h1>
        <p className="text-sm text-muted-foreground">
          Coupons &amp; platform pricing — visible to super-admins only.
        </p>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
