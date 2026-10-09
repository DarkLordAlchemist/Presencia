import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/dal";
import { getSessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

// See the comment on the same export in app/page.tsx — this page redirects
// before ever touching cookies() when no user exists yet, which lets Next
// prerender it statically off build-time DB state otherwise.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const setUp = await hasAnyUser();
  if (!setUp) redirect("/setup");

  const session = await getSessionPayload();
  if (session?.userId) {
    // Not just "does a session cookie decode" — a deactivated user's old
    // cookie still decodes fine, so this has to check the real row, or a
    // deactivated account would loop between here and getCurrentUser()'s
    // own redirect back to /login.
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user?.active) redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Presencia</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to continue.</p>
        <LoginForm />
      </div>
    </div>
  );
}
