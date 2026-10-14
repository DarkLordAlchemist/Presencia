import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { UserActiveToggle } from "@/components/user-active-toggle";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await requireRole("SUPER_ADMIN");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { manager: { select: { name: true } }, _count: { select: { faceEmbeddings: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
        <Link
          href="/users/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New user
        </Link>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Manager</th>
            <th className="py-2 pr-4">Face enrolled</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{u.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{u.email}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {u.role.replaceAll("_", " ")}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {u.manager?.name ?? "—"}
              </td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                {u._count.faceEmbeddings > 0
                  ? `Yes (${u._count.faceEmbeddings} angle${u._count.faceEmbeddings === 1 ? "" : "s"})`
                  : "No"}
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    u.active
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {u.active ? "Active" : "Deactivated"}
                </span>
              </td>
              <td className="py-2 pr-4">
                {u.id !== currentUser.id && <UserActiveToggle userId={u.id} active={u.active} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
