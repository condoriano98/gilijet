import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Gilijet — Boat tickets across Indonesia";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, #0a3d62 0%, #1e6091 55%, #ff9a3c 130%)",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.18)",
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 48,
              letterSpacing: -2,
            }}
          >
            G
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 32,
              opacity: 0.92,
              letterSpacing: -0.5,
            }}
          >
            Gilijet
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            Boat tickets across Indonesia.
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.3,
              opacity: 0.88,
              maxWidth: 900,
            }}
          >
            Verified operators · Transparent prices · Fair refunds
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            opacity: 0.78,
          }}
        >
          <span>Bali</span>
          <span>·</span>
          <span>Gili</span>
          <span>·</span>
          <span>Lombok</span>
          <span>·</span>
          <span>Nusa Penida</span>
          <span>·</span>
          <span>Komodo</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
