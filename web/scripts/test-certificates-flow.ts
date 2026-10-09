// Self-contained regression test for the onboarding -> certificate request
// -> HR approval -> auto-generated certificate view workflow. No
// face-engine needed — nothing here touches the kiosk.
// Run with: npm run test:certificates

import { TEST_DATABASE_URL } from "./test-env";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";
import { killPort, waitForServer, startDevServer, makeReporter, ensureTestDatabaseMigrated } from "./test-utils";

const WEB_PORT = 3500;
const BASE = `http://localhost:${WEB_PORT}`;

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Cert Test Admin", email: "cert-admin@test.presencia" };
const HR = { name: "Cert Test HR", email: "cert-hr@test.presencia" };
// Deliberately not substrings of each other — Playwright's `hasText` row
// filter does substring matching, and "Cert Test Employee" would match
// both an "Employee One" and an "Employee Two" row.
const EMPLOYEE = { name: "Cert Test Employee One", email: "cert-employee@test.presencia" };
const EMPLOYEE2 = { name: "Cert Test Employee Two", email: "cert-employee2@test.presencia" };

const { report, summarize } = makeReporter();

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presencia" } }, select: { id: true } })
  ).map((u) => u.id);
  if (ids.length > 0) {
    await prisma.certificateRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
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

async function createUser(page: import("playwright").Page, user: { name: string; email: string }, role: string) {
  await page.goto(BASE + "/users/new");
  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.selectOption("#role", role);
  await page.click('button:has-text("Create user")');
  await page.waitForURL(/\/users$/, { timeout: 10000 });
}

async function onboard(
  page: import("playwright").Page,
  userId: string,
  fields: { jobTitle: string; department: string; dateHired: string; status: string; compensation: string; benefits: string },
) {
  await page.goto(BASE + `/onboarding/${userId}`);
  await page.fill("#jobTitle", fields.jobTitle);
  await page.fill("#department", fields.department);
  await page.fill("#dateHired", fields.dateHired);
  await page.selectOption("#employmentStatus", fields.status);
  await page.fill("#monthlyCompensation", fields.compensation);
  await page.fill("#benefits", fields.benefits);
  await page.click('button:has-text("Save")');
  await page.waitForSelector("text=Saved.", { timeout: 10000 });
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

    // 1. Setup + company name (so the certificate has a real letterhead, not the fallback).
    await page.goto(BASE + "/");
    await page.waitForURL(/\/setup$/, { timeout: 10000 });
    await page.fill('input[name="name"]', ADMIN.name);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Create admin account")');
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    report("setup creates SUPER_ADMIN", true);

    await page.goto(BASE + "/config");
    await page.fill("#companyName", "Test Certificate Corp");
    await page.fill("#certificateSignatoryName", "Juana Dela Cruz");
    await page.fill("#certificateSignatoryTitle", "Head of HR");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    report("SUPER_ADMIN sets the company name and certificate signatory", true);

    await createUser(page, HR, "HR_ADMIN");
    await createUser(page, EMPLOYEE, "EMPLOYEE");
    await createUser(page, EMPLOYEE2, "EMPLOYEE");
    report("SUPER_ADMIN creates HR and two employees", true);

    // 2. Before onboarding: employee's own request must be blocked.
    await logout(page);
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/certificates");
    await page.selectOption("#purpose", "GENERAL");
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector("text=onboarding record isn't complete", { timeout: 10000 });
    report("certificate request is blocked before onboarding is complete", true);

    // 3. HR onboards the employee.
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/onboarding");
    const employeeIdHref = await page
      .locator("tr", { hasText: EMPLOYEE.name })
      .locator("a")
      .getAttribute("href");
    if (!employeeIdHref) throw new Error("Could not find the Onboard link for the test employee");
    const employeeId = employeeIdHref.split("/").pop()!;

    await onboard(page, employeeId, {
      jobTitle: "Software Engineer",
      department: "Engineering",
      dateHired: "2023-06-01",
      status: "REGULAR",
      compensation: "45000",
      benefits: "HMO, 13th month pay",
    });
    report("HR completes onboarding for the employee", true);

    await page.goto(BASE + "/onboarding");
    const rowText = await page.locator("tr", { hasText: EMPLOYEE.name }).textContent();
    report("onboarding list now shows the employee as Complete", !!rowText?.includes("Complete"));

    // 4. Employee requests a certificate now that onboarding is done.
    await logout(page);
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/certificates");
    await page.selectOption("#purpose", "BANK_LOAN");
    await page.fill("#notes", "BPI auto loan");
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector("text=Request submitted.", { timeout: 10000 });
    report("employee requests a certificate after onboarding is complete", true);

    const myRequestsText = await page.textContent("table");
    report("the new request shows as PENDING in My requests", !!myRequestsText?.includes("PENDING"));

    // 5. HR approves it.
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/certificates");
    await page.locator('button:has-text("Approve")').first().click();
    await page.waitForTimeout(1000);

    const approved = await prisma.certificateRequest.findFirst({
      where: { userId: employeeId, status: "APPROVED" },
    });
    report("approving the request snapshots the employee's HR record", approved?.snapshotJobTitle === "Software Engineer");
    report("the snapshot captures compensation at approval time", approved?.snapshotCompensation === 45000);

    const auditCount = await prisma.auditLog.count({ where: { action: "CERTIFICATE_APPROVED" } });
    report("approving a certificate writes an audit log entry", auditCount >= 1);

    // 6. Employee views/prints the generated certificate.
    await logout(page);
    await login(page, EMPLOYEE.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/certificates");
    await page.click('a:has-text("View / Print")');
    await page.waitForURL(new RegExp(`/certificates/${approved!.id}$`), { timeout: 10000 });
    const certText = await page.textContent("body");
    report("the generated certificate names the employee", !!certText?.includes(EMPLOYEE.name));
    report("the generated certificate shows the company name", !!certText?.includes("Test Certificate Corp"));
    report("the generated certificate shows the job title", !!certText?.includes("Software Engineer"));
    report(
      "a BANK_LOAN certificate includes the compensation figure",
      !!certText?.includes("₱45,000.00"),
    );
    report(
      "the certificate shows the configured HR signatory, not whoever clicked Approve",
      !!certText?.includes("Juana Dela Cruz") && !!certText?.includes("Head of HR") && !certText?.includes(HR.name),
    );

    // The app's own nav header must disappear under print media — that's
    // exactly what showed up in the app chrome/browser-URL bug report this
    // fix addresses. Real media emulation, not just checking a class name.
    await page.emulateMedia({ media: "print" });
    const headerVisibleWhenPrinting = await page.locator("header").isVisible().catch(() => false);
    report("the app's nav header is hidden under print media", headerVisibleWhenPrinting === false);
    await page.emulateMedia({ media: "screen" });

    // 7. HR can file a request on behalf of another employee (needed once
    // someone's deactivated and can no longer log in themselves) — onboard
    // employee 2 first, then have HR submit for them instead of themselves.
    await logout(page);
    await login(page, HR.email);
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
    await page.goto(BASE + "/onboarding");
    const employee2IdHref = await page
      .locator("tr", { hasText: EMPLOYEE2.name })
      .locator("a")
      .getAttribute("href");
    if (!employee2IdHref) throw new Error("Could not find the Onboard link for the second test employee");
    const employee2Id = employee2IdHref.split("/").pop()!;

    await onboard(page, employee2Id, {
      jobTitle: "Accountant",
      department: "Finance",
      dateHired: "2024-01-15",
      status: "PROBATIONARY",
      compensation: "30000",
      benefits: "",
    });

    await page.goto(BASE + "/certificates");
    await page.selectOption("#userId", employee2Id);
    await page.selectOption("#purpose", "GENERAL");
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector("text=Request submitted.", { timeout: 10000 });

    const onBehalfRequest = await prisma.certificateRequest.findFirst({
      where: { userId: employee2Id },
      orderBy: { createdAt: "desc" },
    });
    report("HR filing a request 'for' someone else creates it under that employee, not HR's own account", onBehalfRequest !== null);

    // Two tables render for HR (My requests, then Pending certificate
    // approvals) — target the second, not just the first "table" match.
    const pendingText = await page.locator("table").nth(1).textContent();
    report("the on-behalf-of request shows the actual employee's name in pending approvals", !!pendingText?.includes(EMPLOYEE2.name));
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
