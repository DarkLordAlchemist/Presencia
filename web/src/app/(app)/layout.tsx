import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { logout } from "@/lib/actions/auth";
import type { Role } from "@/generated/prisma/client";

const NAV_LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { href: "/whos-in", label: "Who's In", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  { href: "/security", label: "Security", roles: ["SUPER_ADMIN", "SECURITY"] },
  { href: "/users", label: "Users", roles: ["SUPER_ADMIN"] },
  { href: "/config", label: "Biometric config", roles: ["SUPER_ADMIN"] },
  { href: "/enroll", label: "Enroll", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { href: "/onboarding", label: "Onboarding", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { href: "/schedules", label: "Schedules", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] },
  { href: "/leave", label: "Leave & Requests", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { href: "/corrections", label: "Corrections", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { href: "/certificates", label: "Certificates", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { href: "/payroll", label: "Payroll", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { href: "/holidays", label: "Holidays", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { href: "/payslips", label: "Payslips", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { href: "/audit", label: "Audit Log", roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { href: "/logs", label: "My logs", roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // The Kiosk/Device role gets its own locked-down layout at /kiosk — it
  // must never see this nav, the logout button, or any other admin route.
  if (user.role === "KIOSK") redirect("/kiosk");

  const links = NAV_LINKS.filter((link) => link.roles.includes(user.role));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 print:hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {user.name} · {user.role.replaceAll("_", " ")}
            </p>
            <nav className="mt-1 flex gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
