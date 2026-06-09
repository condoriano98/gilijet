import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function generateApiKey(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("hex");
  const hash = hashApiKey(plain);
  return { plain, hash };
}

export function hashApiKey(apiKey: string): string {
  const salt = process.env.AGENT_API_SALT || "gilijet-agent-salt-default";
  return scryptSync(apiKey, salt, 64).toString("hex");
}

export function verifyApiKey(plain: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hashApiKey(plain), "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
