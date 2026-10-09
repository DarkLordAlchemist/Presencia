// Import this FIRST, before any module that touches Prisma (including
// test-utils.ts's own imports don't need it, but every test script's
// `import { prisma }` does) — it must run before src/lib/prisma.ts is
// evaluated, since that module reads process.env.DATABASE_URL at import
// time, not lazily.
//
// Tests used to share dev.db with whatever a human was doing manually in
// the app. That's exactly backwards: once real data exists there (a real
// business created while testing the UI), tests that assume "fresh,
// empty database" break — and worse, a test's cleanup could in principle
// touch real records. Tests get their own database file instead.

import "dotenv/config";
import { join } from "node:path";

export const TEST_DATABASE_URL = `file:${join(process.cwd(), "test.db").replace(/\\/g, "/")}`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
