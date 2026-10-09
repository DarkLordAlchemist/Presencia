"use client";

import { useActionState } from "react";
import { requestShiftChange, type FormState } from "@/lib/actions/shift-requests";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function ShiftRequestForm() {
  const [state, formAction, pending] = useActionState(requestShiftChange, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="shiftType" className={labelClass}>
          Type
        </label>
        <select id="shiftType" name="type" defaultValue="OVERTIME" className={inputClass}>
          <option value="OVERTIME">Overtime request</option>
          <option value="SWAP">Shift swap request</option>
        </select>
      </div>

      <div>
        <label htmlFor="targetDate" className={labelClass}>
          Date
        </label>
        <input id="targetDate" name="targetDate" type="date" required className={inputClass} />
      </div>

      <div>
        <label htmlFor="details" className={labelClass}>
          Details
        </label>
        <textarea
          id="details"
          name="details"
          required
          rows={2}
          placeholder="e.g. 2 extra hours to finish month-end closing, or swap Tuesday shift with Juan"
          className={inputClass}
        />
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
