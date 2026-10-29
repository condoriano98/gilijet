/**
 * The MVP assumes operators run in WITA (Asia/Makassar, UTC+8): Bali,
 * Lombok, Sulawesi. Sufficient for our pilot routes. Make this per-operator
 * when expanding to WIB (Java) or WIT (Maluku/Papua).
 */
export const OPERATOR_TIMEZONE = 'Asia/Makassar';

/** Dashboard display timezone when `REPORT_TIMEZONE` is not set. */
export const DEFAULT_REPORT_TIMEZONE = 'Asia/Jakarta';

/** Every booking is charged and settled in rupiah. */
export const DEFAULT_CURRENCY = 'IDR';
