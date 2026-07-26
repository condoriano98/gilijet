import { Prisma } from "@prisma/client";
import { formatLocalDateTime, OPERATOR_TIMEZONE } from "../datetime";

/**
 * Output shaping for MCP tool results.
 *
 * Two things here are correctness, not formatting:
 *
 * Money. There are 29 `@db.Decimal` columns and `Prisma.Decimal` does not
 * survive `JSON.stringify` as a number you can trust. Every amount is emitted
 * as a decimal string so nothing silently loses precision on the way to a
 * reviewer who is checking revenue.
 *
 * Time. The whole product runs on WITA (Asia/Makassar, UTC+8) and the database
 * stores UTC. Emitting a bare ISO string would have every departure read eight
 * hours early. Timestamps are rendered through lib/datetime.ts and labelled
 * with the zone so there is nothing to misread.
 */

/** IDR amount as an exact decimal string. */
export function money(value: Prisma.Decimal | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Prisma.Decimal
    ? value.toFixed(2)
    : new Prisma.Decimal(value).toFixed(2);
}

/** Timestamp in WITA, explicitly labelled. */
export function witaTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  return `${formatLocalDateTime(d)} WITA`;
}

/** Calendar date in WITA, no time component. */
export function witaDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return formatLocalDateTime(d).split(" ").slice(0, 3).join(" ");
}

export const TIMEZONE_NOTE = `All times are ${OPERATOR_TIMEZONE} (WITA, UTC+8). All amounts are IDR.`;

/**
 * Whether to mask personal data in tool output.
 *
 * Off by default: the reviewer is authorised to read customer records. Set
 * MCP_REDACT_PII=1 to mask instead, which is useful for a demo or a screen
 * share. Worth knowing either way that anything a tool returns is copied into
 * the reviewer's local client history and their model provider's logs, which is
 * a wider audience than a dashboard session.
 */
export function redactingPii(): boolean {
  return process.env.MCP_REDACT_PII === "1";
}

/** `bud***@example.com` */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  if (!redactingPii()) return email;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 3)}***@${domain}`;
}

/** `+6281****7890` */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (!redactingPii()) return phone;
  if (phone.length <= 8) return "***";
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}

/** `Budi S.` */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (!redactingPii()) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 2)}***`;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * Marks a string that a customer or operator typed.
 *
 * Review text and passenger names reach the reviewer's model context verbatim.
 * Tagging them keeps free text from reading as instructions to whatever is
 * consuming the tool result.
 */
export function untrusted(text: string | null | undefined): string | null {
  if (!text) return null;
  return `<untrusted_user_content>${text}</untrusted_user_content>`;
}

/** Envelope every list tool returns, so a page is never mistaken for the whole set. */
export type Page<T> = {
  rows: T[];
  returned: number;
  total: number;
  hasMore: boolean;
  note: string;
};

export function page<T>(rows: T[], total: number, limit: number): Page<T> {
  const hasMore = rows.length < total;
  return {
    rows,
    returned: rows.length,
    total,
    hasMore,
    note: hasMore
      ? `Showing ${rows.length} of ${total}. Narrow the date range or raise limit (max ${limit}) — do not treat this page as the full set.`
      : `Showing all ${total} matching rows.`,
  };
}
