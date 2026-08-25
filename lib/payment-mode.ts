import { prisma } from "./db";
import { setDokuModeOverride } from "./doku";
import { setPaypalModeOverride } from "./paypal";

/**
 * Runtime payment-gateway mode overrides.
 *
 * Each gateway's live/sandbox host is normally decided by an environment flag
 * (DOKU_IS_PRODUCTION / PAYPAL_IS_PRODUCTION). A superadmin can override that
 * per gateway from the owner console, stored on the singleton PlatformConfig
 * row, so staging can be pinned to sandbox — or flipped to live — without a
 * redeploy. This is the staging-only knob; main still drives everything from
 * env.
 *
 * The overrides are pushed into module-level state in lib/doku.ts and
 * lib/paypal.ts via applyGatewayModeOverrides(), called at every entry point
 * that matters — checkout start, the pay page, diagnostics, webhook handling.
 * Applying is idempotent and cheap: a single PK read on the config row.
 */

export const PLATFORM_CONFIG_ID = "default";

/** How one gateway's host is chosen. ENV = follow the env flag. */
export type GatewayModeOverride = "ENV" | "SANDBOX" | "LIVE";

export async function readGatewayModeOverrides(): Promise<{
  doku: GatewayModeOverride;
  paypal: GatewayModeOverride;
}> {
  const config = await prisma.platformConfig.findUnique({
    where: { id: PLATFORM_CONFIG_ID },
    select: { dokuMode: true, paypalMode: true },
  });
  return {
    doku: config?.dokuMode ?? "ENV",
    paypal: config?.paypalMode ?? "ENV",
  };
}

/** Read the overrides and push them into the gateway modules. */
export async function applyGatewayModeOverrides(): Promise<void> {
  const { doku, paypal } = await readGatewayModeOverrides();
  setDokuModeOverride(doku);
  setPaypalModeOverride(paypal);
}