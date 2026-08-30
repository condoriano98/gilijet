import { cn } from "@/lib/utils";

/**
 * Gilifast logo lockup — a speedboat mark riding its wake above the bold-italic
 * "GILIFAST" wordmark, "GILI" in navy and "FAST" in teal.
 *
 * `mono` collapses the whole mark onto `currentColor` (accents drop to a lower
 * opacity so the windscreen and wake stay legible), which is what keeps the
 * lockup readable as white on the blue footer.
 */
export function Logo({
  className,
  mono = false,
  tagline = false,
}: {
  className?: string;
  mono?: boolean;
  tagline?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex select-none flex-col items-center leading-none",
        className,
      )}
      aria-label="Gilifast"
    >
      <svg viewBox="0 0 200 112" className="h-8 w-auto" aria-hidden="true">
        <g className={mono ? "fill-current" : "fill-brand-navy"}>
          {/* hull */}
          <path d="M22 52 C70 51,132 45,190 28 C184 45,172 60,152 69 L62 76 C38 76,24 66,22 52 Z" />
          {/* cabin: foredeck sweeping up into the raked windshield */}
          <path d="M158 41 C144 27,132 20,117 20 L104 20 L99 47 Z" />
        </g>
        {/* sheer stripe */}
        <path
          d="M28 60 C82 58,134 50,182 34 L176 43 C130 57,80 65,30 66 Z"
          className={mono ? "fill-current opacity-60" : "fill-brand-teal"}
        />
        {/* windscreen */}
        <path
          d="M112 27 C124 27,134 32,144 41 L110 43 Z"
          className={
            mono ? "fill-current opacity-40" : "fill-brand-teal-light"
          }
        />
        {/* wake */}
        <path
          d="M2 90 C30 80,74 77,120 82 C128 83,132 85,128 87 C88 91,40 94,2 90 Z"
          className={mono ? "fill-current opacity-60" : "fill-brand-teal"}
        />
        <path
          d="M46 103 C68 97,106 96,144 99 C114 106,72 108,46 103 Z"
          className={
            mono ? "fill-current opacity-40" : "fill-brand-teal-light"
          }
        />
      </svg>
      <span className="mt-1.5 font-display text-xl font-extrabold italic tracking-tight [font-stretch:condensed]">
        <span className={mono ? undefined : "text-brand-navy"}>GILI</span>
        <span className={mono ? undefined : "text-brand-teal"}>FAST</span>
      </span>
      {tagline ? (
        <span
          className={cn(
            "mt-1.5 font-display text-[0.6rem] font-bold tracking-tight",
            mono ? undefined : "text-brand-navy",
          )}
        >
          Fast. Safe. Easy to Gili.
        </span>
      ) : null}
    </span>
  );
}
