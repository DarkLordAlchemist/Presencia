"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE", "KIOSK"];

function readRequiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function createUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole("SUPER_ADMIN");

  const name = readRequiredField(formData, "name");
  const email = readRequiredField(formData, "email")?.toLowerCase() ?? null;
  const password = formData.get("password");
  const role = formData.get("role");
  const managerId = formData.get("managerId");

  if (!name || !email) {
    return { error: "Please fill in all required fields." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (typeof role !== "string" || !VALID_ROLES.includes(role as Role)) {
    return { error: "Please choose a valid role." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "A user with that email already exists." };
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: role as Role,
      managerId: typeof managerId === "string" && managerId.length > 0 ? managerId : null,
    },
  });

  redirect("/users");
}

// Deactivation, not deletion — every punch/correction/leave/audit record a
// resigned or terminated employee is linked to has to stay intact for
// payroll and audit history, so their User row is never removed.
export async function setUserActive(userId: string, active: boolean): Promise<{ error?: string }> {
  const actor = await requireRole("SUPER_ADMIN");

  if (userId === actor.id) {
    return { error: "You can't deactivate your own account." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { error: "That user no longer exists." };
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/users");
  return {};
}
