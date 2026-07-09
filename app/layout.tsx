import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SITE_TITLE = "Gilibali — Boat tickets across Indonesia";
const SITE_DESCRIPTION =
  "Book fast boats and ferries across Indonesian islands. Verified operators, transparent prices, fair refunds. Pay with QRIS, e-wallets, bank transfer, or card.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · Gilibali",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Gilibali",
  keywords: [
    "boat tickets Indonesia",
    "Bali to Gili fast boat",
    "Lombok ferry",
    "Nusa Penida fast boat",
    "Komodo ferry",
    "fast boat booking",
    "tiket kapal cepat",
  ],
  authors: [{ name: "CV Hi Bali Nusa Tenggara" }],
  category: "travel",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Gilibali",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_ID",
    alternateLocale: ["id_ID"],
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a3d62",
};

const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Gilibali",
  legalName: "CV Hi Bali Nusa Tenggara",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  sameAs: [],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "info@balinusafast.com",
    availableLanguage: ["English", "Indonesian"],
  },
};

const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Gilibali",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/search?origin={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} font-sans`}>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSONLD) }}
        />
      </body>
    </html>
  );
}
