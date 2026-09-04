import { requireSuperAdmin } from "@/lib/auth";
import { EmailInboxViewer } from "./email-inbox-viewer";

export const metadata = { title: "Local email inbox · Admin" };

export default async function EmailInboxPage() {
  await requireSuperAdmin();
  return <EmailInboxViewer />;
}
