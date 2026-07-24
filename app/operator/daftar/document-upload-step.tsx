"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Operator, OperatorDocument } from "@prisma/client";

export function DocumentUploadStep({
  operator,
  docType,
  title,
  description,
  instructions,
  nextStep,
  onStepChange,
}: {
  operator: Operator & { documents: OperatorDocument[] };
  docType: "SIUP" | "NPWP" | "VESSEL_LICENSE" | "INSURANCE_CERTIFICATE" | "CAPTAIN_LICENSE";
  title: string;
  description: string;
  instructions: string[];
  nextStep: number;
  onStepChange: (step: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingDoc = operator.documents.find(d => d.type === docType);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/operator/document-upload", {
        method: "POST",
        headers: {
          "X-Doc-Type": docType,
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      onStepChange(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <p className="font-semibold">What to upload:</p>
        <ul className="mt-2 list-inside space-y-1">
          {instructions.map((instr, idx) => (
            <li key={idx}>• {instr}</li>
          ))}
        </ul>
      </div>

      {existingDoc && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p className="font-semibold">✓ Uploaded: {existingDoc.fileName}</p>
          <p className="mt-1 text-xs">Status: {existingDoc.status}</p>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="file">Upload Document</Label>
        <Input
          id="file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={uploading}
          onChange={handleUpload}
          required={!existingDoc}
        />
        <p className="text-xs text-muted-foreground">
          Accepted formats: PDF, JPG, PNG (max 10MB)
        </p>
      </div>

      <div className="flex gap-3">
        {existingDoc ? (
          <Button onClick={() => onStepChange(nextStep)} disabled={uploading}>
            Continue
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => onStepChange(nextStep)}
            disabled={uploading}
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
}
