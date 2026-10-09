import { getCurrentUser } from "@/lib/auth/dal";
import { getMyLeaveRequests, getPendingLeaveRequests } from "@/lib/actions/leave";
import { getMyShiftRequests, getPendingShiftRequests } from "@/lib/actions/shift-requests";
import { LeaveRequestForm } from "./leave-request-form";
import { ShiftRequestForm } from "./shift-request-form";
import { ReviewButtons } from "@/components/review-buttons";

export const dynamic = "force-dynamic";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  VACATION: "Vacation Leave",
  SICK: "Sick Leave",
  EMERGENCY: "Emergency Leave",
  OFFICIAL_BUSINESS: "Official Business",
  OTHER: "Other",
};

const SHIFT_TYPE_LABELS: Record<string, string> = {
  OVERTIME: "Overtime",
  SWAP: "Shift Swap",
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
}

export default async function LeavePage() {
  const user = await getCurrentUser();
  const [myLeave, pendingLeave, myShift, pendingShift] = await Promise.all([
    getMyLeaveRequests(),
    getPendingLeaveRequests(),
    getMyShiftRequests(),
    getPendingShiftRequests(),
  ]);
  const canReview = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Leave &amp; requests</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        File a leave/OB request or an overtime/shift-swap request, and see the status of your own.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Leave request</h2>
      <LeaveRequestForm />

      <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">My leave requests</h3>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Dates</th>
            <th className="py-2 pr-4">Reason</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {myLeave.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{LEAVE_TYPE_LABELS[r.type]}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {fmt(r.startDate)} – {fmt(r.endDate)}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.reason}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.status}</td>
            </tr>
          ))}
          {myLeave.length === 0 && (
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
          <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pending leave approvals</h3>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Dates</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pendingLeave.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{r.user.name}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{LEAVE_TYPE_LABELS[r.type]}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {fmt(r.startDate)} – {fmt(r.endDate)}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.reason}</td>
                  <td className="py-2 pr-4">
                    <ReviewButtons requestId={r.id} kind="leave" />
                  </td>
                </tr>
              ))}
              {pendingLeave.length === 0 && (
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

      <hr className="mt-10 border-zinc-200 dark:border-zinc-800" />

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Overtime / shift swap request</h2>
      <ShiftRequestForm />

      <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">My overtime/swap requests</h3>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Details</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {myShift.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{SHIFT_TYPE_LABELS[r.type]}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.targetDate)}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.details}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.status}</td>
            </tr>
          ))}
          {myShift.length === 0 && (
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
          <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Pending overtime/swap approvals
          </h3>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Details</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pendingShift.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{r.user.name}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{SHIFT_TYPE_LABELS[r.type]}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.targetDate)}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.details}</td>
                  <td className="py-2 pr-4">
                    <ReviewButtons requestId={r.id} kind="shift" />
                  </td>
                </tr>
              ))}
              {pendingShift.length === 0 && (
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
