import { notFound } from "next/navigation";
import { getCertificateForView } from "@/lib/actions/certificates";
import { generateCertificate } from "@/lib/certificates/templates";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function CertificateViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getCertificateForView(id);
  if (!request) notFound();

  if (request.status !== "APPROVED") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Certificate of Employment</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This request is still {request.status === "PENDING" ? "pending review" : "rejected"} — the certificate
          isn&apos;t generated until it&apos;s approved.
        </p>
      </div>
    );
  }

  const config = await prisma.systemConfig.findFirst();
  const companyName = config?.companyName?.trim() || "the Company";

  const cert = generateCertificate(
    {
      employeeName: request.user.name,
      jobTitle: request.snapshotJobTitle!,
      department: request.snapshotDepartment,
      dateHired: request.snapshotDateHired!,
      employmentStatus: request.snapshotEmploymentStatus!,
      monthlyCompensation: request.snapshotCompensation,
      benefits: request.snapshotBenefits,
    },
    {
      purpose: request.purpose,
      notes: request.notes,
      companyName,
      issuedAt: request.reviewedAt ?? request.createdAt,
    },
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-10 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 print:border-0 print:p-12 print:text-black">
        <h1 className="text-center text-xl font-bold uppercase tracking-wide">{cert.title}</h1>
        <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400 print:text-black">{companyName}</p>

        <div className="mt-10 flex flex-col gap-4 text-sm leading-relaxed">
          {cert.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="mt-20">
          <p className="w-64 border-t border-zinc-400 pt-1 text-sm font-semibold">
            {config?.certificateSignatoryName?.trim() || "—"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">
            {config?.certificateSignatoryTitle?.trim() || "Head of Human Resources"}
          </p>
        </div>
      </div>
    </div>
  );
}
