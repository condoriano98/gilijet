"use client";

import { useRouter } from "next/navigation";
import { DocumentUploadStep } from "./document-upload-step";
import type { Operator, OperatorDocument } from "@prisma/client";

export function Step2Siup({ operator }: { operator: Operator & { documents: OperatorDocument[] } }) {
  const router = useRouter();

  return (
    <DocumentUploadStep
      operator={operator}
      docType="SIUP"
      title="SIUP (Surat Izin Usaha Perdagangan)"
      description="Business permit from Indonesia's Ministry of Commerce"
      instructions={[
        "Clear scan or photo of SIUP certificate",
        "Document must be current (not expired)",
        "Both front and back if available",
        "Issued by Dinas Perindustrian dan Perdagangan",
      ]}
      nextStep={3}
      onStepChange={(step) => router.push(`/operator/daftar?step=${step}`)}
    />
  );
}
