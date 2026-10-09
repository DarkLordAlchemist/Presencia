"use client";

import { useTransition } from "react";
import { deleteHoliday } from "@/lib/actions/holidays";

export function HolidayDeleteButton({ holidayId }: { holidayId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => deleteHoliday(holidayId))}
      className="text-xs font-medium text-red-700 underline hover:text-red-900 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      Remove
    </button>
  );
}
