"use client";

import { useState, useTransition } from "react";
import { togglePayPeriodLock, sendPayPeriodToWebhook } from "@/lib/actions/pay-periods";

export function PayPeriodRowActions({ periodId, locked }: { periodId: string; locked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    const result = await sendPayPeriodToWebhook(periodId);
    setSending(false);
    setWebhookMessage(result.message);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => togglePayPeriodLock(periodId))}
        className={`rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
          locked ? "bg-zinc-500 hover:bg-zinc-600" : "bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-700"
        }`}
      >
        {locked ? "Unlock" : "Lock"}
      </button>
      <a
        href={`/payroll/${periodId}/export`}
        className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Export CSV
      </a>
      <button
        type="button"
        disabled={sending}
        onClick={handleSend}
        className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {sending ? "Sending..." : "Send to payroll webhook"}
      </button>
      {webhookMessage && <span className="text-xs text-zinc-500 dark:text-zinc-400">{webhookMessage}</span>}
    </div>
  );
}
