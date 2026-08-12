import { env } from "./env";

/**
 * PayPal Standard Checkout — the backup gateway for cards DOKU declines.
 *
 * DOKU handles the domestic rails and settles IDR, but rejects certain cards.
 * PayPal is a different rail entirely — its own global acquiring plus PayPal
 * balance — so it is the option most likely to accept a card an Indonesian
 * acquirer turns down. The customer pays through PayPal's hosted page, so no
 * card data reaches us.
 *
 * THE CURRENCY CONSTRAINT: PayPal does not settle IDR. Every PayPal payment is
 * therefore cross-currency — the booking's IDR total stays authoritative and we
 * charge a presentment amount (USD by default) quoted from a stored FX rate.
 * That rate is persisted on the Payment row so a later refund returns the
 * amount actually captured rather than a re-conversion at a moved rate.
 *
 * MOCK MODE: when PAYPAL_CLIENT_ID is absent or starts with "test_mock_" every
 * call returns a dummy order that the frontend routes to the built-in dummy
 * /checkout flow, matching how lib/doku.ts degrades.
 *
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 * Webhooks: https://developer.paypal.com/api/rest/webhooks/rest/
 */

export class PaypalNotConfiguredError extends Error {
  constructor() {
    super("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured");
    this.name = "PaypalNotConfiguredError";
  }
}

/**
 * Currencies PayPal will settle. IDR is deliberately absent — it is not on
 * PayPal's supported list, which is the whole reason for the presentment path.
 */
const PAYPAL_CURRENCIES = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS",
  "JPY", "MYR", "MXN", "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "RUB",
  "SGD", "SEK", "CHF", "THB", "USD",
]);

export function isPaypalCurrency(currency: string): boolean {
  return PAYPAL_CURRENCIES.has(currency.toUpperCase());
}

/** The currency PayPal bookings are charged in. Validated, not trusted. */
export function paypalPresentmentCurrency(): string {
  const c = (env.PAYPAL_PRESENTMENT_CURRENCY ?? "USD").toUpperCase();
  return isPaypalCurrency(c) ? c : "USD";
}

export type PaypalHost = "live" | "sandbox";

const HOSTS: Record<PaypalHost, string> = {
  live: "https://api-m.paypal.com",
  sandbox: "https://api-m.sandbox.paypal.com",
};

const otherHost = (h: PaypalHost): PaypalHost => (h === "live" ? "sandbox" : "live");

/**
 * Where the credentials actually authenticated, once proven. Null until then.
 *
 * PAYPAL_IS_PRODUCTION only ever expressed a fact the credentials already
 * encode — a key pair is issued by exactly one host and only that host will
 * accept it — so the flag is a hint about where to look first, not the answer.
 * Trusting it turned a one-character config error into "PayPal is unavailable"
 * with no way for the operator to tell that apart from a revoked key.
 */
let resolvedHost: PaypalHost | null = null;

function configuredHost(): PaypalHost {
  return env.PAYPAL_IS_PRODUCTION ? "live" : "sandbox";
}

/** The host in use: proven if we have proof, otherwise the configured guess. */
export function paypalHost(): PaypalHost {
  return resolvedHost ?? configuredHost();
}

/** True once a host has actually issued a token, so callers can trust paypalHost(). */
export function paypalHostIsProven(): boolean {
  return resolvedHost !== null;
}

export function isPaypalConfigured(): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

export function isPaypalMock(): boolean {
  const id = env.PAYPAL_CLIENT_ID;
  return !isPaypalConfigured() || Boolean(id?.startsWith("test_mock_"));
}

/**
 * Credentials are present and not the mock placeholder.
 *
 * This does NOT prove they work — see paypalCredentialsWork. Wrong host,
 * revoked key and a newline pasted into the secret all pass this check.
 */
export function isPaypalLive(): boolean {
  return isPaypalConfigured() && !isPaypalMock();
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/**
 * PayPal access tokens last ~9 hours. Cache in module scope and refresh a
 * minute early so a token never expires mid-request.
 */
let cachedToken: { value: string; expiresAt: number; host: PaypalHost } | null = null;

type TokenAttempt =
  | { ok: true; value: string; expiresIn: number }
  | { ok: false; status: number; body: string; invalidClient: boolean };

async function requestToken(host: PaypalHost): Promise<TokenAttempt> {
  const basic = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${HOSTS[host]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: text.slice(0, 300),
      invalidClient: /invalid_client/i.test(text),
    };
  }

  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("PayPal: missing access_token");
  return { ok: true, value: json.access_token, expiresIn: json.expires_in ?? 32400 };
}

