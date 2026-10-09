// Full, self-contained regression test across all 5 roles: starts a real
// face-engine process (Python/FastAPI, actual DeepFace inference — not
// mocked) and a real Next.js dev server, drives the actual browser UI with
// Playwright using a real face photo fed through Chromium's fake-camera
// device (not a synthetic blank frame), and exercises setup, user
// creation, enrollment, scheduling, kiosk clock-in, and self-service logs
// end to end. Run with: npm run test:e2e

import { TEST_DATABASE_URL } from "./test-env";
import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma";
import { killPort, waitForServer, startDevServer, makeReporter, ensureTestDatabaseMigrated } from "./test-utils";

const WEB_PORT = 3100;
const ENGINE_PORT = 8100;
const BASE = `http://localhost:${WEB_PORT}`;
const ENGINE_BASE = `http://127.0.0.1:${ENGINE_PORT}`;
process.env.FACE_ENGINE_URL = ENGINE_BASE;

const FACE_ENGINE_DIR = fileURLToPath(new URL("../../face-engine", import.meta.url));
const FACE_ENGINE_PYTHON = fileURLToPath(new URL("../../face-engine/.venv/Scripts/python.exe", import.meta.url));
const FAKE_VIDEO_PATH = fileURLToPath(new URL("../tmp_test/fake_camera.y4m", import.meta.url));

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Test Admin", email: "admin@test.presentia" };
const HR = { name: "Test HR", email: "hr@test.presentia" };
const MANAGER = { name: "Test Manager", email: "manager@test.presentia" };
const EMPLOYEE = { name: "Test Employee", email: "employee@test.presentia" };
const KIOSK = { name: "Front Desk Kiosk", email: "kiosk@test.presentia" };

const { report, summarize } = makeReporter();

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presentia" } }, select: { id: true } })
  ).map((u) => u.id);
  if (ids.length > 0) {
    await prisma.punch.deleteMany({ where: { userId: { in: ids } } });
    await prisma.schedule.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { managerId: null } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.systemConfig.deleteMany({});
}

function startFaceEngine(): ChildProcess {
  return spawn(
    FACE_ENGINE_PYTHON,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(ENGINE_PORT)],
    { cwd: FACE_ENGINE_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1" } },
  );
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

async function main() {
  killPort(ENGINE_PORT);
  killPort(WEB_PORT);
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
    const context = await browser.newContext();
    await context.grantPermissions(["camera"], { origin: BASE });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    // 1. Setup — first run, no users yet.
    await page.goto(BASE + "/");
    await page.waitForURL(/\/setup$/, { timeout: 10000 });
    await page.fill('input[name="name"]', ADMIN.name);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Create admin account")');
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("setup creates SUPER_ADMIN and lands on /dashboard", page.url().endsWith("/dashboard"));

    // 1.5. SUPER_ADMIN sets the attendance-rule config (grace period, max
    // break, night differential window) that the rest of the flow depends on.
    await page.goto(BASE + "/config");
    await page.fill("#gracePeriodMinutes", "5");
    await page.fill("#maxBreakMinutes", "60");
    await page.fill("#nightDiffStart", "22:00");
    await page.fill("#nightDiffEnd", "06:00");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    report("SUPER_ADMIN saves attendance-rule config", true);

    // 2. Create the other 4 roles as SUPER_ADMIN.
    await createUser(page, HR, "HR_ADMIN");
    await createUser(page, MANAGER, "MANAGER");
    await createUser(page, EMPLOYEE, "EMPLOYEE", MANAGER.name);
    await createUser(page, KIOSK, "KIOSK");
    const userRows = await page.textContent("table");
    report(
      "all 4 additional users show up in /users",
      [HR, MANAGER, EMPLOYEE, KIOSK].every((u) => userRows?.includes(u.name)),
    );

    // 3. HR enrolls the Employee's face (real inference against the fake
    // camera feed, which plays back the real face test photo).
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
    await page.waitForTimeout(1000); // let the fake video stream actually start producing frames
    await page.click('button:has-text("Capture photo")');
    await page.waitForSelector("img[alt='Captured']", { timeout: 10000 });
    await page.click('button:has-text("Enroll this photo")');
    await page.waitForSelector("text=Enrolled successfully.", { timeout: 20000 });
    report("HR enrolls the employee's face successfully", true);

    // 4. Manager assigns a schedule, scoped to only their own report.
    await logout(page);
    await login(page, MANAGER.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/schedules");
    const checkboxLabels = await page.locator('input[data-testid="userIds-checkbox"]').evaluateAll((els) =>
      els.map((el) => el.closest("label")?.textContent?.trim()),
    );
    report(
      "Manager's schedule form only lists their own direct report",
      checkboxLabels.length === 1 && !!checkboxLabels[0]?.includes(EMPLOYEE.name),
    );
    await page.check(`input[name="userIds"]`);
    await page.fill("#startTime", "09:00");
    await page.fill("#endTime", "18:00");
    // Check every day (not just the default weekdays) so the schedule
    // always applies "today" regardless of which day this test happens to
    // run on — otherwise late/OT/night-diff flags wouldn't compute at all
    // on a weekend run.
    for (const day of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
      await page.check(`input[name="days"][value="${day}"]`);
    }
    await page.click('button:has-text("Add schedule")');
    await page.waitForSelector(`td:has-text("${EMPLOYEE.name}")`, { timeout: 10000 });
    report("schedule appears in the table after being added", true);

    // 5. Kiosk clock-in — real face match + liveness against the fake feed
    // identifies the employee (verification, not an auto-recorded punch),
    // then the test picks each type itself, cycling through the full
    // multi-punch sequence: Time In -> Break Out -> Break In -> Time Out.
    await logout(page);
    await login(page, KIOSK.email);
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await page.waitForSelector("video", { timeout: 10000 });
    for (const label of ["Time In", "Break Out", "Break In", "Time Out"]) {
      await page.waitForSelector(`text=Welcome, ${EMPLOYEE.name}`, { timeout: 30000 });
      report(`kiosk identifies ${EMPLOYEE.name} before recording ${label}`, true);
      await page.click(`button:has-text("${label}")`);
      await page.waitForSelector(`text=${EMPLOYEE.name} — ${label} recorded`, { timeout: 10000 });
      report(`kiosk records ${label} for the enrolled employee`, true);
    }

    // The kiosk view deliberately has no logout button — that's the whole
    // point of locked-down kiosk mode (no way to navigate away from it).
    // Clear the session directly to switch users for the next step.
    await context.clearCookies();

    // 6. Employee reviews their own log — all 4 punch types should show,
    // and the break punch should carry a computed break-duration flag.
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/logs");
    const logsText = await page.textContent("table");
    report(
      "employee's own /logs shows all 4 punch types",
      ["Time In", "Break Out", "Break In", "Time Out"].every((label) => logsText?.includes(label)),
    );
    report("employee's own /logs shows a computed break-duration flag", !!logsText?.includes("break"));

    // 7. Role gating: an Employee can't reach /users.
    await page.goto(BASE + "/users");
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("Employee hitting /users is redirected to /dashboard, not shown the page", page.url().endsWith("/dashboard"));
  } catch (err) {
    console.error("Web server output leading up to failure:\n" + serverOutput.slice(-4000));
    console.error("Face-engine output leading up to failure:\n" + engineOutput.slice(-4000));
    throw err;
  } finally {
    if (browser) await browser.close();
    server.kill();
    engine.kill();
    killPort(WEB_PORT);
    killPort(ENGINE_PORT);
    await cleanupTestData();
    await prisma.$disconnect();
  }

  process.exit(summarize() ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
