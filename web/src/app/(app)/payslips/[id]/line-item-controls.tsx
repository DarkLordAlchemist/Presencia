"use client";

import { useState, useTransition } from "react";
import { addLineItem, removeLineItem, issuePayslip } from "@/lib/actions/payslips";
import type { PayComponentCategory } from "@/generated/prisma/client";

export function RemoveLineItemButton({ lineItemId }: { lineItemId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => removeLineItem(lineItemId))}
      className="text-xs font-medium text-red-700 underline hover:text-red-900 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      Remove
    </button>
  );
}

export function AddLineItemForm({ payslipId }: { payslipId: string }) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<PayComponentCategory>("EARNING");
  const [labelText, setLabelText] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <select value={category} onChange={(e) => setCategory(e.target.value as PayComponentCategory)} className={inputClass}>
        <option value="EARNING">Earning</option>
        <option value="DEDUCTION">Deduction</option>
      </select>
      <input
        value={labelText}
        onChange={(e) => setLabelText(e.target.value)}
        placeholder="Label, e.g. SSS Contribution"
        className={`${inputClass} min-w-[200px] flex-1`}
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        min={0}
        step="0.01"
        placeholder="Amount"
        className={`${inputClass} w-32`}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await addLineItem(payslipId, category, labelText, Number(amount));
            if (result.error) {
              setError(result.error);
            } else {
              setLabelText("");
              setAmount("");
            }
          });
        }}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Add
      </button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function IssuePayslipButton({ payslipId }: { payslipId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Issue this payslip? It becomes visible to the employee and can no longer be edited.")) return;
        startTransition(() => issuePayslip(payslipId));
      }}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Issuing..." : "Issue payslip"}
    </button>
  );
}
