// Pure Certificate of Employment text generation — no I/O, no Prisma, so
// it's unit-testable without a database. Takes a SNAPSHOT (the employee's
// HR record as it stood at approval time), not a live user record — a COE
// is a point-in-time document and must read the same on re-print months
// later even if the employee's onboarding record has since changed.

import type { CertificatePurpose, EmploymentStatus } from "@/generated/prisma/client";

export interface CertificateSnapshot {
  employeeName: string;
  jobTitle: string;
  department: string | null;
  dateHired: Date;
  employmentStatus: EmploymentStatus;
  monthlyCompensation: number | null;
  benefits: string | null;
}

export interface CertificateContext {
  purpose: CertificatePurpose;
  notes: string | null;
  companyName: string;
  issuedAt: Date;
}

export interface GeneratedCertificate {
  title: string;
  paragraphs: string[];
}

export const PURPOSE_LABELS: Record<CertificatePurpose, string> = {
  GENERAL: "General / Local Employment",
  GOVERNMENT_TRANSACTION: "Government Transaction (SSS/PhilHealth/Pag-IBIG/BIR)",
  BANK_LOAN: "Bank / Loan Application",
  VISA_TRAVEL: "Visa / Travel Application",
};

const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  PROBATIONARY: "probationary",
  REGULAR: "regular",
  CONTRACTUAL: "contractual",
  PROJECT_BASED: "project-based",
};

export function formatCertificateDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compensationClause(snapshot: CertificateSnapshot): string {
  const compPart =
    snapshot.monthlyCompensation != null
      ? `a monthly compensation of ${formatPeso(snapshot.monthlyCompensation)}`
      : "compensation on record with the company";
  const benefitsPart = snapshot.benefits?.trim()
    ? `, inclusive of the following benefits: ${snapshot.benefits.trim()}`
    : "";
  return `${snapshot.employeeName} receives ${compPart}${benefitsPart}.`;
}

export function generateCertificate(
  snapshot: CertificateSnapshot,
  ctx: CertificateContext,
): GeneratedCertificate {
  const statusLabel = EMPLOYMENT_STATUS_LABELS[snapshot.employmentStatus];
  const deptClause = snapshot.department ? ` under the ${snapshot.department} department` : "";

  const opening =
    `This is to certify that ${snapshot.employeeName} is a bona fide ${statusLabel} employee of ` +
    `${ctx.companyName}, holding the position of ${snapshot.jobTitle}${deptClause}, since ` +
    `${formatCertificateDate(snapshot.dateHired)}.`;

  const paragraphs = [opening];

  if (ctx.purpose === "GOVERNMENT_TRANSACTION") {
    const agency = ctx.notes?.trim() ? ctx.notes.trim() : "a government agency";
    paragraphs.push(
      `This certification is issued upon the request of the employee for purposes of transacting with ${agency}.`,
    );
  } else if (ctx.purpose === "BANK_LOAN") {
    paragraphs.push(compensationClause(snapshot));
    paragraphs.push(
      "This certification is issued upon the request of the employee for purposes of a bank/loan application.",
    );
  } else if (ctx.purpose === "VISA_TRAVEL") {
    paragraphs.push(compensationClause(snapshot));
    paragraphs.push(
      `This certification is further issued to support ${snapshot.employeeName}'s visa/travel application, and ` +
        `to confirm that ${snapshot.employeeName} remains in good standing with the company, with the intention ` +
        `of returning to employment upon completion of travel.`,
    );
  } else {
    paragraphs.push("This certification is issued for whatever legal purpose it may serve.");
  }

  paragraphs.push(`Issued this ${formatCertificateDate(ctx.issuedAt)}, upon the request of the employee named above.`);

  return {
    title: `Certificate of Employment`,
    paragraphs,
  };
}
