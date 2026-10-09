import { requireRole } from "@/lib/auth/dal";
import { listPayPeriods } from "@/lib/actions/pay-periods";
import { semiMonthlyCutoffFor } from "@/lib/attendance/pay-period-math";
import { PayrollPeriodForm } from "./payroll-period-form";
import { PayPeriodRowActions } from "./pay-period-row-actions";

export const dynamic = "force-dynamic";

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
}

export default async function PayrollPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const periods = await listPayPeriods();
  const { startDate, endDate } = semiMonthlyCutoffFor(new Date());

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payroll &amp; cut-offs</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        Create a pay period, lock it once payroll processing starts (locking blocks any
        further timesheet corrections landing inside it), and export the computed hours —
        or push them straight to a configured payroll/HRIS webhook.
      </p>

      <PayrollPeriodForm defaultStart={toDateInput(startDate)} defaultEnd={toDateInput(endDate)} />

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Period</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                {fmt(p.startDate)} – {fmt(p.endDate)}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{p.locked ? "Locked" : "Open"}</td>
              <td className="py-2 pr-4">
                <PayPeriodRowActions periodId={p.id} locked={p.locked} />
              </td>
            </tr>
          ))}
          {periods.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No pay periods yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
