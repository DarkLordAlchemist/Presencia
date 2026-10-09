import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/dal";
import { getVisiblePayslips, getPayslipEligibleUsers } from "@/lib/actions/payslips";
import { listPayPeriods } from "@/lib/actions/pay-periods";
import { GeneratePayslipForm } from "./generate-payslip-form";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
}

function netPay(lineItems: { category: string; amount: number }[]): number {
  return lineItems.reduce((sum, i) => sum + (i.category === "EARNING" ? i.amount : -i.amount), 0);
}

export default async function PayslipsPage() {
  const user = await getCurrentUser();
  const canManage = ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);

  const [payslips, payPeriods, eligibleUsers] = await Promise.all([
    getVisiblePayslips(),
    canManage ? listPayPeriods() : Promise.resolve([]),
    canManage ? getPayslipEligibleUsers() : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payslips</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        {canManage
          ? "Generate a payslip for any pay period — earnings and deductions are auto-suggested from real attendance and the Philippine Labor Code premium-pay rules, then you can edit everything before issuing it."
          : "Your own payslips, and your direct reports' if you're a manager."}
      </p>

      {canManage && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Generate a payslip</h2>
          {payPeriods.length === 0 || eligibleUsers.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {payPeriods.length === 0
                ? "Create a pay period on the Payroll page first."
                : "No employees have monthly compensation on file yet — complete onboarding first."}
            </p>
          ) : (
            <GeneratePayslipForm
              payPeriods={payPeriods.map((p) => ({ id: p.id, label: `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}` }))}
              eligibleUsers={eligibleUsers}
            />
          )}
        </>
      )}

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Person</th>
            <th className="py-2 pr-4">Period</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Net Pay</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {payslips.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{p.user.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {fmtDate(p.payPeriod.startDate)} – {fmtDate(p.payPeriod.endDate)}
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    p.status === "ISSUED"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {p.status === "ISSUED" ? "Issued" : "Draft"}
                </span>
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">₱{netPay(p.lineItems).toFixed(2)}</td>
              <td className="py-2 pr-4">
                <Link
                  href={`/payslips/${p.id}`}
                  className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
          {payslips.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No payslips yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
