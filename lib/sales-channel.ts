import { SalesChannel } from "@prisma/client";

/**
 * Sales-channel display and grouping.
 *
 * GILIJET is the pre-rename value for GILIFAST — our own platform. Bookings
 * taken before the rename still carry it and always will, so every read path
 * has to fold the two together. Grouping them separately would split one
 * channel across two rows in every report; treating GILIJET as third-party
 * would bill operators an ERP fee we never charged.
 */

/** "Sold on our own platform", current value and legacy value. */
export const DIRECT_SALES_CHANNELS: SalesChannel[] = [
  SalesChannel.GILIFAST,
  SalesChannel.GILIJET,
];

/** Fold the legacy value onto the current one before display or grouping. */
export function normalizeSalesChannel(channel: string): string {
  return channel === SalesChannel.GILIJET ? SalesChannel.GILIFAST : channel;
}

const LABELS: Record<string, string> = {
  [SalesChannel.GILIFAST]: "Gilifast",
  [SalesChannel.WALK_IN]: "Walk-in",
  [SalesChannel.TRAVEL_AGENT]: "Agen",
  [SalesChannel.PHONE]: "Telepon",
  [SalesChannel.EXTERNAL_AGGREGATOR]: "Aggregator",
};

export function salesChannelLabel(channel: string): string {
  const key = normalizeSalesChannel(channel);
  return LABELS[key] ?? key;
}

/** Display order for report rows and filters. Legacy value is not listed. */
export const SALES_CHANNELS: string[] = [
  SalesChannel.GILIFAST,
  SalesChannel.WALK_IN,
  SalesChannel.TRAVEL_AGENT,
  SalesChannel.PHONE,
  SalesChannel.EXTERNAL_AGGREGATOR,
];
