import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { NewUserForm } from "./new-user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireRole("SUPER_ADMIN");

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New user</h1>
      <NewUserForm managers={managers} />
    </div>
  );
}
