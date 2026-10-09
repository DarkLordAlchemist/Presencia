import { requireRole } from "@/lib/auth/dal";
import { KioskView } from "./kiosk-view";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  await requireRole("KIOSK");
  return <KioskView />;
}
