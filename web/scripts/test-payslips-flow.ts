// Self-contained regression test for the payslip workflow: generate (auto-
// suggested from real punches + holidays + Labor Code rates) -> HR edits
// line items -> issue -> role-based visibility (SUPER_ADMIN/HR_ADMIN see
// everyone's; a MANAGER sees their own + direct reports'; an EMPLOYEE sees
// only their own — and never a DRAFT). Punches are seeded directly via
// Prisma rather than through the kiosk, since the kiosk/face-engine path is
// already covered by other tests and isn't what this one is checking.
// Run with: npm run test:payslips

import { TEST_DATABASE_URL } from "./test-env";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";
import { killPort, waitForServer, startDevServer, makeReporter, ensureTestDatabaseMigrated } from "./test-utils";

const WEB_PORT = 3600;
const BASE = `http://localhost:${WEB_PORT}`;

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Payslip Test Admin", email: "payslip-admin@test.presentia" };
const HR = { name: "Payslip Test HR", email: "payslip-hr@test.presentia" };
const MANAGER = { name: "Payslip Test Manager", email: "payslip-manager@test.presentia" };
const EMPLOYEE = { name: "Payslip Test Employee", email: "payslip-employee@test.presentia" };
const OUTSIDER = { name: "Payslip Test Outsider", email: "payslip-outsider@test.presentia" };

const { report, summarize } = makeReporter();

// A fixed pay period safely in the past relative to any real run, so the
// dates never collide with "today"-based logic elsewhere in the app.
const PERIOD_START = "2026-06-01";
const PERIOD_END = "2026-06-15";
const HOLIDAY_DATE = "2026-06-12"; // a Friday inside the period, declared a Regular Holiday
const ORDINARY_OT_DATE = "2026-06-08"; // a Monday inside the period, worked with 2h OT

function manilaInstant(dateStr: string, hhmm: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 8, min));
}

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presentia" } }, select: { id: true } })
  ).map((u) => u.id);
  if (ids.length > 0) {
    await prisma.payslip.deleteMany({ where: { userId: { in: ids } } });
    await prisma.punch.deleteMany({ where: { userId: { in: ids } } });
    await prisma.schedule.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { managerId: null } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.holiday.deleteMany({ where: { date: manilaInstant(HOLIDAY_DATE, "00:00") } });
  await prisma.payPeriod.deleteMany({
    where: { startDate: manilaInstant(PERIOD_START, "00:00"), endDate: manilaInstant(PERIOD_END, "00:00") },
  });
  await prisma.systemConfig.deleteMany({});
}

async function login(page: import("playwright").Page, email: string) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
}

async function logout(page: import("playwright").Page) {
  await page.click('button:has-text("Log out")');
  await page.waitForURL(/\/login$/, { timeout: 10000 });
}

async function createUser(
  page: import("playwright").Page,
  user: { name: string; email: string },
  role: string,
  managerLabel?: string,
) {
  await page.goto(BASE + "/users/new");
  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.selectOption("#role", role);
  if (managerLabel) await page.selectOption("#managerId", { label: managerLabel });
  await page.click('button:has-text("Create user")');
  await page.waitForURL(/\/users$/, { timeout: 10000 });
}

