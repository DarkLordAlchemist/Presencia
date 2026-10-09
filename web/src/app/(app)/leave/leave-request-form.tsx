"use client";

import { useActionState } from "react";
import { requestLeave, type FormState } from "@/lib/actions/leave";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function LeaveRequestForm() {
  const [state, formAction, pending] = useActionState(requestLeave, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="type" className={labelClass}>
          Type
        </label>
        <select id="type" name="type" defaultValue="VACATION" className={inputClass}>
          <option value="VACATION">Vacation Leave (VL)</option>
          <option value="SICK">Sick Leave (SL)</option>
          <option value="EMERGENCY">Emergency Leave</option>
          <option value="OFFICIAL_BUSINESS">Official Business (OB)</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div className="flex gap-4">
        <div>
          <label htmlFor="startDate" className={labelClass}>
            Start date
          </label>
          <input id="startDate" name="startDate" type="date" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="endDate" className={labelClass}>
            End date
          </label>
          <input id="endDate" name="endDate" type="date" required className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="reason" className={labelClass}>
          Reason
        </label>
        <textarea id="reason" name="reason" required rows={2} className={inputClass} />
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}
