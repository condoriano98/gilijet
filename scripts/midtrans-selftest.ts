/**
 * Verify Midtrans credentials without creating a payable transaction.
 *
 *   pnpm midtrans:selftest
 *
 * Sends a Snap transaction request with a deliberately invalid body. Midtrans
 * authenticates the server key before payload validation, so the shape of the
 * rejection tells us which one failed:
 *
 *   "401" / "Unauthorized"         → server key rejected
 *   validation error / 400         → server key accepted, credentials good
 *
 * Nothing payable is created, so this is safe to run against production too.
 *
 * Run it after every credential rotation. It never prints the secret.
 */
import { readFileSync, existsSync } from "node:fs";

const SNAP_PATH = "/snap/v1/transactions";

// Next.js loads .env.local itself; a standalone script has to do it by hand.
// Real environment variables win, so this also works on the droplet where the
// container is given them directly.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

const serverKey = process.env.MIDTRANS_SERVER_KEY;
const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

if (!serverKey) {
  console.error("✗ MIDTRANS_SERVER_KEY is not set.");
  console.error("  Checkout will fall back to the built-in dummy flow.");
  process.exit(1);
}

// Re-bind after the guard: the narrowing above does not reach into main().
const SERVER_KEY: string = serverKey;

const baseUrl = isProduction
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

const body = JSON.stringify({
  transaction_details: {
    order_id: `SELFTEST-${Date.now()}`,
    gross_amount: 0,
  },
});

async function main() {
  const res = await fetch(`${baseUrl}${SNAP_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${SERVER_KEY}:`).toString("base64")}`,
    },
    body,
  });
  const text = await res.text();

  console.log(`host      ${baseUrl}`);
  console.log(`server key ${SERVER_KEY.slice(0, 8)}…`);
  console.log(`mode      ${isProduction ? "production" : "sandbox"}`);
  console.log(`response  HTTP ${res.status} ${text.slice(0, 200)}`);
  console.log("");

  // A validation error means the server key was accepted.
  if (res.status === 400 || /validation|gross_amount|must/i.test(text)) {
    console.log("✓ PASS — server key accepted. No transaction created.");
    process.exit(0);
  }
  if (res.status === 401 || /unauthorized|access denied/i.test(text)) {
    console.error("✗ FAIL — server key rejected by this host.");
    console.error(
      isProduction
        ? "  Check MIDTRANS_SERVER_KEY."
        : "  These may be production credentials. Try MIDTRANS_IS_PRODUCTION=true.",
    );
    process.exit(1);
  }
  console.error("? UNCLEAR — unrecognised response; read it above.");
  process.exit(1);
}

main();