async function main() {
  killPort(WEB_PORT);
  ensureTestDatabaseMigrated(TEST_DATABASE_URL);
  await cleanupTestData();

  const server = startDevServer(WEB_PORT);
  let serverOutput = "";
  server.stdout?.on("data", (c) => (serverOutput += c));
  server.stderr?.on("data", (c) => (serverOutput += c));

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await waitForServer(BASE, 30000);
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    // 1. Setup + config: 22 working days/month, company name.
    await page.goto(BASE + "/");
    await page.waitForURL(/\/setup$/, { timeout: 10000 });
    await page.fill('input[name="name"]', ADMIN.name);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Create admin account")');
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });

    await page.goto(BASE + "/config");
    await page.fill("#workingDaysPerMonth", "22");
    await page.fill("#companyName", "Test Payslip Corp");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    report("SUPER_ADMIN sets the working-days divisor to 22", true);

    await createUser(page, HR, "HR_ADMIN");
    await createUser(page, MANAGER, "MANAGER");
    await createUser(page, EMPLOYEE, "EMPLOYEE", MANAGER.name);
    await createUser(page, OUTSIDER, "EMPLOYEE");
    report("SUPER_ADMIN creates HR, a manager, a direct report, and an unrelated employee", true);

    // 2. HR onboards the employee: 22,000/month -> 1,000/day -> 125/hour.
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/onboarding");
    const employeeHref = await page.locator("tr", { hasText: EMPLOYEE.name }).locator("a").getAttribute("href");
    const employeeId = employeeHref!.split("/").pop()!;
    await page.goto(BASE + `/onboarding/${employeeId}`);
    await page.fill("#jobTitle", "Staff Accountant");
    await page.fill("#department", "Finance");
    await page.fill("#dateHired", "2024-01-01");
    await page.selectOption("#employmentStatus", "REGULAR");
    await page.fill("#monthlyCompensation", "22000");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    report("HR onboards the employee with a monthly compensation", true);

    // 3. HR declares a Regular Holiday inside the period.
    await page.goto(BASE + "/holidays");
    await page.fill("#date", HOLIDAY_DATE);
    await page.fill("#name", "Test Independence Day");
    await page.selectOption("#type", "REGULAR");
    await page.click('button:has-text("Add holiday")');
    await page.waitForSelector("text=Test Independence Day", { timeout: 10000 });
    report("HR adds a Regular Holiday to the calendar", true);

    // 4. Seed a schedule (every day counts as ordinary — this test isn't
    // re-proving rest-day math, that's covered by the pure unit tests) and
    // real attendance directly, then create the pay period.
    await prisma.schedule.create({
      data: {
        userId: employeeId,
        startTime: "09:00",
        endTime: "17:00",
        daysOfWeek: "MON,TUE,WED,THU,FRI,SAT,SUN",
        shiftType: "FIXED",
      },
    });
    const punchDefaults = { confidence: 1.0, livenessPassed: true, manualEntry: true };
    // Ordinary day with 2 hours of overtime (10h shift).
    await prisma.punch.create({
      data: { userId: employeeId, type: "TIME_IN", timestamp: manilaInstant(ORDINARY_OT_DATE, "09:00"), ...punchDefaults },
    });
    await prisma.punch.create({
      data: { userId: employeeId, type: "TIME_OUT", timestamp: manilaInstant(ORDINARY_OT_DATE, "19:00"), ...punchDefaults },
    });
    // Worked the declared regular holiday, plain 8h.
    await prisma.punch.create({
      data: { userId: employeeId, type: "TIME_IN", timestamp: manilaInstant(HOLIDAY_DATE, "09:00"), ...punchDefaults },
    });
    await prisma.punch.create({
      data: { userId: employeeId, type: "TIME_OUT", timestamp: manilaInstant(HOLIDAY_DATE, "17:00"), ...punchDefaults },
    });

    await page.goto(BASE + "/payroll");
    await page.fill("#startDate", PERIOD_START);
    await page.fill("#endDate", PERIOD_END);
    await page.click('button:has-text("Create pay period")');
    await page.waitForSelector("text=Open", { timeout: 10000 });
    report("HR creates the pay period covering the seeded attendance", true);

    // 5. Generate the payslip and check the auto-suggested amounts.
    await page.goto(BASE + "/payslips");
    await page.selectOption("#payPeriodId", { label: "6/1/2026 – 6/15/2026" });
    await page.selectOption("#userId", { label: EMPLOYEE.name });
    await page.click('button:has-text("Generate payslip")');
    await page.waitForURL(/\/payslips\/[a-z0-9]+$/, { timeout: 10000 });

    let pageText = await page.textContent("body");
    report("generated payslip shows Basic Pay for the 8 regular hours (₱1,000.00)", !!pageText?.includes("₱1,000.00"));
    report("generated payslip shows Overtime Pay for the 2 OT hours (₱312.50)", !!pageText?.includes("₱312.50"));
    report(
      "generated payslip shows Regular Holiday Pay at 200% (₱2,000.00)",
      !!pageText?.includes("Regular Holiday Pay") && !!pageText?.includes("₱2,000.00"),
    );
    report("draft payslip is marked as not yet visible to the employee", !!pageText?.includes("Draft"));

    const payslipUrl = page.url();
    const payslipId = payslipUrl.split("/").pop()!;

    // 6. HR adds a custom deduction, then issues it.
    await page.locator("select").selectOption("DEDUCTION");
    await page.locator('input[placeholder*="Label"]').fill("SSS Contribution");
    await page.locator('input[placeholder="Amount"]').fill("500");
    await page.click('button:has-text("Add")');
    await page.waitForSelector("text=SSS Contribution", { timeout: 10000 });
    report("HR adds a custom deduction line item", true);

    pageText = await page.textContent("body");
    // Total earnings 1000 + 312.50 + 2000 = 3312.50; minus 500 deduction = 2812.50.
    report("net pay reflects the custom deduction (₱2,812.50)", !!pageText?.includes("2,812.50"));

    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("Issue payslip")');
    await page.waitForSelector("text=Issued", { timeout: 10000 });
    report("HR issues the payslip", true);

    const auditCount = await prisma.auditLog.count({ where: { action: "PAYSLIP_ISSUED" } });
    report("issuing a payslip writes an audit log entry", auditCount >= 1);

    // 7. Visibility: the employee sees their own issued payslip.
    await logout(page);
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/payslips");
    let listText = await page.textContent("table");
    report("employee sees their own issued payslip in the list", !!listText?.includes("Issued"));
    await page.goto(BASE + `/payslips/${payslipId}`);
    pageText = await page.textContent("body");
    report("employee can open their own issued payslip directly and see the net pay", !!pageText?.includes("2,812.50"));

    // 8. Visibility: an unrelated employee (not this person, not their
    // manager) sees nothing and can't open it directly.
    await logout(page);
    await login(page, OUTSIDER.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/payslips");
    listText = await page.textContent("table");
    report("an unrelated employee's payslip list has no entries", !!listText?.includes("No payslips yet."));
    const outsiderResponse = await page.goto(BASE + `/payslips/${payslipId}`);
    report("an unrelated employee hitting the direct URL gets a 404, not the payslip", outsiderResponse?.status() === 404);

    // 9. Visibility: the manager sees their direct report's issued payslip.
    await logout(page);
    await login(page, MANAGER.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/payslips");
    listText = await page.textContent("table");
    report("the direct report's manager sees the issued payslip in their list", !!listText?.includes(EMPLOYEE.name));

    // 10. A second, still-DRAFT payslip must stay invisible to the employee.
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/payroll");
    await page.fill("#startDate", "2026-06-16");
    await page.fill("#endDate", "2026-06-30");
    await page.click('button:has-text("Create pay period")');
    await page.waitForTimeout(500);
    await page.goto(BASE + "/payslips");
    await page.selectOption("#payPeriodId", { label: "6/16/2026 – 6/30/2026" });
    await page.selectOption("#userId", { label: EMPLOYEE.name });
    await page.click('button:has-text("Generate payslip")');
    await page.waitForURL(/\/payslips\/[a-z0-9]+$/, { timeout: 10000 });
    const draftPayslipId = page.url().split("/").pop()!;

    await logout(page);
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    const draftResponse = await page.goto(BASE + `/payslips/${draftPayslipId}`);
    report("a still-DRAFT payslip 404s for the employee, not just visually hidden", draftResponse?.status() === 404);
  } catch (err) {
    console.error("Web server output leading up to failure:\n" + serverOutput.slice(-4000));
    throw err;
  } finally {
    if (browser) await browser.close();
    server.kill();
    killPort(WEB_PORT);
    await cleanupTestData();
    await prisma.$disconnect();
  }

  process.exit(summarize() ? 0 : 1);
}

main();
