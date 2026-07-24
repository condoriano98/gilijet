"use client";

import { useRouter } from "next/navigation";
import { DocumentUploadStep } from "./document-upload-step";
import type { Operator, OperatorDocument } from "@prisma/client";

export function Step4VesselLicense({ operator }: { operator: Operator & { documents: OperatorDocument[] } }) {
  const router = useRouter();

  return (
    <DocumentUploadStep
      operator={operator}
      docType="VESSEL_LICENSE"
      title="Vessel License (Syarat Kelayakan Kapal)"
      description="Boat/vessel operational license from Ministry of Transportation"
      instructions={[
        "Copy of vessel operational certificate",
        "Must show vessel registration and capacity",
        "Issued by Kementerian Transportasi",
        "Should include class and certification details",
      ]}
      nextStep={5}
      onStepChange={(step) => router.push(`/operator/daftar?step=${step}`)}
    />
  );
}
