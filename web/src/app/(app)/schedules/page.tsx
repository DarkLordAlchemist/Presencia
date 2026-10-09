import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getScheduleTargets } from "@/lib/actions/schedules";
import { ScheduleForm } from "./schedule-form";
import { DeleteScheduleButton } from "./delete-schedule-button";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const currentUser = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");
  const targets = await getScheduleTargets();

  const schedules = await prisma.schedule.findMany({
    where:
      currentUser.role === "MANAGER"
        ? { user: { managerId: currentUser.id } }
        : undefined,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Schedules</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {currentUser.role === "MANAGER"
          ? "Assign start/end times for your direct reports."
          : "Assign start/end times for any employee."}
      </p>

      <ScheduleForm targets={targets} />

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Person</th>
            <th className="py-2 pr-4">Start</th>
            <th className="py-2 pr-4">End</th>
            <th className="py-2 pr-4">Days</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Valid</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{s.user.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{s.startTime}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{s.endTime}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{s.daysOfWeek}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {s.shiftType.charAt(0) + s.shiftType.slice(1).toLowerCase()}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {s.validFrom || s.validTo
                  ? `${s.validFrom ? s.validFrom.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "…"} – ${
                      s.validTo ? s.validTo.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "…"
                    }`
                  : "Indefinite"}
              </td>
              <td className="py-2 pr-4">
                <DeleteScheduleButton scheduleId={s.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
