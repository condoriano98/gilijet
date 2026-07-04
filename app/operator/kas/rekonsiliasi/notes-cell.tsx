"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveReconciliationNote } from "./actions";

export function NotesCell({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tambah catatan…"
        className="w-44 rounded border border-mekari-neutral-200 px-2 py-1 text-xs focus:border-mekari-primary focus:outline-none"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dirty || pending}
        className="h-7 px-2 text-xs"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await saveReconciliationNote({ sessionId, notes: value });
              setSaved(value);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Gagal menyimpan");
            }
          })
        }
      >
        {pending ? "…" : "Simpan"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
