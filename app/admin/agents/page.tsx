import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/utils";

export const metadata = { title: "Agents · Admin · Gilijet" };

export default async function AdminAgentsPage() {
  await requireAdmin();

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bookings: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <Button asChild>
          <Link href="/admin/agents/new">+ Onboard Agent</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Agents ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              No agents yet. Onboard your first agent to start.
            </p>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{agent.companyName}</span>
                      <Badge
                        variant={
                          agent.status === "ACTIVE"
                            ? "success"
                            : agent.status === "PENDING"
                              ? "warning"
                              : agent.status === "SUSPENDED"
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {agent.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {agent.contactPerson} · {agent.email}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Commission: {(Number(agent.commissionRate) * 100).toFixed(1)}% ·{" "}
                      {agent._count.bookings} bookings
                    </div>
                  </div>
                  <div className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/agents/${agent.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
