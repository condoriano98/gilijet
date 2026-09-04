import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeWhatsappNumber, whatsappProvider } from "@/lib/whatsapp";

describe("normalizeWhatsappNumber", () => {
  it("keeps 62-prefixed digits", () => {
    expect(normalizeWhatsappNumber("+62 851-6124-4001")).toBe("6285161244001");
  });

  it("converts a leading 0 to the 62 country code", () => {
    expect(normalizeWhatsappNumber("085161244001")).toBe("6285161244001");
  });

  it("rejects unusably short numbers", () => {
    expect(normalizeWhatsappNumber("12345")).toBeNull();
  });
});

describe("sandbox default", () => {
  it("reports no provider when neither WATI nor Meta is configured", () => {
    expect(whatsappProvider()).toBeNull();
  });
});

describe("Meta WhatsApp Cloud API", () => {
  const metaEnv = {
    META_WHATSAPP_TOKEN: "test-token",
    META_WHATSAPP_PHONE_NUMBER_ID: "101010",
  };

  beforeEach(() => {
    vi.resetModules();
    for (const [k, v] of Object.entries(metaEnv)) process.env[k] = v;
  });

  afterEach(() => {
    for (const k of Object.keys(metaEnv)) delete process.env[k];
    vi.unstubAllGlobals();
  });

  it("sends text via the graph.facebook.com messages endpoint", async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([String(url), init ?? {}]);
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.1" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { sendPaymentReceivedWhatsapp, whatsappProvider } = await import(
      "@/lib/whatsapp"
    );
    expect(whatsappProvider()).toBe("meta");

    const result = await sendPaymentReceivedWhatsapp({
      to: "085161244001",
      customerName: "Meta Rider",
      bookingReference: "BK-META-1",
      lookupUrl: "http://localhost:3000/b/BK-META-1",
    });

    expect(result).toEqual({ delivered: true, provider: "meta" });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(
      "https://graph.facebook.com/v22.0/101010/messages",
    );
    const body = JSON.parse(String(calls[0][1].body));
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6285161244001",
      type: "text",
    });
    expect(body.text.body).toContain("BK-META-1");
  });

  it("sends templates with positional body parameters", async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([String(url), init ?? {}]);
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.2" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { sendTemplateMessage } = await import("@/lib/whatsapp");
    const result = await sendTemplateMessage({
      to: "6285161244001",
      templateName: "gilifast_bookig_alert",
      broadcastName: "booking-alerts",
      params: { event: "PAID", reference: "BK-META-2" },
    });

    expect(result).toEqual({ delivered: true, provider: "meta" });
    const body = JSON.parse(String(calls[0][1].body));
    expect(body.template).toMatchObject({
      name: "gilifast_bookig_alert",
      language: { code: "id" },
    });
    expect(body.template.components[0]).toEqual({
      type: "body",
      parameters: [
        { type: "text", text: "PAID" },
        { type: "text", text: "BK-META-2" },
      ],
    });
  });

  it("sends the departure reminder as the approved customer template", async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([String(url), init ?? {}]);
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.4" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { sendDepartureReminderWhatsapp } = await import("@/lib/whatsapp");
    const result = await sendDepartureReminderWhatsapp({
      to: "6285161244001",
      customerName: "Meta Rider",
      bookingReference: "BK-META-4",
      route: { originPort: "Sanur", destinationPort: "Nusa Penida" },
      boatName: "Cantika 09",
      departureDate: new Date("2026-09-03T23:00:00Z"),
      lookupUrl: "http://localhost:3000/b/BK-META-4",
    });

    expect(result).toEqual({ delivered: true, provider: "meta" });
    const body = JSON.parse(String(calls[0][1].body));
    expect(body.template.name).toBe("gilifast_customer_departure_reminder");
    expect(
      body.template.components[0].parameters.map((p: { text: string }) => p.text),
    ).toEqual([
      "Meta Rider",
      "Sanur → Nusa Penida",
      "Cantika 09",
      "04 Sep 2026 07:00 WITA",
      "BK-META-4",
      "http://localhost:3000/b/BK-META-4",
    ]);
  });

  it("uploads a document to /media, then sends a document message", async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([String(url), init ?? {}]);
        if (String(url).endsWith("/media")) {
          return new Response(JSON.stringify({ id: "media-123" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.3" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { sendBoardingPassDocument } = await import("@/lib/whatsapp");
    const result = await sendBoardingPassDocument({
      to: "085161244001",
      customerName: "Meta Rider",
      bookingReference: "BK-META-3",
      route: { originPort: "Sanur", destinationPort: "Nusa Penida" },
      departureDate: new Date("2026-09-02T00:00:00Z"),
      pdf: Buffer.from("fake pdf bytes"),
      filename: "Gilifast-BK-META-3.pdf",
    });

    expect(result).toEqual({ delivered: true, provider: "meta" });
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(
      "https://graph.facebook.com/v22.0/101010/media",
    );
    expect(calls[1][0]).toBe(
      "https://graph.facebook.com/v22.0/101010/messages",
    );
    const msg = JSON.parse(String(calls[1][1].body));
    expect(msg).toMatchObject({
      type: "document",
      document: { id: "media-123", filename: "Gilifast-BK-META-3.pdf" },
    });
    expect(msg.document.caption).toContain("BK-META-3");
  });
});
