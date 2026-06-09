import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/utils";
import { formatLocalDate } from "@/lib/datetime";

type AgentSession = {
  sub: string;
  role: "agent";
  email: string;
};

async function requireAgent(): Promise<AgentSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get("gilijet_agent")?.value;
  if (!token) redirect("/agent/login");

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret");
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AgentSession;
  } catch {
    redirect("/agent/login");
  }
}

export const metadata = { title: "Agent Dashboard · Gilijet" };

export default async function AgentDashboardPage() {
  const session = await requireAgent();

  const [agent, stats, recentBookings] = await Promise.all([
    prisma.agent.findUnique({ where: { id: session.sub } }),
    prisma.booking.aggregate({
      where: { agentId: session.sub, status: "CONFIRMED" },
      _sum: { agentCommissionAmount: true, totalAmount: true },
      _count: true,
    }),
    prisma.booking.findMany({
      where: { agentId: session.sub },
      include: { leg: { include: { schedule: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!agent) redirect("/agent/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex items-center justify-between py-4">
          <div>
            <h1 className="text-xl font-bold">Gilijet Agent Portal</h1>
            <p className="text-sm text-slate-600">{agent.companyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/agent/bookings">
              <Button variant="outline" size="sm">Bookings</Button>
            </Link>
            <Link href="/agent/commissions">
              <Button variant="outline" size="sm">Commissions</Button>
            </Link>
            <form action={async () => {
              "use server";
              const cookieStore = await cookies();
              cookieStore.delete("gilijet_agent");
              redirect("/agent/login");
            }}>
              <Button type="submit" variant="ghost" size="sm">Sign out</Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Sales</CardDescription>
              <CardTitle className="text-3xl">
                {formatIDR(Number(stats._sum.totalAmount ?? 0))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Commission Earned</CardDescription>
              <CardTitle className="text-3xl">
                {formatIDR(Number(stats._sum.agentCommissionAmount ?? 0))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bookings</CardDescription>
              <CardTitle className="text-3xl">{stats._count}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
            <CardDescription>Your last 10 bookings</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                No bookings yet. Start selling!
              </p>
            ) : (
              <div className="space-y-3">
                {recentBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {b.leg.schedule.originPort} → {b.leg.schedule.destinationPort}
                        </span>
                        <Badge
                          variant={
                            b.status === "CONFIRMED"
                              ? "success"
                              : b.status === "PENDING_PAYMENT"
                                ? "warning"
                                : "destructive"
                          }
                          className="text-xs"
                        >
                          {b.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {formatLocalDate(b.leg.departureDate, "dd MMM yyyy")} ·{" "}
                        {b.customerName} · {b.bookingReference}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatIDR(Number(b.totalAmount))}</div>
                      <div className="text-xs text-slate-500">
                        Commission: {formatIDR(Number(b.agentCommissionAmount))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
