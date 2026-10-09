import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getOnboardingRecord } from "@/lib/actions/onboarding";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  const { userId } = await params;
  const user = await getOnboardingRecord(userId);
  if (!user) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Onboarding — {user.name}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
      <OnboardingForm user={user} />
    </div>
  );
}
