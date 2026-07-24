import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Signed URLs let admins view a private operator-documents object without
 * exposing the bucket publicly. Returns null when Supabase isn't configured
 * (local dev without storage) so callers can fall back to showing the file
 * name only.
 */
export async function getOperatorDocumentUrl(
  path: string,
): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await supabase.storage
    .from("operator-documents")
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error || !data) return null;
  return data.signedUrl;
}
