import { requireRole } from "@/lib/auth/dal";
import { getSystemConfig } from "@/lib/actions/system-config";
import { ConfigForm } from "./config-form";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  await requireRole("SUPER_ADMIN");
  const config = await getSystemConfig();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Biometric &amp; attendance configuration
      </h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        Match threshold controls how similar a live scan must be to an
        enrolled face to count as a match. Liveness sensitivity controls how
        confident the anti-spoofing check must be. The attendance-rule
        settings control lateness/overtime/night-diff/break flags. Location
        and network settings control whether the kiosk enforces where or
        which network it can be used from.
      </p>
      <ConfigForm config={config} />
    </div>
  );
}
