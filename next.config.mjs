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
  // Stable since Next 15; was experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
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
  // No operator redirects here on purpose. These used to point the English
  // routes at the Indonesian ones (/operator/boats -> /operator/armada, and
  // the same for schedules/legs/scanner), while each Indonesian page redirects
  // back to its English counterpart. Config redirects are evaluated before
  // filesystem routes, so every pair was an infinite loop and the whole fleet,
  // schedule, manifest and scanner UI returned ERR_TOO_MANY_REDIRECTS.
  //
  // The :path* variants were worse: they forwarded into directories that don't
  // exist (armada/ and operasi/jadwal/ have no new or [id] children), so
  // boat create/edit, schedule create/edit and the per-departure manifest at
  // /operator/legs/[id] all 404'd.
  //
  // The English paths hold the real pages and are canonical. The Indonesian
  // stubs forward here in a single hop, which keeps the sidebar links working.
};

export default withNextIntl(nextConfig);
