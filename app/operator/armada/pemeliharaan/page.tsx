import { requireOperator } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function PemeliharaanPage() {
  await requireOperator();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemeliharaan</CardTitle>
        <CardDescription>
          Modul ini akan tersedia pada Phase B+ — membutuhkan model
          MaintenanceRecord.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState
          title="Belum ada catatan pemeliharaan"
          description="Riwayat perawatan armada akan tersedia pada Phase B+."
        />
      </CardContent>
    </Card>
  );
}