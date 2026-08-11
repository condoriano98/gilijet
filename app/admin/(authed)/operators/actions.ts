"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  collectOperatorSubtree,
  describeMoneyBlockers,
  purgeOperator,
  subtreeBlockers,
} from "@/lib/operator-purge";

const LIST = "/admin/operators";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/**
 * Erase an operator and everything hanging off it.
 *
 * The subtree walk lives in `lib/operator-purge.ts` so the bulk purge script
 * shares it. What belongs here is the admin-facing part: who may do this, the
 * typed confirmation, how a refusal is worded, and the audit trail.
 *
 * The refusal is the point. That subtree reaches Payment, Refund and Ticket —
 * the record of money that actually moved — so if any exist the operator is
 * sent to Suspend, which is reversible and hides it just as well. Everything
 * below that line carries no money and is safe to drop.
 */
export async function deleteOperatorAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(LIST);
  const back = `${LIST}/${id}`;

  const operator = await prisma.operator.findFirst({
    where: { id, deletedAt: null },
  });
  if (!operator) redirect(LIST);

  if (String(formData.get("confirmation") ?? "").trim() !== operator.companyName) {
    fail(back, "Type the company name exactly as shown to confirm deletion.");
  }

  const subtree = await collectOperatorSubtree(id);
  const blockers = await subtreeBlockers(subtree);

  const money = describeMoneyBlockers(blockers);
  if (money.length > 0) {
    fail(
      back,
      `${operator.companyName} has ${money.join(" and ")} on record. That is the audit trail for money already taken, so this operator cannot be erased — suspend it instead.`,
    );
  }

  if (blockers.liveBookings > 0) {
    const n = blockers.liveBookings;
    fail(
      back,
      `${n} upcoming booking${n === 1 ? " is" : "s are"} still live — cancel those departures first, which refunds the customers.`,
    );
  }

  const deleted = await purgeOperator(id, subtree);

  await audit({
    entityType: "OPERATOR",
    entityId: id,
    action: "deleted_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    // The row no longer exists, so this snapshot is the only surviving record
    // of who was removed. AuditLog has no foreign key to Operator, so earlier
    // entries for this id stay readable alongside it.
    previousState: {
      email: operator.email,
      companyName: operator.companyName,
      contactPerson: operator.contactPerson,
      phoneNumber: operator.phoneNumber,
      status: operator.status,
      createdAt: operator.createdAt.toISOString(),
    },
    newState: { deleted },
  });

  revalidatePath(LIST);
  redirect(`${LIST}?deleted=${encodeURIComponent(operator.companyName)}`);
}