/**
 * Fetch a token, discovering which host these credentials belong to.
 *
 * A 401 invalid_client is not a bad key — it is the right key at the wrong
 * host — so it is answered by asking the other host rather than by giving up
 * and telling the operator to go change an environment variable. Whichever host
 * answers is remembered for the life of the process.
 *
 * Returns the host alongside the token: a token minted against live is
 * meaningless at sandbox, so every subsequent call must go to the same place.
 */
async function accessToken(): Promise<{ token: string; host: PaypalHost }> {
  if (!isPaypalConfigured()) throw new PaypalNotConfiguredError();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return { token: cachedToken.value, host: cachedToken.host };
  }

  const first = paypalHost();
  const attempts: { host: PaypalHost; result: TokenAttempt }[] = [];
  attempts.push({ host: first, result: await requestToken(first) });

  // Only invalid_client means "wrong host". A 500 or a rate limit says nothing
  // about where the credentials live, and retrying elsewhere would just double
  // the outage.
  if (!attempts[0].result.ok && attempts[0].result.invalidClient) {
    const second = otherHost(first);
    attempts.push({ host: second, result: await requestToken(second) });
  }

  const won = attempts.find((a) => a.result.ok);
  if (!won || !won.result.ok) {
    const detail = attempts
      .map((a) => {
        const r = a.result as Extract<TokenAttempt, { ok: false }>;
        return `${a.host} ${r.status}: ${r.body}`;
      })
      .join(" | ");
    // Both hosts refusing rules out the wrong-host explanation, which leaves
    // only a bad key. Say that, rather than sending the operator to the flag.
    if (attempts.length > 1 && attempts.every((a) => !a.result.ok && a.result.invalidClient)) {
      throw new Error(
        `PayPal: neither host accepts these credentials — the client id or ` +
          `secret is wrong or revoked. Check for a stray space or newline, or ` +
          `reissue them at developer.paypal.com/dashboard. (${detail})`,
      );
    }
    throw new Error(`PayPal /v1/oauth2/token failed — ${detail}`);
  }

  if (won.host !== configuredHost() && resolvedHost !== won.host) {
    console.warn(
      `[paypal] credentials belong to the ${won.host} host, not the ` +
        `${configuredHost()} host that PAYPAL_IS_PRODUCTION selects — using ` +
        `${won.host}. Set PAYPAL_IS_PRODUCTION="${won.host === "live"}" to skip ` +
        `this extra round-trip.`,
    );
  }
  resolvedHost = won.host;

  cachedToken = {
    value: won.result.value,
    expiresAt: now + Math.max(0, won.result.expiresIn - 60) * 1000,
    host: won.host,
  };
  return { token: cachedToken.value, host: cachedToken.host };
}

/**
 * When the last token request failed, so a broken configuration does not add an
 * OAuth round-trip to every pay-page render. Same shape as the FX provider
 * cooldown in lib/fx.ts.
 */
let lastAuthFailureAt = 0;
const AUTH_RETRY_COOLDOWN_MS = 60_000;

/**
 * Do the configured credentials actually authenticate?
 *
 * `isPaypalLive()` only proves the env vars exist, which is why a booking could
 * render a PayPal button and then fail with invalid_client the moment someone
 * clicked it. Offering a broken second option to a customer whose card was just
 * declined is worse than offering none, so availability is gated on this.
 *
 * Nearly free in the steady state: accessToken() caches the token for ~9h, so
 * only the first call on a cold instance does network I/O. Never throws —
 * callers treat false as "not available right now".
 */
export async function paypalCredentialsWork(): Promise<boolean> {
  if (!isPaypalLive()) return false;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return true;
  if (Date.now() - lastAuthFailureAt < AUTH_RETRY_COOLDOWN_MS) return false;

  try {
    await accessToken();
    return true;
  } catch (err) {
    lastAuthFailureAt = Date.now();
    console.warn("[paypal] credentials rejected — not offering PayPal:", err);
    return false;
  }
}

