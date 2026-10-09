"use client";

import { useState, useTransition } from "react";
import { setUserActive } from "@/lib/actions/users";

export function UserActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (active && !confirm("Deactivate this user? They'll lose login and kiosk clock-in access immediately.")) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await setUserActive(userId, !active);
            if (result.error) setError(result.error);
          });
        }}
        className={
          active
            ? "rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            : "rounded-md border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
        }
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
