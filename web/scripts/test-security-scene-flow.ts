// Security dashboard end to end, with both engines real (not mocked): a
// real face-engine (DeepFace) and a real scene-engine (YOLO26m +
// RelateAnything on the GPU), a real Next.js dev server, and two real
// browsers on two fake cameras — one playing a face photo (movement
// logging), one playing a person riding a horse (scene alerts). Finally
// scene-engine is stopped mid-run to prove face logging keeps working
// without it. Run with: npm run test:security
//
// Needs RelateAnything installed (its .venv runs scene-engine) at
// RELATEANYTHING_DIR, default C:\Users\User\RelateAnything.

import { TEST_DATABASE_URL } from "./test-env";
import { chromium, type Browser, type Page } from "playwright";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma";
import {
  killPort,
  waitForServer,
  startDevServer,
  makeReporter,
  ensureTestDatabaseMigrated,
  enrollAllAngles,
} from "./test-utils";

const WEB_PORT = 3100;
const ENGINE_PORT = 8100;
const SCENE_PORT = 8101;
const BASE = `http://localhost:${WEB_PORT}`;
const ENGINE_BASE = `http://127.0.0.1:${ENGINE_PORT}`;
const SCENE_BASE = `http://127.0.0.1:${SCENE_PORT}`;
process.env.FACE_ENGINE_URL = ENGINE_BASE;
process.env.SCENE_ENGINE_URL = SCENE_BASE;

const FACE_ENGINE_DIR = fileURLToPath(new URL("../../face-engine", import.meta.url));
const FACE_ENGINE_PYTHON = fileURLToPath(new URL("../../face-engine/.venv/Scripts/python.exe", import.meta.url));
const SCENE_ENGINE_DIR = fileURLToPath(new URL("../../scene-engine", import.meta.url));
const RELATEANYTHING_DIR = process.env.RELATEANYTHING_DIR ?? "C:\\Users\\User\\RelateAnything";
const SCENE_PYTHON = join(RELATEANYTHING_DIR, ".venv", "Scripts", "python.exe");
const FACE_VIDEO_PATH = fileURLToPath(new URL("../tmp_test/fake_camera.y4m", import.meta.url));
const SCENE_VIDEO_PATH = fileURLToPath(new URL("../tmp_test/fake_camera_scene.y4m", import.meta.url));

const PASSWORD = "correcthorsebattery";
const ADMIN = { name: "Test Admin", email: "admin@test.presencia" };
const SECURITY = { name: "Test Security", email: "security@test.presencia" };
const EMPLOYEE = { name: "Test Employee", email: "employee@test.presencia" };

const { report, summarize } = makeReporter();

async function cleanupTestData() {
  const ids = (
    await prisma.user.findMany({ where: { email: { endsWith: "@test.presencia" } }, select: { id: true } })
  ).map((u) => u.id);
  await prisma.sceneAlert.deleteMany({});
  if (ids.length > 0) {
    await prisma.movementLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { managerId: null } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.systemConfig.deleteMany({});
}

function startPython(python: string, cwd: string, port: number): ChildProcess {
  return spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUTF8: "1" },
  });
}

async function login(page: Page, email: string) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function createUser(page: Page, user: { name: string; email: string }, role: string) {
  await page.goto(BASE + "/users/new");
  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.selectOption("#role", role);
  await page.click('button:has-text("Create user")');
  await page.waitForURL(/\/users$/, { timeout: 10000 });
}

async function launchWithCamera(videoPath: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
    ],
  });
  const context = await browser.newContext();
  await context.grantPermissions(["camera"], { origin: BASE });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  return { browser, page };
}

async function addCameraTile(page: Page, location: string) {
  await page.goto(BASE + "/security");
  await page.click('button:has-text("Add camera")');
  await page.fill('input[placeholder^="Location label"]', location);
}

