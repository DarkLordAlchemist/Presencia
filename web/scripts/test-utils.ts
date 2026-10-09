// Shared plumbing for the self-contained browser regression tests
// (test-auth-flow.ts, test-clients-flow.ts, ...): spin up a real dev
// server on a dedicated port, wait for it, and tear it down cleanly.

import { spawn, execSync, execFileSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
export const PRISMA_BIN = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));

export interface Result {
  label: string;
  passed: boolean;
}

export function makeReporter() {
  const results: Result[] = [];
  function report(label: string, passed: boolean) {
    results.push({ label, passed });
    console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
  }
  function summarize(): boolean {
    console.log("\n--- Summary ---");
    for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"}: ${r.label}`);
    return results.every((r) => r.passed);
  }
  return { report, summarize };
}

export function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        await fetch(url);
        return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return reject(new Error("server did not start in time"));
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

// `next dev` (especially under Turbopack) can leave a grandchild process
// bound to the port after the direct child is killed — child.kill() alone
// isn't reliable. Free the port at the OS level, both before starting and
// after stopping, so a failed run never leaves the port wedged for the next.
export function killPort(port: number) {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port} -sTCP:LISTEN | xargs -r kill -9`, { stdio: "ignore", shell: "/bin/sh" });
    }
  } catch {
    // nothing was listening — that's fine
  }
}

export function startDevServer(port: number): ChildProcess {
  const server = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(port)], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return server;
}

// The test database (test.db, isolated from dev.db) starts as an empty
// file with no tables — apply migrations before the first test touches
// it. Safe to call every run: `migrate deploy` is a no-op once up to date.
export function ensureTestDatabaseMigrated(databaseUrl: string) {
  try {
    // execFileSync (argument array, no shell) rather than execSync (shell
    // string) — process.execPath is "C:\Program Files\nodejs\node.exe" on
    // Windows, and an unquoted space in a shell command string breaks it.
    execFileSync(process.execPath, [PRISMA_BIN, "migrate", "deploy"], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
      timeout: 60000,
    });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    console.error("migrate deploy failed:");
    console.error(e.stdout?.toString());
    console.error(e.stderr?.toString());
    throw err;
  }
}
