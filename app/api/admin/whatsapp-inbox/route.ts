import { getAdminSession } from "@/lib/auth";
import {
  clearLocalWhatsappInbox,
  getLocalWhatsappInbox,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  return Response.json({ messages: await getLocalWhatsappInbox() });
}

export async function DELETE() {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  await clearLocalWhatsappInbox();
  return Response.json({ cleared: true });
}
