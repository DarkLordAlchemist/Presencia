/*
  Warnings:

  - Added the required column `daysOfWeek` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "punchId" TEXT,
    "requestedType" TEXT,
    "requestedTime" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CorrectionRequest_punchId_fkey" FOREIGN KEY ("punchId") REFERENCES "Punch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "snapshotJobTitle" TEXT,
    "snapshotDepartment" TEXT,
    "snapshotDateHired" DATETIME,
    "snapshotEmploymentStatus" TEXT,
    "snapshotCompensation" REAL,
    "snapshotBenefits" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificateRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CertificateRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "lockedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayPeriod_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "monthlyCompensationSnapshot" REAL NOT NULL,
    "workingDaysPerMonthSnapshot" REAL NOT NULL,
    "dailyRateSnapshot" REAL NOT NULL,
    "hourlyRateSnapshot" REAL NOT NULL,
    "issuedById" TEXT,
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payslip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payslip_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payslip_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayslipLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payslipId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayslipLineItem_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Punch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" REAL NOT NULL,
    "livenessPassed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualEntry" BOOLEAN NOT NULL DEFAULT false,
    "lateMinutes" INTEGER,
    "undertimeMinutes" INTEGER,
    "overtimeMinutes" INTEGER,
    "nightDiffMinutes" INTEGER,
    "breakMinutes" INTEGER,
    "overBreak" BOOLEAN,
    "latitude" REAL,
    "longitude" REAL,
    "address" TEXT,
    "withinGeofence" BOOLEAN,
    "ipAddress" TEXT,
    "ipAllowed" BOOLEAN,
    CONSTRAINT "Punch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Punch" ("confidence", "createdAt", "id", "livenessPassed", "timestamp", "type", "userId") SELECT "confidence", "createdAt", "id", "livenessPassed", "timestamp", "type", "userId" FROM "Punch";
DROP TABLE "Punch";
ALTER TABLE "new_Punch" RENAME TO "Punch";
CREATE TABLE "new_Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "shiftType" TEXT NOT NULL DEFAULT 'FIXED',
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("createdAt", "endTime", "id", "startTime", "updatedAt", "userId") SELECT "createdAt", "endTime", "id", "startTime", "updatedAt", "userId" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE TABLE "new_SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchThreshold" REAL NOT NULL DEFAULT 0.6,
    "livenessSensitivity" REAL NOT NULL DEFAULT 0.5,
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxBreakMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxDailyBreakMinutes" INTEGER NOT NULL DEFAULT 90,
    "nightDiffStart" TEXT NOT NULL DEFAULT '22:00',
    "nightDiffEnd" TEXT NOT NULL DEFAULT '06:00',
    "geofenceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "geofenceLat" REAL,
    "geofenceLng" REAL,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "ipLockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedIpPrefixes" TEXT,
    "payrollWebhookUrl" TEXT,
    "workingDaysPerMonth" REAL NOT NULL DEFAULT 22,
    "companyName" TEXT,
    "certificateSignatoryName" TEXT,
    "certificateSignatoryTitle" TEXT DEFAULT 'Head of Human Resources',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemConfig" ("id", "livenessSensitivity", "matchThreshold", "updatedAt") SELECT "id", "livenessSensitivity", "matchThreshold", "updatedAt" FROM "SystemConfig";
DROP TABLE "SystemConfig";
ALTER TABLE "new_SystemConfig" RENAME TO "SystemConfig";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "faceEmbeddingEnc" TEXT,
    "faceEnrolledAt" DATETIME,
    "jobTitle" TEXT,
    "department" TEXT,
    "jobDescription" TEXT,
    "dateHired" DATETIME,
    "employmentStatus" TEXT,
    "monthlyCompensation" REAL,
    "benefits" TEXT,
    "onboardedAt" DATETIME,
    "managerId" TEXT,
    CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "faceEmbeddingEnc", "faceEnrolledAt", "id", "managerId", "name", "passwordHash", "role") SELECT "createdAt", "email", "faceEmbeddingEnc", "faceEnrolledAt", "id", "managerId", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_startDate_endDate_key" ON "PayPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_userId_payPeriodId_key" ON "Payslip"("userId", "payPeriodId");
