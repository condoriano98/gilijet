import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/platform-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePlatformConfig, setOperatorCommission } from "../actions";

export const metadata = { title: "Pricing · Owner Console" };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { ok, error } = await searchParams;

  const config = await getPlatformConfig();
  const operators = await prisma.operator.findMany({
    where: { deletedAt: null },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true, commissionRate: true, status: true },
  });

  return (
    <div className="space-y-6">
      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Platform economics</CardTitle>
          <CardDescription>
            Platform-wide defaults. Operators still set their own fares; these
            control the commission default, an optional customer service fee,
            and traveler multipliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePlatformConfig} className="grid gap-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="commissionRate">Default commission (0–1)</Label>
                <Input
                  id="commissionRate"
                  name="commissionRate"
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  defaultValue={Number(config.commissionRate)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  e.g. 0.08 = 8%. Per-operator overrides win below.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="serviceFeeType">Service fee type</Label>
                <select
                  id="serviceFeeType"
                  name="serviceFeeType"
                  defaultValue={config.serviceFeeType ?? "NONE"}
                  className={selectClass}
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FLAT">Flat (IDR)</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="serviceFeeValue">Service fee value</Label>
                <Input
                  id="serviceFeeValue"
                  name="serviceFeeValue"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={Number(config.serviceFeeValue)}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="adultMultiplier">Adult multiplier</Label>
                <Input id="adultMultiplier" name="adultMultiplier" type="number" step="0.01" min="0" defaultValue={Number(config.adultMultiplier)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="childMultiplier">Child multiplier</Label>
                <Input id="childMultiplier" name="childMultiplier" type="number" step="0.01" min="0" defaultValue={Number(config.childMultiplier)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="infantMultiplier">Infant multiplier</Label>
                <Input id="infantMultiplier" name="infantMultiplier" type="number" step="0.01" min="0" defaultValue={Number(config.infantMultiplier)} required />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Save platform config</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-operator commission</CardTitle>
          <CardDescription>
            The effective rate used when splitting each booking. Overrides the
            platform default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No operators.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell className="font-medium">{op.companyName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{op.status}</TableCell>
                    <TableCell>
                      <form action={setOperatorCommission} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="operatorId" value={op.id} />
                        <Input
                          name="commissionRate"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          defaultValue={Number(op.commissionRate)}
                          className="h-8 w-28 text-right"
                        />
                        <Button type="submit" variant="outline" size="sm">Save</Button>
                      </form>
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
