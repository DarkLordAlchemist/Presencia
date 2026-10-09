import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { getOnboardingCandidates } from "@/lib/actions/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  const users = await getOnboardingCandidates();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Onboarding</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        HR record for each employee — job title, department, date hired, employment status,
        compensation, and benefits. Required before that employee can request a Certificate of
        Employment.
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Onboarding</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{u.name}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{u.email}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{u.role.replaceAll("_", " ")}</td>
              <td className="py-2 pr-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    u.onboardedAt
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {u.onboardedAt ? "Complete" : "Pending"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <Link
                  href={`/onboarding/${u.id}`}
                  className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {u.onboardedAt ? "Edit details" : "Onboard"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
