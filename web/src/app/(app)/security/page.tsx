import { requireRole } from "@/lib/auth/dal";
import { getRecentMovementLogs } from "@/lib/actions/security";
import { SecurityView } from "./security-view";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireRole("SUPER_ADMIN", "SECURITY");

  const logs = await getRecentMovementLogs();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Security — camera monitoring</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Add a camera, pick which physical device it is and give it a
        location label. Each camera scans on its own and logs a recognized,
        live face automatically — no one has to confirm anything.
      </p>
      <SecurityView initialLogs={logs} />
    </div>
  );
}
