import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gilijet — Boat tickets across Indonesia",
    template: "%s · Gilijet",
  },
  description:
    "Book fast boats and ferries across Indonesian islands. Pay with QRIS, e-wallets, bank transfer, or card.",
  applicationName: "Gilijet",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0ea5e9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
