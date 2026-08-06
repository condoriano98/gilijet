"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuthState } from "@/components/customer/use-auth-state";

const LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/b", label: "Find booking" },
  { href: "/change-plans", label: "Change or refund a trip" },
  { href: "/contact", label: "Contact" },
];

/**
 * Phone-width nav. The header keeps only the logo and "Book now"; everything
 * else lives here, because a row that renders every link at every width is what
 * pushed the document wider than the viewport and left the whole site rendering
 * shrunk-to-fit on mobile.
 */
export function MobileNav() {
  const state = useAuthState();

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Open menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ink transition-colors hover:bg-brand-periwinkle sm:hidden"
      >
        <Menu className="h-6 w-6" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-xs">
        <SheetTitle>Menu</SheetTitle>

        <nav className="flex flex-col">
          {LINKS.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                className="border-b border-slate-100 py-3 text-base font-medium text-brand-ink"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        {state.status === "signed-in" ? (
          <SheetClose asChild>
            <Link
              href="/account"
              className="rounded-pill bg-brand px-4 py-3 text-center font-semibold text-white"
            >
              {state.firstName}
            </Link>
          </SheetClose>
        ) : state.status === "guest" ? (
          <div className="flex flex-col gap-2">
            <SheetClose asChild>
              <Link
                href="/account/login"
                className="rounded-pill border border-brand px-4 py-3 text-center font-semibold text-brand"
              >
                Sign in
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href="/account/register"
                className="rounded-pill bg-brand px-4 py-3 text-center font-semibold text-white"
              >
                Sign up
              </Link>
            </SheetClose>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
