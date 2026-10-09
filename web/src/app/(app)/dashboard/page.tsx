import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { manilaDayBounds } from "@/lib/attendance/compute";
import { computeDayProgress, formatMinutes } from "@/lib/attendance/day-progress";

export const dynamic = "force-dynamic";

const ROLE_BLURBS: Record<string, string> = {
  SUPER_ADMIN: "Manage users, roles, and biometric match/liveness settings.",
  HR_ADMIN: "Enroll employees for facial recognition and review attendance.",
  MANAGER: "Set schedules for your team and review their attendance.",
  EMPLOYEE: "View your own time-in/time-out log below.",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const now = new Date();
  const { start, end } = manilaDayBounds(now);
  const [punchesToday, config] = await Promise.all([
    prisma.punch.findMany({
      where: { userId: user.id, timestamp: { gte: start, lt: end } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.systemConfig.findFirst(),
  ]);

  const progress = computeDayProgress(punchesToday, now);
  const maxDailyBreakMinutes = config?.maxDailyBreakMinutes ?? 90;
  const overDailyBreak = progress.totalBreakMinutes > maxDailyBreakMinutes;
  const hasPunchedToday = punchesToday.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Welcome, {user.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {ROLE_BLURBS[user.role] ?? ""}
      </p>

      {hasPunchedToday && (
        <div className="mt-6 max-w-md rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Today</h2>
          <div className="mt-3 flex gap-6">
            <div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {formatMinutes(progress.workedMinutes)}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Worked so far</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {progress.currentBreakMinutes != null
                  ? `${formatMinutes(progress.currentBreakMinutes)} (ongoing)`
                  : formatMinutes(progress.totalBreakMinutes)}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Break time used</div>
            </div>
          </div>
          {overDailyBreak && (
            <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
              Over today&apos;s break allowance ({formatMinutes(maxDailyBreakMinutes)}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
