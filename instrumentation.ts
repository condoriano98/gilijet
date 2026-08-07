// Next.js calls register() once per runtime when the server boots. The env
// aliasing exists to feed Prisma, which only runs on Node.js. Importing it ONLY
// inside the `NEXT_RUNTIME === "nodejs"` guard lets webpack dead-code-eliminate
// it from the Edge bundle — avoiding the "Prisma on edge runtime" error.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
