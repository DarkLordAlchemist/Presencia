"use client";

import { useActionState } from "react";
import { createPayPeriod, type FormState } from "@/lib/actions/pay-periods";

const initialState: FormState = {};
const inputClass =
  "mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function PayrollPeriodForm({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, formAction, pending] = useActionState(createPayPeriod, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="startDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Start date
        </label>
        <input id="startDate" name="startDate" type="date" required defaultValue={defaultStart} className={inputClass} />
      </div>
      <div>
        <label htmlFor="endDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          End date
        </label>
        <input id="endDate" name="endDate" type="date" required defaultValue={defaultEnd} className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Creating..." : "Create pay period"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
