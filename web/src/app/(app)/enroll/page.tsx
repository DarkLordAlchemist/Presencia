import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { EnrollForm } from "./enroll-form";

export const dynamic = "force-dynamic";

export default async function EnrollPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const users = await prisma.user.findMany({
    where: { role: { not: "KIOSK" }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, faceEnrolledAt: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Facial enrollment
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Pick a person, then capture one clear, front-facing photo. Liveness
        is not checked here — this is an admin-supervised enrollment, not an
        unattended clock-in.
      </p>
      <EnrollForm users={users} />
    </div>
  );
}
