"use client";

import { useActionState } from "react";
import { createSchedule, type FormState } from "@/lib/actions/schedules";

const initialState: FormState = {};
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function ScheduleForm({ targets }: { targets: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createSchedule, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <span className={labelClass}>People (select one or more — a group all sharing this shift)</span>
        <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-zinc-300 p-2 dark:border-zinc-700">
          {targets.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" name="userIds" value={t.id} data-testid="userIds-checkbox" />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div>
          <label htmlFor="startTime" className={labelClass}>
            Start
          </label>
          <input id="startTime" name="startTime" type="time" required defaultValue="09:00" className={inputClass} />
        </div>
        <div>
          <label htmlFor="endTime" className={labelClass}>
            End
          </label>
          <input id="endTime" name="endTime" type="time" required defaultValue="18:00" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="shiftType" className={labelClass}>
          Shift type
        </label>
        <select id="shiftType" name="shiftType" defaultValue="FIXED" className={`w-full ${inputClass}`}>
          <option value="FIXED">Fixed</option>
          <option value="FLEXIBLE">Flexible</option>
          <option value="ROTATING">Rotating</option>
        </select>
      </div>

      <div className="flex gap-4">
        <div>
          <label htmlFor="validFrom" className={labelClass}>
            Valid from (optional)
          </label>
          <input id="validFrom" name="validFrom" type="date" className={inputClass} />
        </div>
        <div>
          <label htmlFor="validTo" className={labelClass}>
            Valid to (optional)
          </label>
          <input id="validTo" name="validTo" type="date" className={inputClass} />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Use these to schedule a temporary or rotating block instead of an indefinite shift.
          </p>
        </div>
      </div>

      <div>
        <span className={labelClass}>Days</span>
        <div className="mt-1 flex flex-wrap gap-3">
          {DAYS.map((day) => (
            <label key={day} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" name="days" value={day} defaultChecked={day !== "SAT" && day !== "SUN"} />
              {day}
            </label>
          ))}
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving..." : "Add schedule"}
      </button>
    </form>
  );
}
