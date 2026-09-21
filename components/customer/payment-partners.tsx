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

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-8 items-center justify-center rounded-md bg-white px-1.5 shadow-sm"
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Footer "Payment Partners" grid — dark-background counterpart to the tiles above. */
export function PaymentPartners() {
  return (
    <div>
      <div className="mb-3 text-base font-semibold">Payment Partners</div>
      <div className="grid grid-cols-4 gap-1.5">
        {LOGO_METHODS.map(({ key, label, file, square }) => (
          <Tile key={key} label={label}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size
                brand mark, not content imagery; next/image's required
                width/height fights the varied aspect ratios here */}
            <img
              src={`/brand/payment-logos/${file}`}
              alt=""
              className={`w-auto max-w-[44px] object-contain ${square ? "h-6" : "h-4"}`}
            />
          </Tile>
        ))}
        <Tile label="PayPal">
          <PaypalMark className="h-4 w-4" />
        </Tile>
      </div>
    </div>
  );
}
