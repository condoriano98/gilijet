"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLocalDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type InboxMessage = {
  id: string;
  receivedAt: string;
  kind: "text" | "document" | "template";
  to: string;
  body?: string;
  filename?: string;
  sizeKb?: number;
  templateName?: string;
  params?: Record<string, string>;
};

const KIND_LABEL: Record<InboxMessage["kind"], string> = {
  text: "Text",
  document: "Document",
  template: "Template",
};

export function WhatsappInboxViewer() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp-inbox", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: InboxMessage[] };
      setMessages(data.messages);
    } catch {
      // transient poll failure — next tick retries
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  async function clear() {
    setClearing(true);
    try {
      await fetch("/api/admin/whatsapp-inbox", { method: "DELETE" });
      await refresh();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Local WhatsApp inbox
          </h1>
          <p className="text-sm text-slate-500">
            Messages captured by the local fallback when WATI keys are absent.
            With WATI configured, this inbox stays empty.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={clear}
          disabled={clearing || messages.length === 0}
        >
          {clearing ? "Clearing…" : `Clear (${messages.length})`}
        </Button>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          No messages yet. Book a trip locally and the payment / boarding-pass
          messages will appear here.
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{KIND_LABEL[m.kind]}</Badge>
                  <span className="font-mono text-sm text-slate-700">
                    {m.to}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatLocalDateTime(m.receivedAt)}
                </span>
              </div>

              {m.kind === "template" ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium text-slate-800">
                    {m.templateName}
                  </p>
                  {m.params && (
                    <ul className="space-y-0.5 text-slate-600">
                      {Object.entries(m.params).map(([k, v]) => (
                        <li key={k}>
                          <span className="text-slate-400">{k}:</span> {v}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {m.kind === "document"
                    ? `[${m.filename} · ${m.sizeKb} KB]\n${m.body ?? ""}`
                    : m.body}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
