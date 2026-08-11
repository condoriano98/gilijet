import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession, clearAdminSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

async function signOutAction() {
  "use server";
  await clearAdminSession();
  redirect("/admin/login");
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const nav = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/operators", label: "Operators" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/confirmations", label: "Confirmations" },
    { href: "/admin/refunds", label: "Refunds" },
    { href: "/admin/reschedules", label: "Reschedules" },
    // Operations (scheduling on behalf of operators) and the Owner Console
    // (coupons + pricing) are both super-admin only.
    ...(session.adminRole === "SUPER_ADMIN"
      ? [
          { href: "/admin/operations", label: "Operations" },
          { href: "/admin/console", label: "Console" },
          { href: "/admin/diagnostics", label: "Diagnostics" },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-semibold text-sky-700">
              Gilibali · Admin
            </Link>
            <nav className="hidden gap-1 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {session.email}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                {session.adminRole}
              </span>
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
