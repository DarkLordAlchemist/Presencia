"use client";

import { useTransition } from "react";
import { deleteSchedule } from "@/lib/actions/schedules";

export function DeleteScheduleButton({ scheduleId }: { scheduleId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this schedule?")) {
          startTransition(() => deleteSchedule(scheduleId));
        }
      }}
      className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      Delete
    </button>
  );
}
