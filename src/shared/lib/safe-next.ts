/**
 * Coerces a caller-supplied `next` / return-path parameter into a path on this
 * site, or `fallback`. A value is followed only when it starts with a single
 * `/`: browsers read `//host` and `/\host` as another site, and they strip tab
 * and newline characters before parsing, so any backslash or control character
 * is refused outright.
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