async function main() {
  if (!existsSync(SCENE_PYTHON)) {
    console.error(`RelateAnything's python not found at ${SCENE_PYTHON} — set RELATEANYTHING_DIR.`);
    process.exit(1);
  }
  if (!existsSync(SCENE_VIDEO_PATH)) {
    execFileSync(SCENE_PYTHON, [
      join(SCENE_ENGINE_DIR, "scripts", "make_fake_camera.py"),
      join(RELATEANYTHING_DIR, "assets", "reel", "images", "horse.jpg"),
      SCENE_VIDEO_PATH,
    ]);
  }

  killPort(ENGINE_PORT);
  killPort(SCENE_PORT);
  killPort(WEB_PORT);
  ensureTestDatabaseMigrated(TEST_DATABASE_URL);
  await cleanupTestData();

  const engine = startPython(FACE_ENGINE_PYTHON, FACE_ENGINE_DIR, ENGINE_PORT);
  let engineOutput = "";
  engine.stdout?.on("data", (c) => (engineOutput += c));
  engine.stderr?.on("data", (c) => (engineOutput += c));

  let scene: ChildProcess | null = startPython(SCENE_PYTHON, SCENE_ENGINE_DIR, SCENE_PORT);
  let sceneOutput = "";
  scene.stdout?.on("data", (c) => (sceneOutput += c));
  scene.stderr?.on("data", (c) => (sceneOutput += c));

  const server = startDevServer(WEB_PORT);
  let serverOutput = "";
  server.stdout?.on("data", (c) => (serverOutput += c));
  server.stderr?.on("data", (c) => (serverOutput += c));

  const browsers: Browser[] = [];
  try {
    await waitForServer(ENGINE_BASE + "/health", 60000);
    await waitForServer(SCENE_BASE + "/health", 180000);
    await waitForServer(BASE, 30000);

    const face = await launchWithCamera(FACE_VIDEO_PATH);
    browsers.push(face.browser);
    const page = face.page;

    // Setup, users, enrollment, and the alert watchlist.
    await page.goto(BASE + "/");
    await page.waitForURL(/\/setup$/, { timeout: 10000 });
    await page.fill('input[name="name"]', ADMIN.name);
    await page.fill('input[name="email"]', ADMIN.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Create admin account")');
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 });

    await createUser(page, SECURITY, "SECURITY");
    await createUser(page, EMPLOYEE, "EMPLOYEE");

    await page.goto(BASE + "/enroll");
    const employeeOptionValue = await page.$eval(
      `#userId option:has-text("${EMPLOYEE.name}")`,
      (el) => (el as HTMLOptionElement).value,
    );
    await page.selectOption("#userId", employeeOptionValue);
    await page.waitForSelector("video", { timeout: 10000 });
    await page.waitForTimeout(1000);
    await enrollAllAngles(page);
    report("admin enrolls the employee across all 5 angles", true);

    await page.goto(BASE + "/config");
    await page.fill("#sceneAlertWatchlist", "Riding,  holding knife\nclimbing");
    await page.click('button:has-text("Save")');
    await page.waitForSelector("text=Saved.", { timeout: 10000 });
    const config = await prisma.systemConfig.findFirst();
    report(
      "watchlist is saved normalized (lowercase, comma-separated)",
      config?.sceneAlertWatchlist === "riding, holding knife, climbing",
    );

    // Camera 1 — face photo: a recognized, logged movement, and proof
    // scene-engine answered (not "offline").
    await page.click('button:has-text("Log out")');
    await page.waitForURL(/\/login$/, { timeout: 10000 });
    await login(page, SECURITY.email);
    await addCameraTile(page, "Lobby");
    await page.waitForSelector(`text=${EMPLOYEE.name} — logged`, { timeout: 60000 });
    report("Security camera recognizes and logs the enrolled employee", true);
    await page.waitForSelector("text=Seeing: person", { timeout: 20000 });
    report("tile shows what scene-engine sees in the frame (online, not offline)", true);
    await page.waitForSelector("text=Only one thing in view", { timeout: 20000 });
    report("tile explains why a lone person gets no relation", true);
    // Labeled "person" until the face loop recognizes them, then by name —
    // either way it's a box with a label over the live video.
    await page.waitForSelector(`svg text:has-text("person"), svg text:has-text("${EMPLOYEE.name}")`, { timeout: 20000 });
    report("tile draws a labeled bounding box over the live video", (await page.locator("svg rect").count()) >= 2);
    await page.waitForSelector(`svg text:has-text("${EMPLOYEE.name}")`, { timeout: 60000 });
    report("the recognized employee's name is shown on their box", true);
    const movementTable = await page.locator("table").nth(1).textContent();
    report("movement table shows the employee at the Lobby", !!movementTable?.includes(EMPLOYEE.name) && movementTable.includes("Lobby"));

    // Camera 2 — person riding a horse: a scene alert from an unrecognized person.
    const sceneCam = await launchWithCamera(SCENE_VIDEO_PATH);
    browsers.push(sceneCam.browser);
    await login(sceneCam.page, SECURITY.email);
    await addCameraTile(sceneCam.page, "Back Door");
    await sceneCam.page.waitForSelector("text=⚠ person riding horse", { timeout: 60000 });
    report("tile shows a red watchlist alert for 'person riding horse'", true);
    await sceneCam.page.waitForSelector("svg text:has-text('horse')", { timeout: 20000 });
    report(
      "alert boxes are drawn in red on the person and the horse",
      (await sceneCam.page.locator('svg rect[stroke="#ef4444"]').count()) >= 2,
    );
    await sceneCam.page.waitForSelector("table >> nth=0 >> text=person riding horse", { timeout: 15000 });
    const alertsTable = await sceneCam.page.locator("table").nth(0).textContent();
    report("scene alerts table lists it at Back Door as Unidentified", !!alertsTable?.includes("Back Door") && alertsTable.includes("Unidentified"));
    const storedAlerts = await prisma.sceneAlert.findMany({ where: { location: "Back Door" } });
    report(
      "exactly one SceneAlert row is stored (deduped across back-to-back frames)",
      storedAlerts.length === 1 && storedAlerts[0].matched === "riding" && storedAlerts[0].userId === null,
    );
    // The fast scene loop raises the alert before this tile's slower face
    // loop finishes its first scan, so wait for the face status to arrive.
    const faceStatus = await sceneCam.page
      .waitForFunction(
        () => document.body.innerText.match(/No face detected|Face not recognized|Could not verify|More than one person/)?.[0],
        undefined,
        { timeout: 30000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    console.log(`  (horse camera face status: ${faceStatus})`);
    report("that camera's face scan still reports normally alongside it", !!faceStatus);

    // scene-engine goes down: the face camera keeps working.
    scene.kill();
    scene = null;
    killPort(SCENE_PORT);
    await page.waitForSelector("text=Scene analysis offline", { timeout: 30000 });
    report("with scene-engine stopped, the tile says scene analysis is offline", true);
    await page.waitForSelector(`text=${EMPLOYEE.name} — already logged recently`, { timeout: 30000 });
    report("face recognition keeps working without scene-engine", true);
  } catch (err) {
    console.error("Web server output leading up to failure:\n" + serverOutput.slice(-4000));
    console.error("Face-engine output leading up to failure:\n" + engineOutput.slice(-3000));
    console.error("Scene-engine output leading up to failure:\n" + sceneOutput.slice(-3000));
    throw err;
  } finally {
    for (const b of browsers) await b.close();
    server.kill();
    engine.kill();
    scene?.kill();
    killPort(WEB_PORT);
    killPort(ENGINE_PORT);
    killPort(SCENE_PORT);
    await cleanupTestData();
    await prisma.$disconnect();
  }

  process.exit(summarize() ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
