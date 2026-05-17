import QRCode from "qrcode";

/**
 * Render a QR payload as an inline SVG string. The output is safe to drop
 * into HTML; size scales via CSS on the wrapping element.
 */
export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });
}

/** Same as renderQrSvg but as a data: URL — useful for email <img> tags. */
export async function renderQrSvgDataUrl(payload: string): Promise<string> {
  const svg = await renderQrSvg(payload);
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}
