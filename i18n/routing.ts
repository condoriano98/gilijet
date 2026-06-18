import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "id", "zh", "ja"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
