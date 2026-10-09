// End-to-end regression test for the second phase-2 batch: geofencing/IP
// locking, advanced rostering (group assignment + rotating/dated
// schedules), leave requests, overtime/shift-swap requests, timesheet
// corrections (both add-missing and edit-existing), the audit log,
// cut-off locking, the live who's-in dashboard, and payroll CSV export +
// webhook push. Real face-engine inference, real fake-camera video feed,
// real headless browser, real (mocked) webhook receiver. Run with:
//   npm run test:e2e:phase2

import { TEST_DATABASE_URL } from "./test-env";
import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma";
import { killPort, waitForServer, startDevServer, makeReporter, ensureTestDatabaseMigrated } from "./test-utils";

const WEB_PORT = 3101;
const ENGINE_PORT = 8101;
const WEBHOOK_PORT = 3102;
const BASE = `http://localhost:${WEB_PORT}`;
const ENGINE_BASE = `http://127.0.0.1:${ENGINE_PORT}`;
process.env.FACE_ENGINE_URL = ENGINE_BASE;

const FACE_ENGINE_DIR = fileURLToPath(new URL("../../face-engine", import.meta.url));
const FACE_ENGINE_PYTHON = fileURLToPath(new URL("../../face-engine/.venv/Scripts/python.exe", import.meta.url));
const FAKE_VIDEO_PATH = fileURLToPath(new URL("../tmp_test/fake_camera.y4m", import.meta.url));

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Test Admin 2", email: "admin2@test.presencia" };
const HR = { name: "Test HR 2", email: "hr2@test.presencia" };
const MANAGER = { name: "Test Manager 2", email: "manager2@test.presencia" };
const EMPLOYEE = { name: "Test Employee 2", email: "employee2@test.presencia" };
const KIOSK = { name: "Front Desk Kiosk 2", email: "kiosk2@test.presencia" };

// A real place in Metro Manila to use as the "correct" geofence center.
const OFFICE = { lat: 14.5547, lng: 121.0244 };
const FAR_AWAY = { lat: 40.7128, lng: -74.006 }; // New York — nowhere near the office

const { report, summarize } = makeReporter();

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presencia" } }, select: { id: true } })
  ).map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.correctionRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.shiftRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.punch.deleteMany({ where: { userId: { in: ids } } });
    await prisma.schedule.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { managerId: null } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.payPeriod.deleteMany({});
  await prisma.systemConfig.deleteMany({});
}

function startFaceEngine(): ChildProcess {
  return spawn(
    FACE_ENGINE_PYTHON,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(ENGINE_PORT)],
    { cwd: FACE_ENGINE_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1" } },
  );
}

let webhookReceivedBody: string | null = null;
function startMockWebhookServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        webhookReceivedBody = body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(WEBHOOK_PORT, () => resolve(server));
  });
}

async function logout(page: import("playwright").Page) {
  await page.click('button:has-text("Log out")');
  await page.waitForURL(/\/login$/, { timeout: 10000 });
}

async function login(page: import("playwright").Page, email: string) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
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
  if (managerLabel) {
    await page.selectOption("#managerId", { label: managerLabel });
  }
  await page.click('button:has-text("Create user")');
  await page.waitForURL(/\/users$/, { timeout: 10000 });
}

