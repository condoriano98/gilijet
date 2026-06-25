import { requireOperator } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function BahanBakarPage() {
  await requireOperator();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bahan Bakar</CardTitle>
        <CardDescription>
          Modul ini akan tersedia pada Phase B+ — membutuhkan model FuelLog.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState
          title="Belum ada catatan bahan bakar"
          description="Pencatatan konsumsi bahan bakar akan tersedia pada Phase B+."
        />
      </CardContent>
    </Card>
  );
}