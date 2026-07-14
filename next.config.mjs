import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    serverComponentsExternalPackages: ["@prisma/client"],
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
    ],
  },
  async redirects() {
    return [
      { source: "/operator/boats", destination: "/operator/armada", permanent: true },
      { source: "/operator/boats/:path*", destination: "/operator/armada/:path*", permanent: true },
      { source: "/operator/schedules", destination: "/operator/operasi/jadwal", permanent: true },
      { source: "/operator/schedules/:path*", destination: "/operator/operasi/jadwal/:path*", permanent: true },
      { source: "/operator/legs", destination: "/operator/operasi/keberangkatan", permanent: true },
      { source: "/operator/legs/:path*", destination: "/operator/operasi/keberangkatan/:path*", permanent: true },
      { source: "/operator/scanner", destination: "/operator/operasi/pemindai", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