// Local calendar date, not UTC — this sandbox's local clock runs ~8 hours
// ahead of UTC (matching Manila, which is what the app's own day-boundary
// logic uses), so toISOString()'s UTC date can silently be a day behind
// what the server considers "today" right after local midnight.
function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  killPort(ENGINE_PORT);
  killPort(WEB_PORT);
  killPort(WEBHOOK_PORT);
  ensureTestDatabaseMigrated(TEST_DATABASE_URL);
  await cleanupTestData();

  const engine = startFaceEngine();
  let engineOutput = "";
  engine.stdout?.on("data", (c) => (engineOutput += c));
  engine.stderr?.on("data", (c) => (engineOutput += c));

  const server = startDevServer(WEB_PORT);
  let serverOutput = "";
  server.stdout?.on("data", (c) => (serverOutput += c));
  server.stderr?.on("data", (c) => (serverOutput += c));

  const webhookServer = await startMockWebhookServer();

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await waitForServer(ENGINE_BASE + "/health", 60000);
    await waitForServer(BASE, 30000);

    browser = await chromium.launch({
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-video-capture=${FAKE_VIDEO_PATH}`,
      ],
    });
    const context = await browser.newContext({ permissions: ["camera", "geolocation"] });
    // Granting a subset of permissions here can replace the full grant set
    // from newContext(), silently revoking geolocation — include both.
    await context.grantPermissions(["camera", "geolocation"], { origin: BASE });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    // --- Setup + roster ---
    await page.goto(BASE + "/");
    await page.waitForURL(/\/setup$/, { timeout: 10000 });
    await page.fill('input[name="name"]', ADMIN.name);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Create admin account")');
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("setup creates SUPER_ADMIN", page.url().endsWith("/dashboard"));

    await createUser(page, HR, "HR_ADMIN");
    await createUser(page, MANAGER, "MANAGER");
    await createUser(page, EMPLOYEE, "EMPLOYEE", MANAGER.name);
    await createUser(page, KIOSK, "KIOSK");

    // --- Enrollment ---
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/enroll");
    const employeeOptionValue = await page.$eval(
      `#userId option:has-text("${EMPLOYEE.name}")`,
      (el) => (el as HTMLOptionElement).value,
    );
    await page.selectOption("#userId", employeeOptionValue);
    await page.waitForSelector("video", { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Capture photo")');
    await page.waitForSelector("img[alt='Captured']", { timeout: 10000 });
    await page.click('button:has-text("Enroll this photo")');
    await page.waitForSelector("text=Enrolled successfully.", { timeout: 20000 });
    report("HR enrolls the employee's face", true);

    // --- Advanced rostering: group assignment (both Manager's report AND
    // the Manager would only see their own report, so use HR/Admin to
    // assign a schedule to a real multi-person group) ---
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/schedules");
    // Fixed, indefinite schedule covering every day, for the Employee AND
    // the Manager in one submission (a real "group" of 2).
    const employeeCheckbox = page.locator(`input[name="userIds"][value="${employeeOptionValue}"]`);
    await employeeCheckbox.check();
    // Select the Manager's own checkbox by its label text instead of a
    // pre-known id, since HR/Admin's target list order isn't guaranteed.
    const managerCheckbox = page.locator("label", { hasText: MANAGER.name }).locator('input[type="checkbox"]');
    await managerCheckbox.check();
    await page.fill("#startTime", "09:00");
    await page.fill("#endTime", "18:00");
    await page.selectOption("#shiftType", "FIXED");
    for (const day of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
      await page.check(`input[name="days"][value="${day}"]`);
    }
    await page.click('button:has-text("Add schedule")');
    await page.waitForSelector(`td:has-text("${EMPLOYEE.name}")`, { timeout: 10000 });
    const scheduleRowsAfterGroup = await page.locator("table tbody tr").count();
    report(
      "group schedule assignment creates one row per selected person",
      scheduleRowsAfterGroup >= 2,
    );

    // A second, rotating/dated schedule block for the Employee. Locators
    // re-query the live DOM at action time, so reusing `employeeCheckbox`
    // after this navigation is fine — no need to re-declare it.
    await page.goto(BASE + "/schedules");
    await employeeCheckbox.check();
    await page.fill("#startTime", "22:00");
    await page.fill("#endTime", "06:00");
    await page.selectOption("#shiftType", "ROTATING");
    await page.fill("#validFrom", "2026-01-01");
    await page.fill("#validTo", "2026-01-31");
    for (const day of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
      await page.check(`input[name="days"][value="${day}"]`);
    }
    await page.click('button:has-text("Add schedule")');
    await page.waitForSelector('td:has-text("Rotating")', { timeout: 10000 });
    const validRangeText = await page.textContent("table");
    report(
      "a rotating schedule with a date range shows as Rotating with a valid-from/to range, not Indefinite",
      !!validRangeText?.includes("Rotating") && /\d{1,2}\/\d{1,2}\/\d{4}/.test(validRangeText ?? ""),
    );

    // --- Kiosk: full punch cycle so we have real punches to correct/audit ---
    await logout(page);
    await login(page, KIOSK.email);
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await page.waitForSelector("video", { timeout: 10000 });
    for (const label of ["Time In", "Break Out", "Break In", "Time Out"]) {
      await page.waitForSelector(`text=Welcome, ${EMPLOYEE.name}`, { timeout: 30000 });
      await page.click(`button:has-text("${label}")`);
      await page.waitForSelector(`text=${EMPLOYEE.name} — ${label} recorded`, { timeout: 10000 });
    }
    report("kiosk records a full Time In/Break/Time Out cycle", true);
    await context.clearCookies();

    // --- Leave request + approval ---
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/leave");
    await page.selectOption("#type", "VACATION");
    const nextWeekStart = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const nextWeekEnd = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    await page.fill("#startDate", nextWeekStart);
    await page.fill("#endDate", nextWeekEnd);
    await page.fill("#reason", "Family trip");
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector("text=PENDING", { timeout: 10000 });
    report("employee files a leave request, shows PENDING", true);

    await context.clearCookies();
    await login(page, MANAGER.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/leave");
    // At this point in the flow, no overtime/swap requests exist yet, so
    // the only "Approve" button on the page is in the pending-leave table.
    await page.locator('button:has-text("Approve")').first().click();
    await page.waitForTimeout(1000);
    const leaveStatus = await prisma.leaveRequest.findFirst({ where: { reason: "Family trip" } });
    report("manager approves the leave request", leaveStatus?.status === "APPROVED");

    // --- Overtime request + approval ---
    await context.clearCookies();
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/leave");
    await page.selectOption("#shiftType", "OVERTIME");
    await page.fill("#targetDate", todayInputValue());
    await page.fill("#details", "Need 2 hours to finish month-end closing.");
    // Two forms on this page both have a "Submit request" button (leave,
    // then shift/overtime below it) — target the second one specifically.
    await page.locator('button:has-text("Submit request")').last().click();
    await page.waitForTimeout(500);
    const shiftRequestCreated = await prisma.shiftRequest.findFirst({
      where: { details: "Need 2 hours to finish month-end closing." },
    });
    report("employee files an overtime request", shiftRequestCreated !== null);

    await context.clearCookies();
    await login(page, MANAGER.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/leave");
    await page.locator('button:has-text("Approve")').last().click();
    await page.waitForTimeout(1000);
    const shiftRequestStatus = await prisma.shiftRequest.findFirst({
      where: { details: "Need 2 hours to finish month-end closing." },
    });
    report("manager approves the overtime request", shiftRequestStatus?.status === "APPROVED");

    // --- Corrections: add a missing punch (a fixed past date, deliberately
    // not "yesterday relative to now" — this test's sandbox runs with its
    // local clock ~8 hours ahead of UTC, and Date.now()-24h's UTC calendar
    // date can land two days back from local "today" right after local
    // midnight; a fixed date sidesteps that boundary fragility entirely),
    // and edit an existing punch from today's real kiosk cycle ---
    await context.clearCookies();
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/corrections");
    // missing-punch path
    await page.check('input[type="radio"] >> nth=0'); // "I forgot to punch"
    await page.selectOption("#requestedType", "TIME_IN");
    const missingPunchDate = "2026-01-15";
    await page.fill("#requestedTime", `${missingPunchDate}T09:00`);
    await page.fill("#reason", "Forgot to scan in that morning.");
    await page.click('button:has-text("Submit request")');
    await page.waitForTimeout(500);
    report("employee requests a missing-punch correction", true);

    await context.clearCookies();
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/corrections");
    await page.locator('button:has-text("Approve")').first().click();
    await page.waitForTimeout(1000);

    const addedPunchCount = await prisma.punch.count({
      where: {
        user: { email: EMPLOYEE.email },
        manualEntry: true,
        type: "TIME_IN",
        timestamp: { gte: new Date("2026-01-14T00:00:00Z"), lte: new Date("2026-01-16T00:00:00Z") },
      },
    });
    report("approved missing-punch correction actually creates a manual Punch row", addedPunchCount >= 1);

    const auditAddCount = await prisma.auditLog.count({ where: { action: "CORRECTION_APPROVED_ADD" } });
    report("approving a missing-punch correction writes an audit log entry", auditAddCount >= 1);

    // --- Cut-off locking blocks further correction approvals ---
    await context.clearCookies();
    await login(page, ADMIN.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/payroll");
    const today = todayInputValue();
    await page.fill("#startDate", today);
    await page.fill("#endDate", today);
    await page.click('button:has-text("Create pay period")');
    await page.waitForSelector("text=Open", { timeout: 10000 });
    await page.click('button:has-text("Lock")');
    await page.waitForSelector("text=Locked", { timeout: 10000 });
    report("SUPER_ADMIN creates and locks today's pay period", true);

    // Now request an edit correction on the employee's most recent punch
    // (the form's dropdown defaults to it) and try to approve it.
    await context.clearCookies();
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/corrections");
    await page.check('input[type="radio"] >> nth=1'); // "An existing punch is wrong"
    // pick the first listed punch (today's TIME_IN from the kiosk cycle)
    const requestedTimeLocal = `${today}T09:10`;
    await page.fill("#requestedTime", requestedTimeLocal);
    await page.fill("#reason", "Actually clocked in a bit later.");
    await page.click('button:has-text("Submit request")');
    await page.waitForTimeout(500);

    await context.clearCookies();
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/corrections");
    const pendingCountBefore = await prisma.correctionRequest.count({ where: { status: "PENDING" } });
    await page.locator('button:has-text("Approve")').first().click();
    await page.waitForTimeout(1000);
    const pendingCountAfter = await prisma.correctionRequest.count({ where: { status: "PENDING" } });
    report(
      "a correction landing inside a locked pay period is NOT approved (cut-off locking holds)",
      pendingCountAfter === pendingCountBefore,
    );

    // --- Audit log shows the leave/overtime/lock actions ---
    await page.goto(BASE + "/audit");
    const auditText = await page.textContent("table");
    report(
      "audit log page shows leave, overtime, and pay-period actions",
      !!auditText?.includes("LEAVE_APPROVED") &&
        !!auditText?.includes("SHIFT_REQUEST_APPROVED") &&
        !!auditText?.includes("PAY_PERIOD_LOCK"),
    );

    // --- Who's-in dashboard reflects the real kiosk state ---
    await page.goto(BASE + "/whos-in");
    const whosInText = await page.textContent("table");
    report(
      "who's-in dashboard shows the employee as Done for the Day after their kiosk Time Out",
      !!whosInText?.includes(EMPLOYEE.name) && !!whosInText?.includes("Done for the Day"),
    );

    // --- Payroll CSV export ---
    await page.goto(BASE + "/payroll");
    const periodRow = page.locator("tr", { hasText: today.split("-").reverse().join("/") });
    void periodRow;
    const exportLink = await page.locator('a:has-text("Export CSV")').first().getAttribute("href");
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csvRes = await fetch(BASE + exportLink, { headers: { Cookie: cookieHeader } });
    const csvText = await csvRes.text();
    report(
      "payroll CSV export includes the employee and looks like a real CSV",
      csvRes.headers.get("content-type")?.includes("text/csv") === true && csvText.includes(EMPLOYEE.name),
    );

    // --- Payroll webhook push --- (/config is SUPER_ADMIN-only, switch back to ADMIN)
    await context.clearCookies();
    await login(page, ADMIN.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/config");
    await page.fill("#payrollWebhookUrl", `http://127.0.0.1:${WEBHOOK_PORT}/webhook`);
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    await page.goto(BASE + "/payroll");
    await page.click('button:has-text("Send to payroll webhook")');
    await page.waitForSelector("text=Sent.", { timeout: 10000 });
    report(
      "payroll webhook actually receives a POST with the employee's computed hours",
      typeof webhookReceivedBody === "string" && webhookReceivedBody.includes(EMPLOYEE.name),
    );

    // --- Geofencing blocks an out-of-area clock-in, then allows an in-area one ---
    await context.setGeolocation({ latitude: FAR_AWAY.lat, longitude: FAR_AWAY.lng });
    await page.goto(BASE + "/config");
    await page.check("#geofenceEnabled");
    await page.fill("#geofenceLat", String(OFFICE.lat));
    await page.fill("#geofenceLng", String(OFFICE.lng));
    await page.fill("#geofenceRadiusMeters", "200");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });

    await context.clearCookies();
    await login(page, KIOSK.email);
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await page.waitForSelector("video", { timeout: 10000 });
    await page.waitForSelector("text=outside the allowed clock-in area", { timeout: 30000 });
    report("kiosk clock-in is blocked when the device is outside the configured geofence", true);

    await context.clearCookies();
    await context.setGeolocation({ latitude: OFFICE.lat, longitude: OFFICE.lng });
    await login(page, KIOSK.email);
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await page.waitForSelector("video", { timeout: 10000 });
    await page.waitForSelector(`text=Welcome, ${EMPLOYEE.name}`, { timeout: 30000 });
    await page.click('button:has-text("Time In")');
    await page.waitForSelector(`text=${EMPLOYEE.name} — Time In recorded`, { timeout: 10000 });
    report("kiosk clock-in succeeds once the device is back inside the geofence", true);
    await context.clearCookies();

    // --- IP locking blocks clock-in when the request's IP isn't on the allowlist ---
    await login(page, ADMIN.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/config");
    await page.uncheck("#geofenceEnabled");
    await page.check("#ipLockEnabled");
    await page.fill("#allowedIpPrefixes", "203.0.113."); // deliberately not this test's real IP
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });

    await context.clearCookies();
    await login(page, KIOSK.email);
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await page.waitForSelector("video", { timeout: 10000 });
    await page.waitForSelector("text=network is not authorized", { timeout: 30000 });
    report("kiosk clock-in is blocked when IP locking is enabled and the IP isn't allowed", true);
  } catch (err) {
    console.error("Web server output leading up to failure:\n" + serverOutput.slice(-4000));
    console.error("Face-engine output leading up to failure:\n" + engineOutput.slice(-4000));
    throw err;
  } finally {
    if (browser) await browser.close();
    server.kill();
    engine.kill();
    webhookServer.close();
    killPort(WEB_PORT);
    killPort(ENGINE_PORT);
    killPort(WEBHOOK_PORT);
    await cleanupTestData();
    await prisma.$disconnect();
  }

  process.exit(summarize() ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
