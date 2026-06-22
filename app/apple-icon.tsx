import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #0a3d62 0%, #1e6091 55%, #ff9a3c 100%)",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 120,
          letterSpacing: -4,
        }}
      >
        G
      </div>
    ),
    { ...size },
  );
}
