"use client";

import { useActionState } from "react";
import { setupSuperAdmin, type FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupSuperAdmin, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          Your name
        </label>
        <input id="name" name="name" required className={`mt-1 ${inputClass}`} />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" required className={`mt-1 ${inputClass}`} />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className={`mt-1 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">At least 8 characters.</p>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Creating..." : "Create admin account & continue"}
      </button>
    </form>
  );
}
