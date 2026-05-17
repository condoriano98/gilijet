import Link from "next/link";
import { redirect } from "next/navigation";
import { clearOperatorSession, getOperatorSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

async function signOutAction() {
  "use server";
  await clearOperatorSession();
  redirect("/operator/login");
}

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOperatorSession();
  if (!session) return <>{children}</>;

  const nav = [
    { href: "/operator", label: "Dashboard" },
    { href: "/operator/boats", label: "Boats" },
    { href: "/operator/schedules", label: "Schedules" },
    { href: "/operator/legs", label: "Departures" },
    { href: "/operator/scanner", label: "Scanner" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/operator"
              className="text-lg font-semibold text-sky-700"
            >
              Gilijet · Operator
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
