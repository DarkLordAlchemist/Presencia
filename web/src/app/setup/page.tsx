import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/dal";
import { SetupForm } from "./setup-form";

// This page never touches a dynamic API (no cookies read), so without this
// Next has no signal it's per-request and prerenders it statically off
// whatever the database looked like at build time — which for a fresh
// clone is always "no user yet," freezing this page to always show the
// form even after setup is actually done.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const setUp = await hasAnyUser();
  if (setUp) redirect("/login");

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Set up Presencia
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          This looks like a fresh install. Create the first System
          Administrator account to get started — you can add HR, Manager,
          Employee, and Kiosk accounts afterward.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
