// Next.js calls register() once per runtime when the server boots. The env
// aliasing + auto-seed need Prisma (and, via lib/seed-data, bcryptjs), which
// only run on Node.js. Importing that logic ONLY inside the
// `NEXT_RUNTIME === "nodejs"` guard lets webpack dead-code-eliminate it from
// the Edge bundle — avoiding "Prisma on edge runtime" and the bcryptjs
// "Can't resolve 'crypto'" warning.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
