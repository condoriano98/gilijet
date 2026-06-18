import { redirect } from "next/navigation";
import { clearOperatorSession, getOperatorSession } from "@/lib/auth";
import { TopBar } from "@/components/operator-shell/top-bar";
import { Sidebar } from "@/components/operator-shell/sidebar";

async function signOutAction() {
  "use server";
  await clearOperatorSession();
  redirect("/operator/login");
}

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOperatorSession();
  if (!session) return <>{children}</>;

  return (
    <div className="min-h-screen bg-mekari-neutral-50">
      <TopBar email={session.email} signOutAction={signOutAction} />
      <div className="pt-14">
        <OperatorShellClient email={session.email}>
          {children}
        </OperatorShellClient>
      </div>
    </div>
  );
}

function OperatorShellClient({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  return (
    <div className="flex">
      <Sidebar collapsed={false} onToggle={() => {}} email={email} />
      <main className="ml-60 min-h-[calc(100vh-3.5rem)] flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
