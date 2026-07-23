import { redirect } from "next/navigation";

// Coupon management moved into the super-admin-only Owner Console.
export default function PromosRedirect() {
  redirect("/admin/console/coupons");
}
