import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

export default async function AuditPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const logs = await prisma.auditLog.findMany({
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Audit log</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Every HR/manager edit — leave/overtime decisions, timesheet corrections, pay-period
        locks — timestamped with who did it and why. Most recent first.
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">When</th>
            <th className="py-2 pr-4">Actor</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Target</th>
            <th className="py-2 pr-4">Reason</th>
            <th className="py-2 pr-4">Before → After</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
              <td className="py-2 pr-4 whitespace-nowrap text-zinc-700 dark:text-zinc-300">{fmt(l.createdAt)}</td>
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{l.actor.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{l.action}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {l.targetType} <span className="text-xs text-zinc-500">{l.targetId.slice(0, 8)}</span>
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{l.reason ?? "—"}</td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {l.beforeJson ?? "—"} → {l.afterJson ?? "—"}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                Nothing logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
