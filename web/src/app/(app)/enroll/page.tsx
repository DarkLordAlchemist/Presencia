import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { EnrollForm } from "./enroll-form";

export const dynamic = "force-dynamic";

export default async function EnrollPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const users = await prisma.user.findMany({
    where: { role: { not: "KIOSK" }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, _count: { select: { faceEmbeddings: true } } },
  });
  const options = users.map((u) => ({ id: u.id, name: u.name, email: u.email, angleCount: u._count.faceEmbeddings }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Facial enrollment
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Pick a person, then capture up to five angles — straight ahead,
        slight left and right, chin up and down. More angles means a scan
        at a door or kiosk still matches when someone isn&apos;t facing the
        camera squarely. Each photo is checked as it&apos;s taken. Liveness
        is not checked here — this is an admin-supervised enrollment, not an
        unattended clock-in.
      </p>
      <EnrollForm users={options} />
    </div>
  );
}
