import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/dal";
import { getSessionPayload } from "@/lib/auth/session";

// Every branch here redirects before this page renders anything, and some
// of those branches return before ever calling cookies() — so Next's
// static-analysis can't always tell the route is per-request and will
// prerender (and freeze) whichever branch the build-time DB state hits.
// Force dynamic so the user-exists/session check runs fresh every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const setUp = await hasAnyUser();
  if (!setUp) redirect("/setup");

  const session = await getSessionPayload();
  redirect(session?.userId ? "/dashboard" : "/login");
}
