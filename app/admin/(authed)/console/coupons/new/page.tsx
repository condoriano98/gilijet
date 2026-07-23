import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCoupon, generateBulkCodes } from "../../actions";
import { CouponFields } from "../coupon-fields";

export const metadata = { title: "New coupon · Owner Console" };

export default async function NewCouponPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; bulk?: string }>;
}) {
  await requireSuperAdmin();
  const { error, bulk } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {bulk ? "Generate coupon batch" : "New coupon"}
        </h2>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/console/coupons/new"
            className={!bulk ? "font-semibold text-sky-700" : "text-muted-foreground hover:underline"}
          >
            Single
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link
            href="/admin/console/coupons/new?bulk=1"
            className={bulk ? "font-semibold text-sky-700" : "text-muted-foreground hover:underline"}
          >
            Bulk
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{bulk ? "Batch settings" : "Coupon settings"}</CardTitle>
          <CardDescription>
            {bulk
              ? "Generate many unique codes that share these settings (e.g. for a campaign)."
              : "All customer-facing checks run server-side at booking time."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bulk ? (
            <form action={generateBulkCodes} className="grid gap-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="prefix">Code prefix</Label>
                  <Input id="prefix" name="prefix" placeholder="SUMMER" className="font-mono uppercase" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="count">How many</Label>
                  <Input id="count" name="count" type="number" min="1" max="500" defaultValue={50} required />
                </div>
              </div>
              <CouponFields hideCode />
              <div className="flex justify-end gap-3">
                <Button asChild variant="ghost">
                  <Link href="/admin/console/coupons">Cancel</Link>
                </Button>
                <Button type="submit">Generate batch</Button>
              </div>
            </form>
          ) : (
            <form action={createCoupon} className="grid gap-5">
              <CouponFields />
              <div className="flex justify-end gap-3">
                <Button asChild variant="ghost">
                  <Link href="/admin/console/coupons">Cancel</Link>
                </Button>
                <Button type="submit">Create coupon</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
