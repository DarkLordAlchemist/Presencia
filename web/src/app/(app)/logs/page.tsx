import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  TIME_IN: "Time In",
  BREAK_OUT: "Break Out",
  BREAK_IN: "Break In",
  TIME_OUT: "Time Out",
};

function flagsFor(p: {
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  overtimeMinutes: number | null;
  nightDiffMinutes: number | null;
  breakMinutes: number | null;
  overBreak: boolean | null;
}): string {
  const flags: string[] = [];
  if (p.lateMinutes) flags.push(`${p.lateMinutes}m late`);
  if (p.undertimeMinutes) flags.push(`${p.undertimeMinutes}m undertime`);
  if (p.overtimeMinutes) flags.push(`${p.overtimeMinutes}m OT`);
  if (p.nightDiffMinutes) flags.push(`${p.nightDiffMinutes}m night diff`);
  if (p.breakMinutes != null) flags.push(`${p.breakMinutes}m break${p.overBreak ? " (over limit)" : ""}`);
  return flags.join(", ") || "—";
}

export default async function LogsPage() {
  const user = await getCurrentUser();

  const punches = await prisma.punch.findMany({
    where: { userId: user.id },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My logs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Your own time-in/break/time-out history, most recent first.
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Timestamp</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Confidence</th>
            <th className="py-2 pr-4">Flags</th>
          </tr>
        </thead>
        <tbody>
          {punches.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                {TYPE_LABELS[p.type] ?? p.type}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {p.timestamp.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    p.manualEntry
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  }`}
                >
                  {p.manualEntry ? "Manual (Approved)" : "Face Scan"}
                </span>
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {(p.confidence * 100).toFixed(0)}%
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{flagsFor(p)}</td>
            </tr>
          ))}
          {punches.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No punches recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
