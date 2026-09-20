import { PaypalMark } from "@/components/checkout/payment-marks";

/**
 * Visa wordmark. Path data from simple-icons (CC0), filled with the
 * official Visa blue.
 */
function VisaMark({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="#1A1F71" d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
    </svg>
  );
}

/**
 * Mastercard interlocking circles. Built from the two official circles
 * (red #EB001B, orange #F79E1B) rather than a single silhouette path, so
 * the overlap reads as the brand's signature blended orange.
 */
function MastercardMark({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <circle cx="9" cy="12" r="7" fill="#EB001B" />
      <circle cx="15" cy="12" r="7" fill="#F79E1B" fillOpacity="0.8" />
    </svg>
  );
}

/**
 * QRIS mark (icon + wordmark combined). Path data from Wikimedia Commons'
 * "QRIS Logo.svg" (Bank Indonesia's national QR payment standard),
 * https://commons.wikimedia.org/wiki/File:QRIS_Logo.svg — filled with an
 * approximation of QRIS red rather than the source file's black, since the
 * mark is usually shown in colour; the source is a single combined path so
 * a multi-tone gradient is not reproduced here.
 */
function QrisMark({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 3000 1140" className={className} aria-hidden="true" focusable="false">
      <path fill="#ED1C24" d="M 709,948.5 V 757 h 96.875 96.875 V 948.5 1140 H 805.875 709 Z m 1908.25,162.0016 V 1087.25 h 146.3125 c 98.5063,0 147.0477,-0.086 148.5625,-0.2589 9.0134,-1.0289 17.6399,-4.5567 24.75,-10.1215 2.3146,-1.8115 6.7534,-6.2936 8.4568,-8.5394 3.9304,-5.1815 6.7729,-11.386 8.2253,-17.9531 l 0.5529,-2.5 0.072,-145.4375 L 2954.2534,757 H 2977.1267 3000 v 166.84851 c 0,115.39699 -0.081,167.64689 -0.2642,169.43749 -1.1018,10.7985 -6.1508,20.9274 -14.2122,28.5117 -6.15,5.7859 -13.6425,9.6121 -22.2736,11.3745 -2.0028,0.4089 -12.0089,0.4381 -174.0625,0.5074 l -171.9375,0.074 z M 168.625,949.08959 c -7.73868,-0.88214 -12.96542,-2.4852 -18.6166,-5.7098 -13.48131,-7.69251 -22.25661,-21.30817 -23.76904,-36.87979 -0.2018,-2.07777 -0.23648,-19.40889 -0.12505,-62.5 0.37505,-145.03571 0.90937,-339.90719 1.13651,-414.5 0.13587,-44.61875 0.25724,-104.3 0.26971,-132.625 0.0125,-28.325 0.11396,-56.1125 0.22553,-61.75 0.17972,-9.08144 0.26439,-10.53501 0.74276,-12.75 2.99622,-13.87352 12.01888,-25.25622 24.88618,-31.39562 4.54684,-2.16944 8.77132,-3.46194 14.375,-4.39808 2.45481,-0.4101 7.57254,-0.44363 78.9375,-0.51725 L 323,185.98532 V 475.36766 764.75 H 467.125 611.25 V 857 949.25 L 390.3125,949.2125 C 268.79687,949.1919 169.0375,949.1366 168.625,949.08955 Z M 983.25,712.75 V 476.25 H 1266.875 1550.5 V 419.625 363 H 1266.875 983.25 V 274.5 186 H 1370 1756.75 v 232.74981 232.74981 l -162.1329,0.0627 -162.1329,0.0627 161.1567,147.875 c 88.6361,81.33125 161.6241,148.29208 162.1954,148.80184 l 1.0387,0.92684 -137.875,0.003 -137.875,0.003 L 1322,800.34934 1162.875,651.46382 1162.812,800.35691 1162.749,949.25 H 1072.9998 983.25 Z m 854,-145.875 V 184.5 h 94.5 94.5 V 566.875 949.25 h -94.5 -94.5 z m 271,283.75 V 755.25 h 254.5 254.5 V 708 660.75 h -254.5 -254.5 V 423.375 186 h 382 382 v 94.625 94.625 H 2617.875 2363.5 v 48.125 48.125 h 254.375 254.375 V 708.75 946 h -382 -382 z M 417.5,566.875 V 470 h 96.125 96.125 v 96.875 96.875 H 513.625 417.5 Z M 553,566.125 V 527.25 H 513.625 474.25 v 38.70833 c 0,21.28959 0.075,38.78334 0.16667,38.875 0.0917,0.0917 17.81041,0.16667 39.375,0.16667 H 553 Z M 709,519.5 V 376.75 H 563.24968 417.49935 l 0.0628,-95.3125 0.0628,-95.3125 h 220.75 220.75 l 3.25,0.5864 c 20.14918,3.63553 35.13726,17.64148 39.57315,36.98003 l 0.6729,2.93357 0.0657,217.8125 0.0658,217.8125 H 805.87628 709 Z M 0.41374689,376.29281 C 0.0296267,375.86837 0,363.96579 0,210.0693 0,95.957496 0.0819119,43.496221 0.26286634,41.713989 1.6991579,27.567854 9.1332273,15.239703 20.806816,7.6453115 26.871522,3.6998449 34.778277,1.000698 42.463989,0.25215292 44.175853,0.08542701 102.11707,0 213.48774,0 376.34711,0 381.9362,0.0151334 382.33625,0.45718517 382.71476,0.87543362 382.75,2.8203103 382.75,23.293438 c 0,21.36298 -0.0208,22.397854 -0.45719,22.792815 C 381.86849,46.470258 371.30094,46.5 235.28296,46.5 133.80536,46.5 87.983624,46.581453 86.302647,46.764828 78.001528,47.670382 70.110715,50.728995 63.875,55.458164 61.649978,57.145621 58.155532,60.605357 56.383752,62.875 51.349072,69.324405 48.458824,76.632915 47.514441,85.302647 47.331633,86.980876 47.25,132.21934 47.25,231.84729 c 0,130.68212 -0.03662,144.15362 -0.392857,144.50985 -0.351404,0.35141 -2.80059,0.39286 -23.211253,0.39286 -21.7885933,0 -22.83706877,-0.0206 -23.23214311,-0.45719 z" />
    </svg>
  );
}

const METHODS = [
  { key: "qris", label: "QRIS", Mark: QrisMark },
  { key: "visa", label: "Visa", Mark: VisaMark },
  { key: "mastercard", label: "Mastercard", Mark: MastercardMark },
  { key: "paypal", label: "PayPal", Mark: PaypalMark },
] as const;

/**
 * Payment methods actually live behind checkout today (DOKU: QRIS + cards;
 * PayPal: its own gateway — see lib/doku.ts / lib/paypal.ts). Do not add a
 * logo here for a gateway that is not wired up and configured; showing one
 * that cannot actually be used at checkout is what this strip exists to
 * avoid.
 */
export function PaymentMethodsStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
      {METHODS.map(({ key, label, Mark }) => (
        <div
          key={key}
          className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 shadow-sm"
          title={label}
        >
          <Mark className="h-5 w-auto" />
          <span className="sr-only">{label}</span>
        </div>
      ))}
    </div>
  );
}
