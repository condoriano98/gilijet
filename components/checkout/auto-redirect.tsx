"use client";

import { useEffect } from "react";

/** Redirect the browser to an external payment URL shortly after mount. */
export function AutoRedirect({
  url,
  delayMs = 1200,
}: {
  url: string;
  delayMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = url;
    }, delayMs);
    return () => clearTimeout(t);
  }, [url, delayMs]);
  return null;
}
