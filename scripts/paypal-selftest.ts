/**
 * Find out which PayPal host your credentials belong to.
 *
 *   pnpm paypal:selftest
 *
 * A 401 invalid_client at checkout is almost never a bad key — it is the right
 * key sent to the wrong host, because PAYPAL_IS_PRODUCTION did not match where
 * the credentials came from. Guessing costs a redeploy each time, so this asks
 * both hosts directly and says which one accepts them.
 *
 * Only requests an OAuth token. No order is created and no money can move, so
 * it is safe against live credentials.
 *
 * It never prints the secret.
 */
import { readFileSync, existsSync } from "node:fs";

// Next.js loads .env.local itself; a standalone script has to do it by hand.
// Real environment variables win, so this also works on a server that is given
// them directly.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const declaredProduction = process.env.PAYPAL_IS_PRODUCTION === "true";

if (!clientId || !clientSecret) {
  console.error("✗ PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.");
  console.error("  PayPal will not be offered at checkout at all.");
  process.exit(1);
}

const HOSTS = [
  { name: "sandbox", url: "https://api-m.sandbox.paypal.com" },
  { name: "live", url: "https://api-m.paypal.com" },
] as const;

async function tryHost(url: string): Promise<{ ok: boolean; detail: string }> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(`${url}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (res.ok) return { ok: true, detail: "token issued" };
    const parsed = JSON.parse(text) as { error?: string };
    return { ok: false, detail: `HTTP ${res.status} ${parsed.error ?? text.slice(0, 80)}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log(`client id  ${clientId!.slice(0, 12)}…`);
  console.log(`configured PAYPAL_IS_PRODUCTION=${declaredProduction}`);
  console.log("");

  const results = await Promise.all(
    HOSTS.map(async (h) => ({ ...h, ...(await tryHost(h.url)) })),
  );
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name.padEnd(8)} ${r.detail}`);
  }
  console.log("");

  const accepted = results.filter((r) => r.ok);
  if (accepted.length === 0) {
    console.error("✗ FAIL — neither host accepted these credentials.");
    console.error("  The client id or secret is wrong, or has been revoked.");
    console.error("  Check for a stray space or newline if they were pasted.");
    process.exit(1);
  }

  const belongsTo = accepted[0].name;
  const shouldBeProduction = belongsTo === "live";
  if (shouldBeProduction === declaredProduction) {
    console.log(`✓ PASS — credentials are ${belongsTo}, and the app is pointed there.`);
    process.exit(0);
  }

  console.error(`✗ MISMATCH — these are ${belongsTo} credentials, but the app calls the`);
  console.error(`  ${declaredProduction ? "live" : "sandbox"} host, which is why checkout gets invalid_client.`);
  console.error(
    `  Fix: set PAYPAL_IS_PRODUCTION="${shouldBeProduction}" and redeploy.`,
  );
  process.exit(1);
}

main();
