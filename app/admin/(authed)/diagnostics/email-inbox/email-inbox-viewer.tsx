"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLocalDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type InboxMessage = {
  id: string;
  receivedAt: string;
  kind:
    | "booking-confirmation"
    | "payment-received"
    | "password-reset"
    | "departure-reminder"
    | "cancellation"
    | "refund-processed";
  to: string;
  subject: string;
  html: string;
  attachments?: string[];
};

export function EmailInboxViewer() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-inbox", { cache: "no-store" });
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
      await fetch("/api/admin/email-inbox", { method: "DELETE" });
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
            Local email inbox
          </h1>
          <p className="text-sm text-slate-500">
            Emails captured by the local fallback when Resend keys are absent.
            With Resend configured, this inbox stays empty.
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
          emails will appear here.
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
                  <Badge variant="outline">{m.kind}</Badge>
                  <span className="text-sm text-slate-700">{m.to}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatLocalDateTime(m.receivedAt)}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {m.subject}
              </p>
              {m.attachments?.length ? (
                <p className="mt-1 text-xs text-slate-400">
                  Attachments: {m.attachments.join(", ")}
                </p>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-sky-700">
                  Preview HTML
                </summary>
                <iframe
                  title={m.subject}
                  srcDoc={m.html}
                  sandbox=""
                  className="mt-2 h-96 w-full rounded-md border border-slate-200 bg-white"
                />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
