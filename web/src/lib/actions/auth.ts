"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export interface FormState {
  error?: string;
}

function readRequiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function setupSuperAdmin(_prevState: FormState, formData: FormData): Promise<FormState> {
  // Defense in depth: /setup itself redirects away once a user exists, but
  // a submitted form could still race that check.
  const existing = await prisma.user.findFirst();
  if (existing) {
    return { error: "This deployment is already set up." };
  }

  const name = readRequiredField(formData, "name");
  const email = readRequiredField(formData, "email")?.toLowerCase() ?? null;
  const password = formData.get("password");

  if (!name || !email) {
    return { error: "Please fill in all fields." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    await tx.systemConfig.create({ data: {} });
    return tx.user.create({
      data: { name, email, passwordHash, role: "SUPER_ADMIN" },
    });
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = readRequiredField(formData, "email")?.toLowerCase() ?? null;
  const password = formData.get("password");

  if (!email || typeof password !== "string" || password.length === 0) {
    return { error: "Please enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = { error: "Invalid email or password." };

  if (!user) return genericError;

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) return genericError;

  if (!user.active) {
    return { error: "This account has been deactivated." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

// The kiosk terminal has no logout button by design (a shared entrance
// tablet must never let an employee nav away from it) — but that also means
// a KIOSK session's browser cookie has no in-app way out at all. This lets
// an admin re-authenticate to break out of kiosk mode deliberately, without
// handing every kiosk user a plain logout button.
export async function exitKiosk(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = readRequiredField(formData, "email")?.toLowerCase() ?? null;
  const password = formData.get("password");

  if (!email || typeof password !== "string" || password.length === 0) {
    return { error: "Please enter an admin email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = { error: "Invalid email or password." };

  if (!user || !["SUPER_ADMIN", "HR_ADMIN"].includes(user.role)) return genericError;

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) return genericError;

  await deleteSession();
  redirect("/login");
}
