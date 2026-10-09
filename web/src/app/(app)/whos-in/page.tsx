import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { manilaDayBounds } from "@/lib/attendance/compute";
import { findScheduleFor } from "@/lib/attendance/flags";
import { isOnApprovedLeaveToday } from "@/lib/actions/leave";
import { determineAttendanceStatus, type AttendanceStatus } from "@/lib/attendance/whos-in";
import { computeDayProgress, formatMinutes } from "@/lib/attendance/day-progress";
import { LiveWorkedMinutes, LiveBreakCell } from "./live-cells";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_LEAVE: "On Leave",
  ON_SITE: "On Site",
  ON_BREAK: "On Break",
  DONE_FOR_DAY: "Done for the Day",
  LATE: "Late",
  ABSENT: "Absent",
  NOT_YET_DUE: "Not Yet Due",
  REST_DAY: "Rest Day",
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  ON_LEAVE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ON_SITE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ON_BREAK: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  DONE_FOR_DAY: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  LATE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  NOT_YET_DUE: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  REST_DAY: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function WhosInPage() {
  const currentUser = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  const roster = await prisma.user.findMany({
    where: {
      role: { not: "KIOSK" },
      active: true,
      ...(currentUser.role === "MANAGER" ? { managerId: currentUser.id } : {}),
    },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const { start, end } = manilaDayBounds(now);
  const config = await prisma.systemConfig.findFirst();
  const gracePeriodMinutes = config?.gracePeriodMinutes ?? 5;
  const maxDailyBreakMinutes = config?.maxDailyBreakMinutes ?? 90;

  const rows = await Promise.all(
    roster.map(async (user) => {
      const [schedule, punchesToday, onLeave] = await Promise.all([
        findScheduleFor(user.id, now),
        prisma.punch.findMany({
          where: { userId: user.id, timestamp: { gte: start, lt: end } },
          orderBy: { timestamp: "asc" },
        }),
        isOnApprovedLeaveToday(user.id, now),
      ]);

      const lastPunchToday = punchesToday.at(-1) ?? null;

      const status = determineAttendanceStatus({
        onApprovedLeaveToday: onLeave,
        lastPunchTypeToday: lastPunchToday?.type ?? null,
        schedule: schedule ? { startTime: schedule.startTime, endTime: schedule.endTime } : null,
        now,
        gracePeriodMinutes,
      });

      const progress = computeDayProgress(punchesToday, now);
      const overDailyBreak = progress.totalBreakMinutes > maxDailyBreakMinutes;

      return { user, status, lastPunchAt: lastPunchToday?.timestamp ?? null, progress, overDailyBreak };
    }),
  );

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<AttendanceStatus, number>>,
  );

  const summaryTiles: AttendanceStatus[] = ["ON_SITE", "ON_BREAK", "LATE", "ON_LEAVE", "ABSENT"];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Who&apos;s In</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Live headcount for today, computed from each person&apos;s most recent punch, schedule, and leave status.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {summaryTiles.map((s) => (
          <div key={s} className="rounded-lg border border-zinc-200 p-4 text-center dark:border-zinc-800">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{counts[s] ?? 0}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{STATUS_LABELS[s]}</div>
          </div>
        ))}
      </div>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Person</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Last activity today</th>
            <th className="py-2 pr-4">Worked today</th>
            <th className="py-2 pr-4">Break today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ user, status, lastPunchAt, progress, overDailyBreak }) => (
            <tr key={user.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{user.name}</td>
              <td className="py-2 pr-4">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {lastPunchAt ? lastPunchAt.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" }) : "—"}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {status === "ON_LEAVE" || status === "REST_DAY" || status === "NOT_YET_DUE" || status === "ABSENT" ? (
                  "—"
                ) : status === "ON_SITE" ? (
                  <LiveWorkedMinutes baseMinutes={progress.workedMinutes} asOfMs={now.getTime()} />
                ) : (
                  formatMinutes(progress.workedMinutes)
                )}
              </td>
              <td className="py-2 pr-4">
                {progress.currentBreakMinutes != null ? (
                  <LiveBreakCell
                    completedBreakMinutes={progress.totalBreakMinutes - progress.currentBreakMinutes}
                    currentBreakBaseMinutes={progress.currentBreakMinutes}
                    asOfMs={now.getTime()}
                    maxDailyBreakMinutes={maxDailyBreakMinutes}
                  />
                ) : progress.totalBreakMinutes > 0 ? (
                  <>
                    <span className="text-zinc-700 dark:text-zinc-300">{formatMinutes(progress.totalBreakMinutes)} total</span>
                    {overDailyBreak && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                        Over break
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-500">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
