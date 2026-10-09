import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  getMyCertificateRequests,
  getPendingCertificateRequests,
  getCertificateEligibleUsers,
} from "@/lib/actions/certificates";
import { PURPOSE_LABELS } from "@/lib/certificates/templates";
import { CertificateRequestForm } from "./certificate-request-form";
import { ReviewButtons } from "@/components/review-buttons";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

export default async function CertificatesPage() {
  const user = await getCurrentUser();
  const [myRequests, pending, eligibleUsers] = await Promise.all([
    getMyCertificateRequests(),
    getPendingCertificateRequests(),
    getCertificateEligibleUsers(),
  ]);
  const canReview = ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Certificates</h1>
      <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
        Request a Certificate of Employment — once approved, it&apos;s generated automatically from
        your HR onboarding record.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Request a certificate</h2>
      <CertificateRequestForm eligibleUsers={eligibleUsers} />

      <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">My requests</h3>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="py-2 pr-4">Purpose</th>
            <th className="py-2 pr-4">Requested</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {myRequests.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{PURPOSE_LABELS[r.purpose]}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.createdAt)}</td>
              <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.status}</td>
              <td className="py-2 pr-4">
                {r.status === "APPROVED" && (
                  <Link
                    href={`/certificates/${r.id}`}
                    className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                  >
                    View / Print
                  </Link>
                )}
              </td>
            </tr>
          ))}
          {myRequests.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                No requests filed yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canReview && (
        <>
          <h3 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pending certificate approvals</h3>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Purpose</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2 pr-4">Requested</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{r.user.name}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{PURPOSE_LABELS[r.purpose]}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{r.notes ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{fmt(r.createdAt)}</td>
                  <td className="py-2 pr-4">
                    <ReviewButtons requestId={r.id} kind="certificate" />
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    Nothing pending.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
