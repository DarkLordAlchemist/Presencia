import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getPayslipDetail } from "@/lib/actions/payslips";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";
import { RemoveLineItemButton, AddLineItemForm, IssuePayslipButton } from "./line-item-controls";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
}

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [currentUser, payslip] = await Promise.all([getCurrentUser(), getPayslipDetail(id)]);
  if (!payslip) notFound();

  const canManage = ["SUPER_ADMIN", "HR_ADMIN"].includes(currentUser.role);
  const isDraft = payslip.status === "DRAFT";

  const config = await prisma.systemConfig.findFirst();
  const companyName = config?.companyName?.trim() || "the Company";

  const earnings = payslip.lineItems.filter((i) => i.category === "EARNING");
  const deductions = payslip.lineItems.filter((i) => i.category === "DEDUCTION");
  const totalEarnings = earnings.reduce((s, i) => s + i.amount, 0);
  const totalDeductions = deductions.reduce((s, i) => s + i.amount, 0);
  const netPay = totalEarnings - totalDeductions;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        {isDraft ? (
          <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Draft — not yet visible to the employee
          </span>
        ) : (
          <span />
        )}
        {!isDraft && <PrintButton />}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-10 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 print:border-0 print:p-12 print:text-black">
        <h1 className="text-center text-xl font-bold uppercase tracking-wide">Payslip</h1>
        <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400 print:text-black">{companyName}</p>
        <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400 print:text-black">
          Pay period: {fmtDate(payslip.payPeriod.startDate)} – {fmtDate(payslip.payPeriod.endDate)}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black">Employee</span>
            <p className="font-medium">{payslip.user.name}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black">Position</span>
            <p className="font-medium">{payslip.user.jobTitle ?? "—"}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black">Department</span>
            <p className="font-medium">{payslip.user.department ?? "—"}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black">Hourly rate</span>
            <p className="font-medium">{peso(payslip.hourlyRateSnapshot)}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <h2 className="border-b border-zinc-300 pb-1 text-sm font-semibold uppercase text-zinc-700 dark:text-zinc-300 dark:border-zinc-700 print:text-black">
              Earnings
            </h2>
            {earnings.map((item) => (
              <div key={item.id} className="mt-2 flex items-center justify-between text-sm">
                <span>{item.label}</span>
                <span className="flex items-center gap-2">
                  {peso(item.amount)}
                  {isDraft && canManage && <RemoveLineItemButton lineItemId={item.id} />}
                </span>
              </div>
            ))}
            {earnings.length === 0 && <p className="mt-2 text-sm text-zinc-400">No earnings yet.</p>}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2 text-sm font-semibold dark:border-zinc-800">
              <span>Total Earnings</span>
              <span>{peso(totalEarnings)}</span>
            </div>
          </div>

          <div>
            <h2 className="border-b border-zinc-300 pb-1 text-sm font-semibold uppercase text-zinc-700 dark:text-zinc-300 dark:border-zinc-700 print:text-black">
              Deductions
            </h2>
            {deductions.map((item) => (
              <div key={item.id} className="mt-2 flex items-center justify-between text-sm">
                <span>{item.label}</span>
                <span className="flex items-center gap-2">
                  {peso(item.amount)}
                  {isDraft && canManage && <RemoveLineItemButton lineItemId={item.id} />}
                </span>
              </div>
            ))}
            {deductions.length === 0 && <p className="mt-2 text-sm text-zinc-400">No deductions yet.</p>}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2 text-sm font-semibold dark:border-zinc-800">
              <span>Total Deductions</span>
              <span>{peso(totalDeductions)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t-2 border-zinc-900 pt-3 text-lg font-bold dark:border-zinc-50 print:border-black">
          <span>Net Pay</span>
          <span>{peso(netPay)}</span>
        </div>

        {!isDraft && (
          <p className="mt-6 text-xs text-zinc-400">
            Issued {payslip.issuedAt ? fmtDate(payslip.issuedAt) : ""} by {payslip.issuedBy?.name ?? "—"}.
          </p>
        )}
      </div>

      {isDraft && canManage && (
        <div className="mt-6 print:hidden">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add a line item</h3>
          <AddLineItemForm payslipId={payslip.id} />
          <div className="mt-6">
            <IssuePayslipButton payslipId={payslip.id} />
          </div>
        </div>
      )}
    </div>
  );
}
