import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { OperatorStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeID } from "@/lib/utils";

async function transitionAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("next") ?? "") as OperatorStatus;
  const allowed: OperatorStatus[] = ["ACTIVE", "SUSPENDED", "REJECTED"];
  if (!id || !allowed.includes(next)) redirect(`/admin/operators/${id}`);

  const prev = await prisma.operator.findFirst({
    where: { id, deletedAt: null },
  });
  if (!prev) redirect("/admin/operators");

  const updated = await prisma.operator.update({
    where: { id },
    data: {
      status: next,
      documentsVerified: next === "ACTIVE" ? true : prev.documentsVerified,
    },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: id,
    action: `status_${next.toLowerCase()}`,
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { status: prev.status },
    newState: { status: updated.status },
  });

  redirect(`/admin/operators/${id}`);
}

function statusVariant(s: OperatorStatus) {
  switch (s) {
    case "ACTIVE":
      return "success" as const;
    case "PENDING":
      return "warning" as const;
    default:
      return "destructive" as const;
  }
}

export default async function OperatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const operator = await prisma.operator.findFirst({
    where: { id, deletedAt: null },
    include: {
      boats: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!operator) notFound();

  const bank = operator.bankAccountInfo as {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/operators"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All operators
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {operator.companyName}
          </h1>
          <p className="text-sm text-muted-foreground">{operator.email}</p>
        </div>
        <Badge variant={statusVariant(operator.status)}>
          {operator.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Transitions are recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={transitionAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={operator.id} />
            <Button
              type="submit"
              name="next"
              value="ACTIVE"
              disabled={operator.status === "ACTIVE"}
            >
              Approve &amp; activate
            </Button>
            <Button
              type="submit"
              name="next"
              value="SUSPENDED"
              variant="outline"
              disabled={operator.status === "SUSPENDED"}
            >
              Suspend
            </Button>
            <Button
              type="submit"
              name="next"
              value="REJECTED"
              variant="destructive"
              disabled={operator.status === "REJECTED"}
            >
              Reject
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Contact person" value={operator.contactPerson} />
            <KV label="Phone (WhatsApp)" value={operator.phoneNumber} />
            <KV label="NPWP" value={operator.npwp ?? "—"} />
            <KV label="Commission rate" value={`${(Number(operator.commissionRate) * 100).toFixed(2)}%`} />
            <KV
              label="Documents verified"
              value={operator.documentsVerified ? "Yes" : "No"}
            />
            <KV label="Created" value={formatDateTimeID(operator.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payout account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Bank" value={bank.bankName ?? "—"} />
            <KV label="Account number" value={bank.accountNumber ?? "—"} />
            <KV label="Account holder" value={bank.accountHolder ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Boats ({operator.boats.length.toLocaleString()})
          </CardTitle>
          <CardDescription>
            Operators add their own boats from the operator dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {operator.boats.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No boats yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Registration #</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operator.boats.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.registrationNumber}
                    </TableCell>
                    <TableCell>{b.capacity}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
