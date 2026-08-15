import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { OperatorStatus, OperatorDocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOperatorDocumentUrl } from "@/lib/operator-documents";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOperatorAction } from "../actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeID } from "@/lib/utils";

const DOC_TYPE_LABEL: Record<string, string> = {
  SIUP: "SIUP (business permit)",
  NPWP: "NPWP (tax ID)",
  VESSEL_LICENSE: "Vessel license",
  INSURANCE_CERTIFICATE: "Insurance certificate",
  CAPTAIN_LICENSE: "Captain license",
  OTHER: "Other",
};

async function reviewDocumentAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const operatorId = String(formData.get("operatorId") ?? "");
  const docId = String(formData.get("docId") ?? "");
  const next = String(formData.get("next") ?? "") as OperatorDocumentStatus;
  const allowed: OperatorDocumentStatus[] = ["APPROVED", "REJECTED"];
  if (!operatorId || !docId || !allowed.includes(next)) {
    redirect(`/admin/operators/${operatorId}`);
  }

  const prev = await prisma.operatorDocument.findFirst({
    where: { id: docId, operatorId },
  });
  if (!prev) redirect(`/admin/operators/${operatorId}`);

  await prisma.operatorDocument.update({
    where: { id: docId },
    data: {
      status: next,
      verifiedBy: session.sub,
      verifiedAt: new Date(),
      rejectionNote:
        next === "REJECTED"
          ? String(formData.get("rejectionNote") ?? "").trim() || null
          : null,
    },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: operatorId,
    action: `document_${next.toLowerCase()}`,
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { docId, status: prev.status },
    newState: { docId, status: next },
  });

  redirect(`/admin/operators/${operatorId}`);
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const operator = await prisma.operator.findFirst({
    where: { id, deletedAt: null },
    include: {
      boats: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!operator) notFound();

  const bank = operator.bankAccountInfo as {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };

  const documentsWithUrls = await Promise.all(
    operator.documents.map(async (doc) => ({
      doc,
      url: await getOperatorDocumentUrl(doc.fileUrl),
    })),
  );

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

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

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
            KYB documents ({operator.documents.length.toLocaleString()})
          </CardTitle>
          <CardDescription>
            Review each document before approving the operator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documentsWithUrls.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {documentsWithUrls.map(({ doc, url }) => (
                <div
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {DOC_TYPE_LABEL[doc.type] ?? doc.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.fileName ?? doc.fileUrl} · uploaded{" "}
                      {formatDateTimeID(doc.createdAt)}
                    </p>
                    {doc.status === "REJECTED" && doc.rejectionNote ? (
                      <p className="mt-1 text-xs text-red-600">
                        Rejection note: {doc.rejectionNote}
                      </p>
                    ) : null}
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-emerald-600 underline"
                      >
                        View document
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        doc.status === "APPROVED"
                          ? "success"
                          : doc.status === "REJECTED"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {doc.status}
                    </Badge>
                    <form action={reviewDocumentAction} className="flex gap-2">
                      <input type="hidden" name="operatorId" value={operator.id} />
                      <input type="hidden" name="docId" value={doc.id} />
                      <Button
                        type="submit"
                        name="next"
                        value="APPROVED"
                        size="sm"
                        disabled={doc.status === "APPROVED"}
                      >
                        Approve
                      </Button>
                      <Button
                        type="submit"
                        name="next"
                        value="REJECTED"
                        size="sm"
                        variant="destructive"
                        disabled={doc.status === "REJECTED"}
                      >
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Boats ({operator.boats.length.toLocaleString()})
          </CardTitle>
          <CardDescription>
            Operators can add their own from the operator dashboard, or you can
            add them for this operator under{" "}
            <Link
              href={`/admin/operations/boats/new?operatorId=${operator.id}`}
              className="text-sky-700 hover:underline"
            >
              Operations
            </Link>
            .
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

      {session.adminRole === "SUPER_ADMIN" ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle>Delete operator</CardTitle>
            <CardDescription>
              Permanently erases {operator.companyName} along with its boats,
              routes, departures and staff. This cannot be undone, and it frees
              the email address for onboarding again. Refused outright if the
              operator has any payment, refund or issued ticket on record —
              suspend it instead, which hides it just as well and can be
              reversed.
            </CardDescription>
          </CardHeader>
          <form action={deleteOperatorAction}>
            <CardContent>
              <input type="hidden" name="id" value={operator.id} />
              <label
                htmlFor="confirmation"
                className="text-sm text-muted-foreground"
              >
                Type <span className="font-medium text-foreground">
                  {operator.companyName}
                </span>{" "}
                to confirm.
              </label>
              <Input
                id="confirmation"
                name="confirmation"
                autoComplete="off"
                className="mt-2 max-w-sm"
              />
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" variant="destructive">
                Delete operator
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : null}
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
