"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Grid3x3, Search, ChevronRight, LogOut, User } from "lucide-react";
import { MODULES, getActiveModule } from "./sidebar";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const activeModule = getActiveModule(pathname);

  const crumbs = [{ label: activeModule.label, href: activeModule.href }];
  if (segments.length > 2) {
    const sub = segments.slice(2).join("/");
    crumbs.push({ label: sub.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), href: pathname });
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-mekari-neutral-500">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} />}
          {i < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-mekari-neutral-700">
              {crumb.label}
            </Link>
          ) : (
            <span className="font-medium text-mekari-neutral-900">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-2 text-mekari-neutral-500 hover:bg-mekari-neutral-50 hover:text-mekari-neutral-700"
      >
        <Grid3x3 size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-mekari-neutral-200 bg-mekari-surface p-3 mekari-shadow">
          <div className="grid grid-cols-3 gap-2">
            {MODULES.map((mod) => (
              <Link
                key={mod.id}
                href={mod.href}
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors hover:bg-mekari-primary-50"
              >
                <mod.icon size={24} className="text-mekari-primary" />
                <span className="text-xs text-mekari-neutral-700">{mod.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ email, signOutAction }: { email: string; signOutAction: () => void }) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-mekari-neutral-200 bg-mekari-surface px-4">
      <div className="flex items-center gap-4">
        <Link href="/operator" className="text-lg font-bold text-mekari-primary">
          Gilifast
        </Link>
        <span className="hidden text-mekari-neutral-200 sm:inline">|</span>
        <div className="hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="rounded-md p-2 text-mekari-neutral-500 hover:bg-mekari-neutral-50 hover:text-mekari-neutral-700">
          <Search size={20} />
        </button>
        <button className="relative rounded-md p-2 text-mekari-neutral-500 hover:bg-mekari-neutral-50 hover:text-mekari-neutral-700">
          <Bell size={20} />
        </button>
        <AppSwitcher />
        <div className="ml-2 flex items-center gap-2 border-l border-mekari-neutral-200 pl-3">
          <div className="hidden items-center gap-2 sm:flex">
            <User size={16} className="text-mekari-neutral-500" />
            <span className="max-w-[120px] truncate text-xs text-mekari-neutral-700">{email}</span>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-mekari-neutral-500">
              <LogOut size={16} />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
