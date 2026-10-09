import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";
import { getSessionPayload } from "./session";

// Memoized per request: safe to call from multiple components without
// re-reading the cookie or re-hitting the database each time.
export const verifySession = cache(async () => {
  const payload = await getSessionPayload();
  if (!payload?.userId) {
    redirect("/login");
  }
  return { userId: payload.userId };
});

export const getCurrentUser = cache(async () => {
  const { userId } = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    // Can't also clear the session cookie here — cookies() can only be
    // mutated from a Server Action or Route Handler, and getCurrentUser()
    // is called from plain page renders too. /login's own check (below)
    // re-verifies the user is real and active before ever honoring this
    // cookie, so the stale cookie is harmless, just not deleted yet.
    redirect("/login");
  }
  return user;
});

// Call at the top of any role-restricted route/Server Action — leaf routes
// must do their own check even under a role-gated layout, since client-side
// navigation can reach a leaf page without re-running the layout's server
// logic (same principle applied throughout Lista's auth).
export async function requireRole(...allowed: Role[]) {
  const user = await getCurrentUser();
  if (!allowed.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

// A fresh Presencia deployment has no users yet — every route should bounce
// to /setup instead of showing a login form for an account that can't exist.
export const hasAnyUser = cache(async () => {
  const count = await prisma.user.count();
  return count > 0;
});
