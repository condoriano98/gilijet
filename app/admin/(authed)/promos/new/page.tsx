import { redirect } from "next/navigation";

// Coupon creation moved into the super-admin-only Owner Console.
export default function NewPromoRedirect() {
  redirect("/admin/console/coupons/new");
}
