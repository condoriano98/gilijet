"use client";

import { useRouter } from "next/navigation";
import { DocumentUploadStep } from "./document-upload-step";
import type { Operator, OperatorDocument } from "@prisma/client";

export function Step3Npwp({ operator }: { operator: Operator & { documents: OperatorDocument[] } }) {
  const router = useRouter();

  return (
    <DocumentUploadStep
      operator={operator}
      docType="NPWP"
      title="NPWP (Nomor Pokok Wajib Pajak)"
      description="Indonesian tax registration number"
      instructions={[
        "Copy of company NPWP certificate",
        "Should show 15-digit tax ID",
        "Must be in the company name",
        "Issued by Direktorat Jenderal Pajak",
      ]}
      nextStep={4}
      onStepChange={(step) => router.push(`/operator/daftar?step=${step}`)}
    />
  );
}
