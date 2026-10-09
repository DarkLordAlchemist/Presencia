"use client";

import { useActionState } from "react";
import { requestCertificate, type FormState } from "@/lib/actions/certificates";
import { PURPOSE_LABELS } from "@/lib/certificates/templates";

const initialState: FormState = {};
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function CertificateRequestForm({
  eligibleUsers,
}: {
  eligibleUsers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(requestCertificate, initialState);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      {eligibleUsers.length > 0 && (
        <div>
          <label htmlFor="userId" className={labelClass}>
            Requesting for
          </label>
          <select id="userId" name="userId" className={inputClass}>
            <option value="">Myself</option>
            {eligibleUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="purpose" className={labelClass}>
          Purpose
        </label>
        <select id="purpose" name="purpose" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(PURPOSE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Additional detail (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="e.g. the specific agency or bank this is for"
          className={inputClass}
        />
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600 dark:text-green-400">Request submitted.</p>}

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
