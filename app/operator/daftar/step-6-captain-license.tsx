"use client";

import { useRouter } from "next/navigation";
import { DocumentUploadStep } from "./document-upload-step";
import type { Operator, OperatorDocument } from "@prisma/client";

export function Step6CaptainLicense({ operator }: { operator: Operator & { documents: OperatorDocument[] } }) {
  const router = useRouter();

  return (
    <DocumentUploadStep
      operator={operator}
      docType="CAPTAIN_LICENSE"
      title="Captain License (Sertifikat Kompetensi Berlayar)"
      description="Captain certification for vessel operation"
      instructions={[
        "Captain/master mariner certificate",
        "Should show competency rating",
        "Valid and current certification",
        "Issued by Ministry of Transportation or recognized authority",
      ]}
      nextStep={7}
      onStepChange={(step) => router.push(`/operator/daftar?step=${step}`)}
    />
  );
}
