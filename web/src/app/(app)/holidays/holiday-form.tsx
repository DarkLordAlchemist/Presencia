"use client";

import { useActionState } from "react";
import { createHoliday, type FormState } from "@/lib/actions/holidays";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function HolidayForm() {
  const [state, formAction, pending] = useActionState(createHoliday, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="date" className={labelClass}>
          Date
        </label>
        <input id="date" name="date" type="date" required className={inputClass} />
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input id="name" name="name" required placeholder="e.g. Independence Day" className={inputClass} />
      </div>

      <div>
        <label htmlFor="type" className={labelClass}>
          Type
        </label>
        <select id="type" name="type" defaultValue="REGULAR" className={inputClass}>
          <option value="REGULAR">Regular Holiday (200% if worked)</option>
          <option value="SPECIAL_NON_WORKING">Special Non-Working Day (130% if worked)</option>
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Adding..." : "Add holiday"}
      </button>
    </form>
  );
}
