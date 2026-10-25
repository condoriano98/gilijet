import { requireOperator } from '@/shared/server/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';

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