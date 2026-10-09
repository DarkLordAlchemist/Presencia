"use client";

import { useActionState, useState } from "react";
import { createUser, type FormState } from "@/lib/actions/users";

const initialState: FormState = {};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewUserForm({ managers }: { managers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createUser, initialState);
  const [role, setRole] = useState("EMPLOYEE");

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
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
          Temporary password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="role" className={labelClass}>
          Role
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          <option value="SUPER_ADMIN">System Administrator</option>
          <option value="HR_ADMIN">HR & Payroll Administrator</option>
          <option value="MANAGER">Department Manager</option>
          <option value="EMPLOYEE">Regular Employee</option>
          <option value="KIOSK">Kiosk / Device</option>
        </select>
      </div>

      {role === "EMPLOYEE" && (
        <div>
          <label htmlFor="managerId" className={labelClass}>
            Manager (optional)
          </label>
          <select id="managerId" name="managerId" className={`mt-1 ${inputClass}`} defaultValue="">
            <option value="">No manager assigned</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Creating..." : "Create user"}
      </button>
    </form>
  );
}