async function paypalFetch(
  path: string,
  init: { method: string; body?: unknown; requestId?: string },
): Promise<Record<string, unknown>> {
  const { token, host } = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // PayPal treats PayPal-Request-Id as an idempotency key: a retried create or
  // capture with the same id returns the original result instead of charging twice.
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;

  // Same host the token came from — see accessToken().
  const res = await fetch(`${HOSTS[host]}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export type CreateOrderParams = {
  /** Our bookingReference — becomes the order's custom_id for correlation. */
  orderId: string;
  /** Presentment amount as a 2dp string, from quoteForeignCharge(). */
  amount: string;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

export type CreateOrderResult = {
  /** PayPal order id — stored as Payment.gatewayReference. */
  id: string;
  status: string;
  /** Where to send the customer when not using the inline JS SDK. */
  approveUrl: string | null;
};

export async function createOrder(
  params: CreateOrderParams,
): Promise<CreateOrderResult> {
  if (isPaypalMock()) {
    return {
      id: `mock_pp_${params.orderId}`,
      status: "CREATED",
      approveUrl: `/checkout/${params.orderId}`,
    };
  }
  if (!isPaypalCurrency(params.currency)) {
    throw new Error(`PayPal cannot settle ${params.currency}`);
  }

  const json = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    requestId: `order-${params.orderId}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          // Both carry the booking reference: reference_id is echoed in the
          // order, custom_id survives into the capture webhook payload.
          reference_id: params.orderId,
          custom_id: params.orderId,
          description: params.description.slice(0, 127),
          amount: {
            currency_code: params.currency,
            value: params.amount,
          },
        },
      ],
      application_context: {
        brand_name: "Gilifast",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    },
  });

  const id = String(json.id ?? "");
  if (!id) throw new Error("PayPal create order: missing id in response");

  const links = Array.isArray(json.links) ? json.links : [];
  const approve = links.find(
    (l): l is { rel: string; href: string } =>
      typeof l === "object" && l !== null && (l as { rel?: string }).rel === "approve",
  );

  return {
    id,
    status: String(json.status ?? "CREATED"),
    approveUrl: approve?.href ?? null,
  };
}

export type CaptureResult = {
  orderId: string;
  /** PayPal capture id — the handle a refund is issued against. */
  captureId: string | null;
  status: string;
  /** True only for a completed capture; anything else must not issue tickets. */
  completed: boolean;
  amount: string | null;
  currency: string | null;
  /** PayPal's fee on this capture, in presentment currency. */
  feeAmount: number | null;
  /** Our booking reference, echoed back via custom_id. */
  bookingReference: string | null;
};

/** Pull the capture out of an order/webhook payload, wherever it sits. */
function readCapture(json: Record<string, unknown>): CaptureResult {
  const units = Array.isArray(json.purchase_units) ? json.purchase_units : [];
  const unit = (units[0] ?? {}) as Record<string, unknown>;
  const payments = (unit.payments ?? {}) as Record<string, unknown>;
  const captures = Array.isArray(payments.captures) ? payments.captures : [];
  const capture = (captures[0] ?? {}) as Record<string, unknown>;

  const amountObj = (capture.amount ?? {}) as Record<string, unknown>;
  const breakdown = ((capture.seller_receivable_breakdown ?? {}) as Record<string, unknown>);
  const feeObj = (breakdown.paypal_fee ?? {}) as Record<string, unknown>;
  const fee = feeObj.value === undefined ? null : Number(feeObj.value);

  const status = String(capture.status ?? json.status ?? "");

  return {
    orderId: String(json.id ?? ""),
    captureId: capture.id ? String(capture.id) : null,
    status,
    completed: status.toUpperCase() === "COMPLETED",
    amount: amountObj.value === undefined ? null : String(amountObj.value),
    currency: amountObj.currency_code === undefined ? null : String(amountObj.currency_code),
    feeAmount: fee !== null && Number.isFinite(fee) ? fee : null,
    bookingReference:
      (capture.custom_id ? String(capture.custom_id) : null) ??
      (unit.custom_id ? String(unit.custom_id) : null) ??
      (unit.reference_id ? String(unit.reference_id) : null),
  };
}

/**
 * Capture an approved order. Safe to call twice: PayPal answers a repeat
 * capture with ORDER_ALREADY_CAPTURED, which we resolve by reading the order
 * back rather than surfacing an error — the money did move, and the caller
 * needs to know that so tickets get issued.
 */
export async function captureOrder(orderId: string): Promise<CaptureResult> {
  if (isPaypalMock()) {
    return {
      orderId,
      captureId: `mock_cap_${orderId}`,
      status: "COMPLETED",
      completed: true,
      amount: null,
      currency: null,
      feeAmount: null,
      bookingReference: null,
    };
  }

  try {
    const json = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      requestId: `capture-${orderId}`,
      body: {},
    });
    return readCapture(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ORDER_ALREADY_CAPTURED")) {
      return getOrder(orderId);
    }
    throw err;
  }
}

/** Read-only order lookup — used to resolve an already-captured order. */
export async function getOrder(orderId: string): Promise<CaptureResult> {
  const json = await paypalFetch(`/v2/checkout/orders/${orderId}`, {
    method: "GET",
  });
  return readCapture(json);
}

