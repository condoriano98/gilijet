import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";

/**
 * Operations desk. The owner runs boat inventory on behalf of operators, who
 * cannot work their own dashboard.
 *
 * Gated to SUPER_ADMIN. Every page and action under here repeats the guard
 * rather than trusting this layout, matching the owner console — a layout guard
 * does not protect a server action, which is reachable directly.
 */
export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  const tabs = [
    { href: "/admin/operations", label: "Departures" },
    { href: "/admin/operations/schedules", label: "Schedules" },
    { href: "/admin/operations/boats", label: "Boats" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Set up and run schedules on behalf of operators.
        </p>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
