import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Above the 5s default because a couple of files carry a heavy import —
    // @react-pdf/renderer in the boarding-pass tests most of all — and the
    // cost lands on the first test in the file. On a loaded CI runner that
    // was enough to trip the default and fail tests that are merely slow to
    // collect, not wrong.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