/** Parse a webhook resource into the same shape as a capture response. */
export function readCaptureFromWebhook(
  resource: Record<string, unknown>,
): CaptureResult {
  // PAYMENT.CAPTURE.* delivers the capture itself as the resource, not an order.
  const amountObj = (resource.amount ?? {}) as Record<string, unknown>;
  const breakdown = (resource.seller_receivable_breakdown ?? {}) as Record<string, unknown>;
  const feeObj = (breakdown.paypal_fee ?? {}) as Record<string, unknown>;
  const fee = feeObj.value === undefined ? null : Number(feeObj.value);
  const status = String(resource.status ?? "");

  return {
    // The order id lives on the "up" link; custom_id is the reliable correlator.
    orderId: "",
    captureId: resource.id ? String(resource.id) : null,
    status,
    completed: status.toUpperCase() === "COMPLETED",
    amount: amountObj.value === undefined ? null : String(amountObj.value),
    currency: amountObj.currency_code === undefined ? null : String(amountObj.currency_code),
    feeAmount: fee !== null && Number.isFinite(fee) ? fee : null,
    bookingReference: resource.custom_id ? String(resource.custom_id) : null,
  };
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export type RefundResult = { id: string; status: string };

/**
 * Refund a capture. `amount` must be the presentment amount captured, not a
 * fresh conversion of the IDR total — see the currency note at the top.
 */
export async function refundCapture(args: {
  captureId: string;
  amount: string;
  currency: string;
  reason: string;
}): Promise<RefundResult> {
  if (isPaypalMock()) {
    return { id: `mock_refund_${args.captureId}`, status: "COMPLETED" };
  }

  const json = await paypalFetch(`/v2/payments/captures/${args.captureId}/refund`, {
    method: "POST",
    requestId: `refund-${args.captureId}`,
    body: {
      amount: { value: args.amount, currency_code: args.currency },
      note_to_payer: args.reason.slice(0, 255),
    },
  });

  return {
    id: String(json.id ?? ""),
    status: String(json.status ?? "PENDING"),
  };
}

// ─── Webhook verification ───────────────────────────────────────────────────

/** The four signature headers PayPal sends on every webhook POST. */
export type PaypalWebhookHeaders = {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
};

export function readWebhookHeaders(h: Headers): PaypalWebhookHeaders {
  return {
    transmissionId: h.get("paypal-transmission-id") ?? "",
    transmissionTime: h.get("paypal-transmission-time") ?? "",
    transmissionSig: h.get("paypal-transmission-sig") ?? "",
    certUrl: h.get("paypal-cert-url") ?? "",
    authAlgo: h.get("paypal-auth-algo") ?? "",
  };
}

/**
 * Verify a webhook via PayPal's postback endpoint.
 *
 * `rawBody` must be the exact bytes received — PayPal verifies the signature
 * over the original serialization, so re-stringifying parsed JSON fails even
 * when the content is identical.
 *
 * Fails closed: absent PAYPAL_WEBHOOK_ID, or any missing header, means we
 * cannot prove the caller is PayPal, so we do not trust it.
 */
export async function verifyPaypalWebhook(args: {
  headers: PaypalWebhookHeaders;
  rawBody: string;
}): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID || !isPaypalConfigured()) return false;

  const { headers } = args;
  if (
    !headers.transmissionId ||
    !headers.transmissionTime ||
    !headers.transmissionSig ||
    !headers.certUrl ||
    !headers.authAlgo
  ) {
    return false;
  }

  // Only accept certificates served by PayPal itself — the cert URL arrives in
  // an attacker-controllable header, and fetching an arbitrary host from it is
  // how signature verification gets bypassed.
  let certHost: string;
  try {
    certHost = new URL(headers.certUrl).hostname;
  } catch {
    return false;
  }
  if (!/(^|\.)paypal\.com$/.test(certHost)) return false;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(args.rawBody);
  } catch {
    return false;
  }

  try {
    const json = await paypalFetch("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        transmission_sig: headers.transmissionSig,
        cert_url: headers.certUrl,
        auth_algo: headers.authAlgo,
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: parsedBody,
      },
    });
    return String(json.verification_status ?? "").toUpperCase() === "SUCCESS";
  } catch (err) {
    console.error("[paypal] webhook verification failed:", err);
    return false;
  }
}

/** Read-only diagnostic — no funds move. */
export function pingPaypal(): {
  ok: boolean;
  mode: "live" | "sandbox" | "mock";
  /** True when `mode` was proven by a token, not inferred from the env flag. */
  modeProven: boolean;
  currency: string;
  webhookConfigured: boolean;
} {
  const mode = !isPaypalConfigured() ? "mock" : paypalHost();
  return {
    ok: isPaypalConfigured(),
    mode,
    modeProven: paypalHostIsProven(),
    currency: paypalPresentmentCurrency(),
    webhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID),
  };
}
