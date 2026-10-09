import { requireRole } from "@/lib/auth/dal";
import { listHolidays } from "@/lib/actions/holidays";
import { HolidayForm } from "./holiday-form";
import { HolidayDeleteButton } from "./holiday-delete-button";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular Holiday",
  SPECIAL_NON_WORKING: "Special Non-Working Day",
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
}

export default async function HolidaysPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  const holidays = await listHolidays();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Holiday calendar</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        Philippine holidays are proclaimed year by year and this app has no reliable way to know
        them on its own — maintain the list here. It drives the rest-day/holiday premium pay
        rates on generated payslips (Regular Holiday and Special Non-Working Day are the two
        types that carry a different rate; an ordinary special working day needs no entry here).
      </p>

      <HolidayForm />

      <table className="mt-8 w-full max-w-lg text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {holidays.map((h) => (
            <tr key={h.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{fmt(h.date)}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{h.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{TYPE_LABELS[h.type]}</td>
              <td className="py-2 pr-4">
                <HolidayDeleteButton holidayId={h.id} />
              </td>
            </tr>
          ))}
          {holidays.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No holidays recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
