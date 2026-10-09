// Pure unit tests for src/lib/certificates/templates.ts — no DB.
import { generateCertificate, formatPeso, formatCertificateDate } from "../src/lib/certificates/templates";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label}`);
  }
}

const baseSnapshot = {
  employeeName: "Juana Dela Cruz",
  jobTitle: "Software Engineer",
  department: "Engineering",
  dateHired: new Date("2023-06-01T00:00:00Z"),
  employmentStatus: "REGULAR" as const,
  monthlyCompensation: 45000,
  benefits: "HMO, 13th month pay",
};

const baseCtx = {
  purpose: "GENERAL" as const,
  notes: null,
  companyName: "ACME Corporation",
  issuedAt: new Date("2026-09-27T00:00:00Z"),
};

function main() {
  check("formatPeso formats with two decimals and a peso sign", formatPeso(45000) === "₱45,000.00");
  check("formatCertificateDate renders a long-form date", formatCertificateDate(new Date("2023-06-01T00:00:00Z")).includes("2023"));

  const general = generateCertificate(baseSnapshot, baseCtx);
  check("GENERAL includes the employee name", general.paragraphs[0].includes("Juana Dela Cruz"));
  check("GENERAL includes the company name", general.paragraphs[0].includes("ACME Corporation"));
  check("GENERAL includes the job title", general.paragraphs[0].includes("Software Engineer"));
  check("GENERAL includes the department", general.paragraphs[0].includes("Engineering"));
  check("GENERAL does NOT mention compensation", !general.paragraphs.some((p) => p.includes("compensation")));
  check("GENERAL closes with a generic legal-purpose clause", general.paragraphs.some((p) => p.includes("legal purpose")));

  const noDept = generateCertificate({ ...baseSnapshot, department: null }, baseCtx);
  check("no department omits the department clause entirely", !noDept.paragraphs[0].includes("department"));

  const govt = generateCertificate(baseSnapshot, { ...baseCtx, purpose: "GOVERNMENT_TRANSACTION", notes: "SSS" });
  check("GOVERNMENT_TRANSACTION names the specific agency from notes", govt.paragraphs.some((p) => p.includes("SSS")));

  const govtNoNotes = generateCertificate(baseSnapshot, { ...baseCtx, purpose: "GOVERNMENT_TRANSACTION", notes: null });
  check(
    "GOVERNMENT_TRANSACTION falls back to a generic agency phrase with no notes",
    govtNoNotes.paragraphs.some((p) => p.includes("a government agency")),
  );

  const loan = generateCertificate(baseSnapshot, { ...baseCtx, purpose: "BANK_LOAN" });
  check("BANK_LOAN includes the peso compensation figure", loan.paragraphs.some((p) => p.includes("₱45,000.00")));
  check("BANK_LOAN includes the benefits text", loan.paragraphs.some((p) => p.includes("HMO")));
  check("BANK_LOAN mentions the loan purpose", loan.paragraphs.some((p) => p.includes("loan")));

  const loanNoComp = generateCertificate({ ...baseSnapshot, monthlyCompensation: null, benefits: null }, {
    ...baseCtx,
    purpose: "BANK_LOAN",
  });
  check(
    "BANK_LOAN with no stored compensation falls back to generic wording, not a blank/undefined",
    loanNoComp.paragraphs.some((p) => p.includes("compensation on record")),
  );

  const visa = generateCertificate(baseSnapshot, { ...baseCtx, purpose: "VISA_TRAVEL" });
  check("VISA_TRAVEL includes the peso compensation figure", visa.paragraphs.some((p) => p.includes("₱45,000.00")));
  check("VISA_TRAVEL mentions travel/visa", visa.paragraphs.some((p) => p.toLowerCase().includes("visa")));
  check(
    "VISA_TRAVEL states intent to return to employment",
    visa.paragraphs.some((p) => p.includes("returning to employment")),
  );

  const probationary = generateCertificate({ ...baseSnapshot, employmentStatus: "PROBATIONARY" }, baseCtx);
  check("employment status wording reflects PROBATIONARY", probationary.paragraphs[0].includes("probationary"));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
