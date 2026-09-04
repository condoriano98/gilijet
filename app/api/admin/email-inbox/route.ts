import { getAdminSession } from "@/lib/auth";
import { clearLocalEmailInbox, getLocalEmailInbox } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  return Response.json({ messages: await getLocalEmailInbox() });
}

export async function DELETE() {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  await clearLocalEmailInbox();
  return Response.json({ cleared: true });
}
