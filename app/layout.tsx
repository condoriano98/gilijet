import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

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
  themeColor: "#0a3d62",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} font-sans`}>{children}</body>
    </html>
  );
}
