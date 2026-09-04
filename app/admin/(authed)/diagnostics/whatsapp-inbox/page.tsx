import { requireSuperAdmin } from "@/lib/auth";
import { WhatsappInboxViewer } from "./whatsapp-inbox-viewer";

export const metadata = { title: "Local WhatsApp inbox · Admin" };

export default async function WhatsappInboxPage() {
  await requireSuperAdmin();
  return <WhatsappInboxViewer />;
}
