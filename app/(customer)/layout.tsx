import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <Button asChild variant="outline" size="sm">
              <Link href="/operator/login">Operator</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6">
        <div className="container text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Gilijet · Boat tickets across Indonesia
        </div>
      </footer>
    </div>
  );
}
