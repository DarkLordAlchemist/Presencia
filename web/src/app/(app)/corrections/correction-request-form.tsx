"use client";

import { useActionState, useState } from "react";
import { requestCorrection, type FormState } from "@/lib/actions/corrections";
import type { Punch } from "@/generated/prisma/client";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const TYPE_LABELS: Record<string, string> = {
  TIME_IN: "Time In",
  BREAK_OUT: "Break Out",
  BREAK_IN: "Break In",
  TIME_OUT: "Time Out",
};

export function CorrectionRequestForm({ recentPunches }: { recentPunches: Punch[] }) {
  const [state, formAction, pending] = useActionState(requestCorrection, initialState);
  const [mode, setMode] = useState<"existing" | "missing">("missing");

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <span className={labelClass}>What happened?</span>
        <div className="mt-1 flex gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === "missing"}
              onChange={() => setMode("missing")}
            />
            I forgot to punch (missing entry)
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            An existing punch is wrong
          </label>
        </div>
      </div>

      {mode === "missing" ? (
        <div>
          <label htmlFor="requestedType" className={labelClass}>
            Which punch is missing?
          </label>
          <select id="requestedType" name="requestedType" defaultValue="TIME_OUT" className={inputClass}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label htmlFor="punchId" className={labelClass}>
            Which punch?
          </label>
          <select id="punchId" name="punchId" className={inputClass}>
            {recentPunches.map((p) => (
              <option key={p.id} value={p.id}>
                {TYPE_LABELS[p.type]} — {new Date(p.timestamp).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="requestedTime" className={labelClass}>
          Correct date/time
        </label>
        <input id="requestedTime" name="requestedTime" type="datetime-local" required className={inputClass} />
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
