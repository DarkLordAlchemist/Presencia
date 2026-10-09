"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePayslip } from "@/lib/actions/payslips";

const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function GeneratePayslipForm({
  payPeriods,
  eligibleUsers,
}: {
  payPeriods: { id: string; label: string }[];
  eligibleUsers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payPeriodId, setPayPeriodId] = useState(payPeriods[0]?.id ?? "");
  const [userId, setUserId] = useState(eligibleUsers[0]?.id ?? "");

  return (
    <div className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="payPeriodId" className={labelClass}>
          Pay period
        </label>
        <select
          id="payPeriodId"
          value={payPeriodId}
          onChange={(e) => setPayPeriodId(e.target.value)}
          className={inputClass}
        >
          {payPeriods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="userId" className={labelClass}>
          Employee
        </label>
        <select id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} className={inputClass}>
          {eligibleUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        disabled={pending || !payPeriodId || !userId}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await generatePayslip(payPeriodId, userId);
            if (result.error) {
              setError(result.error);
            } else if (result.payslipId) {
              router.push(`/payslips/${result.payslipId}`);
            }
          });
        }}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Generating..." : "Generate payslip"}
      </button>
    </div>
  );
}
