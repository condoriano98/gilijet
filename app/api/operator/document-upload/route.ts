import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getOperatorSession } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB, matches the UI copy

const DOC_TYPES = [
  "SIUP",
  "NPWP",
  "VESSEL_LICENSE",
  "INSURANCE_CERTIFICATE",
  "CAPTAIN_LICENSE",
] as const;
type DocType = (typeof DOC_TYPES)[number];

/** Strip directory separators and keep only a safe filename fragment. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "document";
}

export async function POST(req: NextRequest) {
  try {
    // The operator is derived from the session cookie, never from a
    // client-supplied header — otherwise any caller could upload documents
    // (or overwrite existing ones) under an arbitrary operator's account.
    const session = await getOperatorSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const operatorId = session.sub;

    const docTypeHeader = req.headers.get("X-Doc-Type");
    if (!docTypeHeader || !DOC_TYPES.includes(docTypeHeader as DocType)) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }
    const docType = docTypeHeader as DocType;

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 503 }
      );
    }
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
    });

    if (!operator) {
      return NextResponse.json(
        { error: "Operator not found" },
        { status: 404 }
      );
    }

    const contentType = req.headers.get("content-type") || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Only PDF, JPG, and PNG files are accepted" },
        { status: 400 },
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 0 && contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds 10MB" }, { status: 413 });
    }

    const buffer = await req.arrayBuffer();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds 10MB" }, { status: 413 });
    }

    // Extract filename from content-disposition if available
    const contentDisposition = req.headers.get("content-disposition");
    let fileName = "document";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) fileName = match[1];
    }
    fileName = sanitizeFileName(fileName);

    const path = `${operator.id}/${docType.toLowerCase()}/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
      .from("operator-documents")
      .upload(path, Buffer.from(buffer), {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Atomic upsert on the (operatorId, type) unique constraint — avoids the
    // find-then-create race where two concurrent uploads for the same doc
    // type both miss the lookup and create duplicate rows. Replacing the file
    // invalidates any prior admin decision, so re-queue for review rather
    // than leaving a stale APPROVED status on new content.
    await prisma.operatorDocument.upsert({
      where: { operatorId_type: { operatorId, type: docType } },
      update: {
        fileUrl: data.path,
        fileName,
        status: "PENDING",
        verifiedBy: null,
        verifiedAt: null,
        rejectionNote: null,
      },
      create: {
        operatorId,
        type: docType,
        fileUrl: data.path,
        fileName,
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, path: data.path });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
