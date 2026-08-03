/**
 * Verify DOKU credentials without creating a payable invoice.
 *
 *   pnpm doku:selftest
 *
 * Sends a request signed with the configured credentials but carrying a
 * deliberately invalid body. DOKU checks authentication before payload
 * validation, so the shape of the rejection tells us which one failed:
 *
 *   "invoice_number must be filled"  → signature accepted, credentials good
 *   invalid_client_id / 401          → credentials or signature wrong
 *
 * Nothing payable is created, so this is safe to run against production, which
 * matters because this merchant has no sandbox account.
 *
 * Run it after every credential rotation. It never prints the secret.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  bodyDigest,
  dokuTimestamp,
  signComponents,
  signatureComponents,
} from "../lib/doku";

const CHECKOUT_PATH = "/checkout/v1/payment";

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

const clientId = process.env.DOKU_CLIENT_ID;
const secretKey = process.env.DOKU_SECRET_KEY;
const isProduction = process.env.DOKU_IS_PRODUCTION === "true";

if (!clientId || !secretKey) {
  console.error("✗ DOKU_CLIENT_ID / DOKU_SECRET_KEY are not set.");
  console.error("  Checkout will fall back to the built-in dummy flow.");
  process.exit(1);
}

// Re-bind after the guard: the narrowing above does not reach into main().
const CLIENT_ID: string = clientId;
const SECRET_KEY: string = secretKey;

const baseUrl = isProduction
  ? "https://api.doku.com"
  : "https://api-sandbox.doku.com";

const body = JSON.stringify({
  order: { amount: 0, invoice_number: "", currency: "IDR" },
  payment: { payment_due_date: 30 },
});
const requestId = "00000000-0000-4000-8000-000000000001";
const timestamp = dokuTimestamp(new Date());

const signature = signComponents(
  signatureComponents({
    clientId: CLIENT_ID,
    requestId,
    timestamp,
    target: CHECKOUT_PATH,
    digest: bodyDigest(body),
  }),
  SECRET_KEY,
);

async function main() {
  const res = await fetch(`${baseUrl}${CHECKOUT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": CLIENT_ID,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body,
  });
  const text = await res.text();

  console.log(`host      ${baseUrl}`);
  console.log(`client id ${CLIENT_ID.slice(0, 8)}…`);
  console.log(`mode      ${isProduction ? "production" : "sandbox"}`);
  console.log(`response  HTTP ${res.status} ${text.slice(0, 200)}`);
  console.log("");

  // Reaching payload validation means the signature was accepted.
  if (/must be filled|invalid.*amount|validation/i.test(text)) {
    console.log("✓ PASS — credentials and signature accepted. No invoice created.");
    process.exit(0);
  }
  if (/invalid_client_id/i.test(text)) {
    console.error("✗ FAIL — Client-Id rejected by this host.");
    console.error(
      isProduction
        ? "  Check DOKU_CLIENT_ID."
        : "  These may be production credentials. Try DOKU_IS_PRODUCTION=true.",
    );
    process.exit(1);
  }
  if (res.status === 401 || /signature/i.test(text)) {
    console.error("✗ FAIL — signature rejected. Check DOKU_SECRET_KEY.");
    process.exit(1);
  }
  console.error("? UNCLEAR — unrecognised response; read it above.");
  process.exit(1);
}

main();
