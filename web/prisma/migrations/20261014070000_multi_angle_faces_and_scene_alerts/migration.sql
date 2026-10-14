-- AlterTable
ALTER TABLE "MovementLog" ADD COLUMN "activity" TEXT;

-- CreateTable
CREATE TABLE "FaceEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "embeddingEnc" TEXT NOT NULL,
    "pose" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FaceEmbedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Carry every existing single-photo enrollment over as a "legacy" pose
-- row, so nobody has to re-enroll before faceEmbeddingEnc is dropped below.
INSERT INTO "FaceEmbedding" ("id", "userId", "embeddingEnc", "pose", "createdAt")
SELECT 'c' || lower(hex(randomblob(12))), "id", "faceEmbeddingEnc", 'legacy', COALESCE("faceEnrolledAt", CURRENT_TIMESTAMP)
FROM "User" WHERE "faceEmbeddingEnc" IS NOT NULL;

-- CreateTable
CREATE TABLE "SceneAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "location" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "matched" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "sceneAlertWatchlist" TEXT NOT NULL DEFAULT 'holding knife, holding scissors, holding baseball bat, climbing, jumping over, lying on, hitting, kicking, fighting with',
    "sceneAlertMinScore" REAL NOT NULL DEFAULT 0.4,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemConfig" ("allowedIpPrefixes", "certificateSignatoryName", "certificateSignatoryTitle", "companyName", "geofenceEnabled", "geofenceLat", "geofenceLng", "geofenceRadiusMeters", "gracePeriodMinutes", "id", "ipLockEnabled", "livenessSensitivity", "matchThreshold", "maxBreakMinutes", "maxDailyBreakMinutes", "nightDiffEnd", "nightDiffStart", "payrollWebhookUrl", "updatedAt", "workingDaysPerMonth") SELECT "allowedIpPrefixes", "certificateSignatoryName", "certificateSignatoryTitle", "companyName", "geofenceEnabled", "geofenceLat", "geofenceLng", "geofenceRadiusMeters", "gracePeriodMinutes", "id", "ipLockEnabled", "livenessSensitivity", "matchThreshold", "maxBreakMinutes", "maxDailyBreakMinutes", "nightDiffEnd", "nightDiffStart", "payrollWebhookUrl", "updatedAt", "workingDaysPerMonth" FROM "SystemConfig";
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
INSERT INTO "new_User" ("active", "benefits", "createdAt", "dateHired", "department", "email", "employmentStatus", "faceEnrolledAt", "id", "jobDescription", "jobTitle", "managerId", "monthlyCompensation", "name", "onboardedAt", "passwordHash", "role") SELECT "active", "benefits", "createdAt", "dateHired", "department", "email", "employmentStatus", "faceEnrolledAt", "id", "jobDescription", "jobTitle", "managerId", "monthlyCompensation", "name", "onboardedAt", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FaceEmbedding_userId_idx" ON "FaceEmbedding"("userId");

