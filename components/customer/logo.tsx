import { cn } from "@/lib/utils";

/**
 * Gilifast wordmark lockup — a stylised speedboat mark above the
 * "GILIFAST.com" bold-italic wordmark. Single-colour (currentColor) so it
 * reads as blue on the white header and white on the blue footer.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex select-none flex-col items-center leading-none",
        className,
      )}
      aria-label="Gilifast"
    >
      <svg
        viewBox="0 0 132 50"
        className="h-6 w-auto"
        fill="currentColor"
        aria-hidden="true"
      >
        {/* speed streaks */}
        <rect x="0" y="16" width="30" height="4.5" rx="2.25" />
        <rect x="8" y="27" width="18" height="4.5" rx="2.25" />
        {/* hull */}
        <path d="M22 34 L128 34 C121 44 110 48 95 48 L48 48 C37 48 28 42 22 34 Z" />
        {/* deck / cabin */}
        <path d="M52 31 L59 16 L90 16 C105 16 118 22 127 31 Z" />
      </svg>
      <span className="mt-1 font-display text-xl font-extrabold italic tracking-tight [font-stretch:condensed]">
        GILIFAST<span className="align-top text-[0.5em] font-bold not-italic tracking-normal">.com</span>
      </span>
    </span>
  );
}
