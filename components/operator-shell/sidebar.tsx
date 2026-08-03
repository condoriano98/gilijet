"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Wallet,
  Ship,
  Users,
  Anchor,
  BookOpen,
  Landmark,
  BadgeDollarSign,
  BarChart3,
  Settings,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";

type NavModule = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: { label: string; href: string }[];
};

const MODULES: NavModule[] = [
  { id: "beranda", label: "Beranda", href: "/operator", icon: LayoutDashboard },
  {
    id: "penjualan", label: "Penjualan", href: "/operator/penjualan", icon: ShoppingCart,
    children: [
      { label: "Semua Booking", href: "/operator/penjualan" },
      { label: "Agen Perjalanan", href: "/operator/penjualan/agen" },
      { label: "Refund", href: "/operator/penjualan/refund" },
    ],
  },
  { id: "pos", label: "Kasir Pelabuhan", href: "/operator/pos", icon: Receipt },
  {
    id: "kas", label: "Kas & Bank", href: "/operator/kas", icon: Wallet,
    children: [
      { label: "Laci Kas", href: "/operator/kas" },
      { label: "Rekonsiliasi", href: "/operator/kas/rekonsiliasi" },
      { label: "Penyelesaian", href: "/operator/kas/penyelesaian" },
    ],
  },
  {
    id: "operasi", label: "Operasi", href: "/operator/operasi", icon: Ship,
    children: [
      { label: "Jadwal", href: "/operator/operasi/jadwal" },
      { label: "Keberangkatan", href: "/operator/operasi/keberangkatan" },
      { label: "Pemindai QR", href: "/operator/operasi/pemindai" },
    ],
  },
  {
    id: "awak", label: "Awak Kapal", href: "/operator/awak", icon: Users,
    children: [
      { label: "Daftar Awak", href: "/operator/awak" },
      { label: "Jadwal Awak", href: "/operator/awak/jadwal" },
      { label: "Sertifikasi", href: "/operator/awak/sertifikasi" },
    ],
  },
  {
    id: "armada", label: "Armada", href: "/operator/armada", icon: Anchor,
    children: [
      { label: "Kapal", href: "/operator/armada" },
      { label: "Bahan Bakar", href: "/operator/armada/bahan-bakar" },
      { label: "Pemeliharaan", href: "/operator/armada/pemeliharaan" },
      { label: "Sertifikat", href: "/operator/armada/sertifikat" },
    ],
  },
  { id: "akuntansi", label: "Akuntansi", href: "/operator/akuntansi", icon: BookOpen },
  { id: "pajak", label: "Pajak", href: "/operator/pajak", icon: Landmark },
  { id: "penggajian", label: "Penggajian", href: "/operator/penggajian", icon: BadgeDollarSign },
  { id: "laporan", label: "Laporan", href: "/operator/laporan", icon: BarChart3 },
  { id: "pengaturan", label: "Pengaturan", href: "/operator/pengaturan", icon: Settings },
];

function getActiveModule(pathname: string): NavModule {
  for (const mod of MODULES) {
    if (mod.href === "/operator" && pathname === "/operator") return mod;
    if (mod.href !== "/operator" && pathname.startsWith(mod.href)) return mod;
  }
  return MODULES[0];
}

/**
 * Collapse state lives here rather than in the caller. The operator layout is
 * a Server Component, and handing a callback across that boundary throws —
 * functions are not serializable — which took the whole operator dashboard
 * down. This is already a client component, so it can just own the state.
 */
export function Sidebar({ email }: { email: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const onToggle = () => setCollapsed((c) => !c);
  const pathname = usePathname();
  const activeModule = getActiveModule(pathname);

  const sidebarItems = activeModule.children ?? [{ label: activeModule.label, href: activeModule.href }];

  return (
    <aside
      className={cn(
        "fixed left-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] flex-col border-r border-mekari-neutral-200 bg-mekari-surface transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-l-4 border-mekari-primary bg-mekari-primary-50 font-medium text-mekari-primary"
                  : "border-l-4 border-transparent text-mekari-neutral-700 hover:bg-mekari-neutral-50 hover:text-mekari-neutral-900",
                collapsed && "justify-center px-0",
              )}
            >
              {collapsed ? (
                <span className="text-xs font-bold">{item.label.charAt(0)}</span>
              ) : (
                item.label
              )}
            </Link>
          );
        })}

        <div className="mt-4 border-t border-mekari-neutral-200 pt-2">
          {MODULES.filter((m) => m.id !== activeModule.id).slice(0, 5).map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm text-mekari-neutral-500 transition-colors hover:bg-mekari-neutral-50 hover:text-mekari-neutral-700",
                collapsed && "justify-center px-0",
              )}
            >
              <mod.icon size={20} />
              {!collapsed && mod.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="border-t border-mekari-neutral-200 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-2 text-mekari-neutral-500 hover:bg-mekari-neutral-50"
        >
          <ChevronLeft size={16} className={cn("transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}

export { MODULES, getActiveModule };
export type { NavModule };
