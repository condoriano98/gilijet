import { Building2, CreditCard, QrCode, Store, Wallet } from "lucide-react";

/**
 * PayPal's two-P monogram. Path data from simple-icons (CC0), split into its
 * two subpaths so each P carries its own brand colour rather than rendering as
 * a flat silhouette.
 */
export function PaypalMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#003087"
        d="M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087z"
      />
      <path
        fill="#009cde"
        d="M19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z"
      />
    </svg>
  );
}

/**
 * What the DOKU page will offer, shown before the customer commits to leaving.
 *
 * Deliberately the payment *methods* rather than a DOKU wordmark: an
 * Indonesian customer recognises BCA and QRIS instantly and the acquirer not at
 * all, and this is the row that tells them the local options live behind the
 * blue button rather than the PayPal one.
 */
const DOKU_METHODS = [
  { icon: Building2, label: "Bank transfer" },
  { icon: QrCode, label: "QRIS" },
  { icon: Wallet, label: "E-wallet" },
  { icon: CreditCard, label: "Card" },
  { icon: Store, label: "Minimarket" },
] as const;

export function DokuMethodMarks() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
      {DOKU_METHODS.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
        >
          <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
