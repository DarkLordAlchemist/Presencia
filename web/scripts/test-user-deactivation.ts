// Self-contained regression test for deactivating/reactivating an employee
// (not deleting them): a deactivated account must be blocked from logging
// in, an already-open session must be kicked out on its very next request
// (without looping between /login and /dashboard), and reactivating must
// restore login. No face-engine needed — this doesn't touch the kiosk.
// Run with: npm run test:deactivation

import { TEST_DATABASE_URL } from "./test-env";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";
import { killPort, waitForServer, startDevServer, makeReporter, ensureTestDatabaseMigrated } from "./test-utils";

const WEB_PORT = 3400;
const BASE = `http://localhost:${WEB_PORT}`;

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Deact Test Admin", email: "deact-admin@test.presentia" };
const EMPLOYEE = { name: "Deact Test Employee", email: "deact-employee@test.presentia" };

const { report, summarize } = makeReporter();

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presentia" } }, select: { id: true } })
  ).map((u) => u.id);
  if (ids.length > 0) {
    await prisma.punch.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

async function login(page: import("playwright").Page, email: string) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
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
    const adminPage = await context.newPage();
    adminPage.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    // 1. Setup — first run, no users yet.
    await adminPage.goto(BASE + "/");
    await adminPage.waitForURL(/\/setup$/, { timeout: 10000 });
    await adminPage.fill('input[name="name"]', ADMIN.name);
    await adminPage.fill('input[name="email"]', ADMIN.email);
    await adminPage.fill('input[name="password"]', PASSWORD);
    await adminPage.click('button:has-text("Create admin account")');
    await adminPage.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("setup creates SUPER_ADMIN and lands on /dashboard", true);

    // 2. Create the employee.
    await adminPage.goto(BASE + "/users/new");
    await adminPage.fill('input[name="name"]', EMPLOYEE.name);
    await adminPage.fill('input[name="email"]', EMPLOYEE.email);
    await adminPage.fill('input[name="password"]', PASSWORD);
    await adminPage.selectOption("#role", "EMPLOYEE");
    await adminPage.click('button:has-text("Create user")');
    await adminPage.waitForURL(/\/users$/, { timeout: 10000 });
    report("new employee shows up in /users as Active", (await adminPage.textContent("table"))?.includes("Active") ?? false);

    // 3. The employee logs in themselves, in a second, independent browser
    // context — a real separate session, not just the admin's cookie.
    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await login(employeePage, EMPLOYEE.email);
    await employeePage.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("employee logs in successfully before being deactivated", employeePage.url().endsWith("/dashboard"));

    // 4. Admin deactivates them from /users, confirming the browser dialog.
    await adminPage.goto(BASE + "/users");
    adminPage.once("dialog", (d) => d.accept());
    await adminPage.locator("tr", { hasText: EMPLOYEE.name }).locator('button:has-text("Deactivate")').click();
    await adminPage.waitForSelector("text=Deactivated", { timeout: 10000 });
    report("employee shows as Deactivated in /users after the action", true);

    const dbUser = await prisma.user.findUnique({ where: { email: EMPLOYEE.email } });
    report("employee's active flag is actually false in the database", dbUser?.active === false);

    // 5. The employee's already-open session (from step 3, opened before
    // deactivation) must be kicked to /login on its very next request — and
    // must land there cleanly, not loop back to /dashboard.
    await employeePage.goto(BASE + "/dashboard");
    await employeePage.waitForURL(/\/login$/, { timeout: 10000 });
    report("a deactivated employee's existing session is redirected to /login, not looped", employeePage.url().endsWith("/login"));

    // 6. A fresh login attempt with the correct password is refused with a
    // clear reason, not a generic "invalid credentials".
    await login(employeePage, EMPLOYEE.email);
    await employeePage.waitForSelector("text=This account has been deactivated.", { timeout: 10000 });
    report("logging in as a deactivated user shows the deactivation message", true);

    // 7. Admin reactivates them; login works again.
    await adminPage.goto(BASE + "/users");
    await adminPage.locator("tr", { hasText: EMPLOYEE.name }).locator('button:has-text("Reactivate")').click();
    await adminPage.waitForSelector("text=Active", { timeout: 10000 });
    report("employee shows as Active again after reactivation", true);

    // The employee's browser tab still holds its original session cookie
    // from step 3 (never deleted, only gated on active-ness) — reactivating
    // resumes it automatically, which is fine, but means this check needs a
    // clean slate to actually exercise a fresh login, not an auto-resume.
    await employeeContext.clearCookies();
    await login(employeePage, EMPLOYEE.email);
    await employeePage.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("reactivated employee can log in again", employeePage.url().endsWith("/dashboard"));

    // 8. A SUPER_ADMIN can't deactivate their own account.
    await adminPage.goto(BASE + "/users");
    const ownRowButtonCount = await adminPage
      .locator("tr", { hasText: ADMIN.name })
      .locator('button:has-text("Deactivate")')
      .count();
    report("there is no Deactivate button on the admin's own row", ownRowButtonCount === 0);
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
