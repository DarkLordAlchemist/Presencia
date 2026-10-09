import { getMyCorrectionRequests, getPendingCorrectionRequests, getMyRecentPunches } from "@/lib/actions/corrections";
import { getCurrentUser } from "@/lib/auth/dal";
import { CorrectionRequestForm } from "./correction-request-form";
import { ReviewButtons } from "@/components/review-buttons";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  TIME_IN: "Time In",
  BREAK_OUT: "Break Out",
  BREAK_IN: "Break In",
  TIME_OUT: "Time Out",
};

function fmt(d: Date) {
  return d.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

export default async function CorrectionsPage() {
  const user = await getCurrentUser();
  const [mine, pending, recentPunches] = await Promise.all([
    getMyCorrectionRequests(),
    getPendingCorrectionRequests(),
    getMyRecentPunches(),
  ]);
  const canReview = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Timesheet corrections</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        Missed a scan, or a punch looks wrong? File a correction request here — a manager or
        HR admin has to approve it before your record actually changes, and every approval is
        written to the audit log. Requests inside a locked pay period can&apos;t be approved.
      </p>

      <CorrectionRequestForm recentPunches={recentPunches} />

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-50">My requests</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Punch</th>
            <th className="py-2 pr-4">Requested time</th>
            <th className="py-2 pr-4">Reason</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {mine.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                {r.punch ? `Edit: ${TYPE_LABELS[r.punch.type]}` : `Add: ${TYPE_LABELS[r.requestedType ?? ""]}`}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.requestedTime)}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.reason}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.status}</td>
            </tr>
          ))}
          {mine.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No requests filed yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canReview && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pending approvals</h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Punch</th>
                <th className="py-2 pr-4">Requested time</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{r.user.name}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {r.punch ? `Edit: ${TYPE_LABELS[r.punch.type]}` : `Add: ${TYPE_LABELS[r.requestedType ?? ""]}`}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.requestedTime)}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.reason}</td>
                  <td className="py-2 pr-4">
                    <ReviewButtons requestId={r.id} kind="correction" />
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    Nothing pending.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
