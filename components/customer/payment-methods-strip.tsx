import { PaypalMark } from "@/components/checkout/payment-marks";

/**
 * All 18+ channels DOKU exposes on the hosted checkout page today (bank VA,
 * cards, QRIS, retail outlets, paylater), plus PayPal — its own separate
 * gateway (see lib/paypal.ts). Logo files live in public/brand/payment-logos
 * and were pulled from each brand's own site (a few — Permata, Danamon, BTN —
 * block bot fetches, so those came from Wikimedia Commons instead; still the
 * current official mark, just mirrored). Don't add a channel here that isn't
 * actually enabled in the DOKU merchant dashboard.
 */
const LOGO_METHODS: { key: string; label: string; file: string; square?: boolean }[] = [
  { key: "bri", label: "BRI Virtual Account", file: "bri.svg" },
  { key: "bni", label: "BNI Virtual Account", file: "bni.svg" },
  { key: "permata", label: "Permata Virtual Account", file: "permata.svg" },
  // DOKU has no horizontal wordmark — its only mark is this square icon
  // (red rounded square, "DOKU" set inside), so it needs more height than
  // the other wordmark logos to stay legible at this size.
  { key: "doku", label: "DOKU Virtual Account", file: "doku.svg", square: true },
  { key: "cimb-niaga", label: "CIMB Niaga Virtual Account", file: "cimb-niaga.svg" },
  { key: "danamon", label: "Danamon Virtual Account", file: "danamon.svg" },
  { key: "bsi", label: "BSI Virtual Account", file: "bsi.png" },
  { key: "maybank", label: "Maybank Virtual Account", file: "maybank.svg" },
  { key: "btn", label: "BTN Virtual Account", file: "btn.svg" },
  { key: "sinarmas", label: "Sinarmas Virtual Account", file: "sinarmas.png" },
  { key: "bnc", label: "BNC Virtual Account", file: "bnc.png" },
  { key: "alfamart", label: "Alfamart", file: "alfamart.webp" },
  { key: "indomaret", label: "Indomaret", file: "indomaret.svg" },
  { key: "visa", label: "Visa", file: "visa.webp" },
  { key: "mastercard", label: "Mastercard", file: "mastercard.svg" },
  { key: "jcb", label: "JCB", file: "jcb.webp" },
  { key: "qris", label: "QRIS", file: "qris.svg" },
  { key: "akulaku", label: "Akulaku PayLater", file: "akulaku.webp" },
  { key: "kredivo", label: "Kredivo PayLater", file: "kredivo.avif" },
  { key: "indodana", label: "Indodana PayLater", file: "indodana.webp" },
];

function Badge({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 shadow-sm"
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PaymentMethodsStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
      {LOGO_METHODS.map(({ key, label, file, square }) => (
        <Badge key={key} label={label}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size
              brand mark, not content imagery; next/image's required
              width/height fights the varied aspect ratios here */}
          <img
            src={`/brand/payment-logos/${file}`}
            alt=""
            className={`w-auto max-w-[64px] object-contain ${square ? "h-7" : "h-5"}`}
          />
        </Badge>
      ))}
      <Badge label="PayPal">
        <PaypalMark className="h-5 w-5" />
      </Badge>
    </div>
  );
}
