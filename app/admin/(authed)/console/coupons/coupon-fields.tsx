import type { Promotion } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLocalDate } from "@/lib/datetime";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function witaLocal(d: Date | null | undefined): string {
  return d ? formatLocalDate(d, "yyyy-MM-dd'T'HH:mm") : "";
}

/**
 * Shared coupon fields for the create and edit forms. On edit the code is
 * read-only (still submitted so server validation passes; updateCoupon never
 * changes it).
 */
export function CouponFields({
  promo,
  editing,
  hideCode,
}: {
  promo?: Promotion;
  editing?: boolean;
  hideCode?: boolean;
}) {
  return (
    <div className="grid gap-5">
      <div className={hideCode ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
        {hideCode ? (
          // Bulk mode: codes are generated from the prefix. A template value
          // keeps the shared settings validator happy; it is never persisted.
          <input type="hidden" name="code" value="BULKTEMPLATE" />
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              name="code"
              defaultValue={promo?.code}
              readOnly={editing}
              placeholder="SUMMER25"
              className="font-mono uppercase"
              required
            />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="costBearer">Who absorbs the discount</Label>
          <select
            id="costBearer"
            name="costBearer"
            defaultValue={promo?.costBearer ?? "SHARED"}
            className={selectClass}
          >
            <option value="SHARED">Shared (platform + operator pro-rata)</option>
            <option value="PLATFORM">Platform (operator paid in full)</option>
            <option value="OPERATOR">Operator (commission unaffected)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="discountType">Type</Label>
          <select
            id="discountType"
            name="discountType"
            defaultValue={promo?.discountType ?? "PERCENT"}
            className={selectClass}
          >
            <option value="PERCENT">Percent (%)</option>
            <option value="FLAT">Flat (IDR)</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="discountValue">Value</Label>
          <Input
            id="discountValue"
            name="discountValue"
            type="number"
            step="any"
            min="0"
            defaultValue={promo ? Number(promo.discountValue) : ""}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxDiscountAmount">Max discount (IDR, % cap)</Label>
          <Input
            id="maxDiscountAmount"
            name="maxDiscountAmount"
            type="number"
            min="0"
            defaultValue={promo?.maxDiscountAmount != null ? Number(promo.maxDiscountAmount) : ""}
            placeholder="optional"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="minAmount">Min spend (IDR)</Label>
          <Input id="minAmount" name="minAmount" type="number" min="0" defaultValue={promo ? Number(promo.minAmount) : 0} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxUses">Max total uses</Label>
          <Input id="maxUses" name="maxUses" type="number" min="1" defaultValue={promo?.maxUses ?? ""} placeholder="unlimited" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="perCustomerLimit">Per-customer limit</Label>
          <Input id="perCustomerLimit" name="perCustomerLimit" type="number" min="1" defaultValue={promo?.perCustomerLimit ?? ""} placeholder="unlimited" />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="budgetCap">Budget cap (IDR)</Label>
          <Input id="budgetCap" name="budgetCap" type="number" min="0" defaultValue={promo?.budgetCap != null ? Number(promo.budgetCap) : ""} placeholder="unlimited" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="startsAt">Starts (WITA)</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={witaLocal(promo?.startsAt)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expiresAt">Expires (WITA)</Label>
          <Input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={witaLocal(promo?.expiresAt)} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="appliesToRouteCodes">Routes (ORIGIN-DEST, blank = all)</Label>
          <Textarea id="appliesToRouteCodes" name="appliesToRouteCodes" rows={2} defaultValue={promo?.appliesToRouteCodes.join(", ")} placeholder="Sanur-Nusa Penida, Padangbai-Gili Trawangan" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="appliesToOperatorIds">Operator IDs (blank = all)</Label>
          <Textarea id="appliesToOperatorIds" name="appliesToOperatorIds" rows={2} defaultValue={promo?.appliesToOperatorIds.join(", ")} placeholder="cuid1, cuid2" />
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="firstBookingOnly" defaultChecked={promo?.firstBookingOnly} className="h-4 w-4" />
          First booking only
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Non-shared cost bearers (PLATFORM / OPERATOR) require a budget cap, max
        uses, or max discount so exposure is bounded.
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={promo?.description ?? ""} placeholder="Shown to customers / internal note" />
      </div>
    </div>
  );
}
