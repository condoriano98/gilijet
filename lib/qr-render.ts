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

/**
 * QR as a PNG buffer, for the boarding-pass PDF. react-pdf embeds raster
 * images only — an SVG data URL renders as a blank box — so the pass needs
 * pixels rather than the vector form the web and email use.
 *
 * 600px is well above the ~150px it prints at, so a phone screen scan and a
 * printed sheet both stay comfortably readable.
 */
export async function renderQrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 600,
  });
}
