import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { summarizeForPayroll } from "@/lib/attendance/payroll-summary";

// Route Handlers don't inherit the (app) layout's rendering, so the auth
// check has to happen inside the handler itself — same principle applied
// throughout this codebase (Lista's documents export route did the same).
export async function GET(_req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const { periodId } = await params;
  const period = await prisma.payPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    return new NextResponse("Pay period not found.", { status: 404 });
  }

  const punches = await prisma.punch.findMany({
    where: { timestamp: { gte: period.startDate, lte: period.endDate } },
    include: { user: { select: { name: true } } },
    orderBy: { timestamp: "asc" },
  });

  const summaries = summarizeForPayroll(
    punches.map((p) => ({
      userId: p.userId,
      userName: p.user.name,
      type: p.type,
      timestamp: p.timestamp,
      lateMinutes: p.lateMinutes,
      undertimeMinutes: p.undertimeMinutes,
      overtimeMinutes: p.overtimeMinutes,
      nightDiffMinutes: p.nightDiffMinutes,
      breakMinutes: p.breakMinutes,
      manualEntry: p.manualEntry,
    })),
  );

  const header = [
    "Employee",
    "Shifts Completed",
    "Regular Hours",
    "Overtime Hours",
    "Night Differential Hours",
    "Late Minutes",
    "Undertime Minutes",
    "Manual Entries (Approved, Non-Scan)",
  ];
  const rows = summaries.map((s) => [
    s.userName,
    String(s.shiftsCompleted),
    (s.regularMinutes / 60).toFixed(2),
    (s.overtimeMinutes / 60).toFixed(2),
    (s.nightDiffMinutes / 60).toFixed(2),
    String(s.lateMinutes),
    String(s.undertimeMinutes),
    String(s.manualEntryCount),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

  const startLabel = period.startDate.toISOString().slice(0, 10);
  const endLabel = period.endDate.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="presentia-payroll-${startLabel}_to_${endLabel}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
