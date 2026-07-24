"use client";

import { useRouter } from "next/navigation";
import { DocumentUploadStep } from "./document-upload-step";
import type { Operator, OperatorDocument } from "@prisma/client";

export function Step5Insurance({ operator }: { operator: Operator & { documents: OperatorDocument[] } }) {
  const router = useRouter();

  return (
    <DocumentUploadStep
      operator={operator}
      docType="INSURANCE_CERTIFICATE"
      title="Insurance Certificate (Asuransi Kapal)"
      description="Vessel insurance proof of coverage"
      instructions={[
        "Insurance certificate or policy document",
        "Must cover vessel and passenger liability",
        "Should be current and valid",
        "Minimum coverage amount requirements",
      ]}
      nextStep={6}
      onStepChange={(step) => router.push(`/operator/daftar?step=${step}`)}
    />
  );
}
