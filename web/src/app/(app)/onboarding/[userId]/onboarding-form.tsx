"use client";

import { useActionState } from "react";
import { updateOnboarding, type FormState } from "@/lib/actions/onboarding";
import type { User } from "@/generated/prisma/client";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function dateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function OnboardingForm({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState(updateOnboarding, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <input type="hidden" name="userId" value={user.id} />

      <div>
        <label htmlFor="jobTitle" className={labelClass}>
          Job title / position
        </label>
        <input id="jobTitle" name="jobTitle" required defaultValue={user.jobTitle ?? ""} className={inputClass} />
      </div>

      <div>
        <label htmlFor="department" className={labelClass}>
          Department (optional)
        </label>
        <input id="department" name="department" defaultValue={user.department ?? ""} className={inputClass} />
      </div>

      <div>
        <label htmlFor="jobDescription" className={labelClass}>
          Job description (optional)
        </label>
        <textarea
          id="jobDescription"
          name="jobDescription"
          rows={3}
          defaultValue={user.jobDescription ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="dateHired" className={labelClass}>
          Date hired
        </label>
        <input
          id="dateHired"
          name="dateHired"
          type="date"
          required
          defaultValue={dateInputValue(user.dateHired)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="employmentStatus" className={labelClass}>
          Employment status
        </label>
        <select
          id="employmentStatus"
          name="employmentStatus"
          required
          defaultValue={user.employmentStatus ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Choose one
          </option>
          <option value="PROBATIONARY">Probationary</option>
          <option value="REGULAR">Regular</option>
          <option value="CONTRACTUAL">Contractual</option>
          <option value="PROJECT_BASED">Project-based</option>
        </select>
      </div>

      <div>
        <label htmlFor="monthlyCompensation" className={labelClass}>
          Monthly compensation, ₱ (optional)
        </label>
        <input
          id="monthlyCompensation"
          name="monthlyCompensation"
          type="number"
          min={0}
          step="0.01"
          defaultValue={user.monthlyCompensation ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="benefits" className={labelClass}>
          Benefits (optional)
        </label>
        <textarea
          id="benefits"
          name="benefits"
          rows={2}
          placeholder="e.g. HMO, 13th month pay, rice subsidy"
          defaultValue={user.benefits ?? ""}
          className={inputClass}
        />
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
