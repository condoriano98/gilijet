const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

type WhatsAppConfig = {
  apiKey: string;
  phoneNumberId: string;
};

function getConfig(): WhatsAppConfig | null {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId) return null;
  return { apiKey, phoneNumberId };
}

export async function sendWhatsAppMessage(
  to: string,
  templateName: string,
  parameters: string[],
): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    console.log("[whatsapp] No config — skipping (mock mode)");
    return true;
  }

  try {
    const url = `${WHATSAPP_API_URL}/${config.phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "id" },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("[whatsapp] API error:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[whatsapp] Send failed:", err);
    return false;
  }
}

export async function sendBookingConfirmation(
  phoneNumber: string,
  bookingRef: string,
  route: string,
  date: string,
  time: string,
): Promise<boolean> {
  return sendWhatsAppMessage(phoneNumber, "booking_confirmation", [
    bookingRef,
    route,
    date,
    time,
  ]);
}

export async function sendDelayAlert(
  phoneNumber: string,
  bookingRef: string,
  route: string,
  newTime: string,
  reason: string,
): Promise<boolean> {
  return sendWhatsAppMessage(phoneNumber, "delay_alert", [
    bookingRef,
    route,
    newTime,
    reason,
  ]);
}
