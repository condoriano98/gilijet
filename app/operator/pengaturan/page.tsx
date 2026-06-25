import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/datetime";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

const TABS = [
  { key: "profil", label: "Profil" },
  { key: "staf", label: "Staf" },
  { key: "bank", label: "Bank" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function roleLabel(r: string): string {
  const map: Record<string, string> = {
    MANAGER: "Manajer",
    GATE: "Gerbang",
    BOOTH_AGENT: "Booth",
    ACCOUNTANT: "Akuntan",
    CAPTAIN: "Kapten",
    CREW: "Awak",
    ENGINEER: "Teknisi",
  };
  return map[r] ?? r;
}

type BankInfo = {
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
};

export default async function PengaturanPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ok?: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "profil") as TabKey;

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: {
      companyName: true,
      contactPerson: true,
      phoneNumber: true,
      npwp: true,
      bankAccountInfo: true,
    },
  });

  return (
    <ListPageTemplate title="Pengaturan" subtitle="Profil, staf, dan informasi bank">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/operator/pengaturan?tab=${t.key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === tab
                ? "bg-mekari-primary text-white"
                : "bg-mekari-surface text-mekari-neutral-600 hover:bg-mekari-neutral-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {sp.ok === "saved" && tab === "profil" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Profil berhasil disimpan.
        </p>
      )}

      {tab === "profil" && operator && (
        <ProfileForm
          initial={{
            companyName: operator.companyName,
            contactPerson: operator.contactPerson,
            phoneNumber: operator.phoneNumber,
            npwp: operator.npwp,
          }}
        />
      )}

      {tab === "staf" && <StaffTab operatorId={operatorId} />}

      {tab === "bank" && operator && (
        <BankTab info={operator.bankAccountInfo as unknown as BankInfo} />
      )}
    </ListPageTemplate>
  );
}

async function StaffTab({ operatorId }: { operatorId: string }) {
  const staff = await prisma.operatorStaff.findMany({
    where: { operatorId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
    },
  });

  type StaffRow = (typeof staff)[number];
  const columns = [
    { key: "fullName", header: "Nama", render: (r: StaffRow) => r.fullName },
    { key: "email", header: "Email", render: (r: StaffRow) => r.email },
    { key: "role", header: "Peran", render: (r: StaffRow) => roleLabel(r.role) },
    {
      key: "status",
      header: "Status",
      render: (r: StaffRow) => (
        <StatusBadge variant={r.status === "ACTIVE" ? "success" : "warning"}>
          {r.status === "ACTIVE" ? "Aktif" : "Ditangguhkan"}
        </StatusBadge>
      ),
    },
    {
      key: "lastLoginAt",
      header: "Login Terakhir",
      render: (r: StaffRow) => (r.lastLoginAt ? formatLocalDate(r.lastLoginAt) : "-"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staf Operator</CardTitle>
        <CardDescription>
          Daftar staf (hanya baca). CRUD staf tersedia pada fase berikutnya.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={staff} emptyMessage="Belum ada staf" />
      </CardContent>
    </Card>
  );
}

function BankTab({ info }: { info: BankInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Informasi Bank</CardTitle>
        <CardDescription>
          Data rekening untuk pencairan dan settlement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BankField label="Bank" value={info.bankName} />
          <BankField label="Nomor Rekening" value={info.accountNumber} />
          <BankField label="Pemilik Rekening" value={info.accountHolder} />
        </div>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Pengaturan bank akan tersedia pada Phase B+.
        </p>
      </CardContent>
    </Card>
  );
}

function BankField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-mekari-neutral-500">{label}</p>
      <p className="text-sm font-medium text-mekari-neutral-900">{value || "-"}</p>
    </div>
  );
}
