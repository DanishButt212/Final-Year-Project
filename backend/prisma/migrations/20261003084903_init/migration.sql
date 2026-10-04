-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LITIGANT', 'LAWYER', 'INTERN', 'PROCESS_SERVER', 'JUDGE', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourtType" AS ENUM ('DISTRICT_SESSIONS', 'HIGH_COURT');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('CIVIL_SUIT', 'CRIMINAL_APPEAL', 'WRIT_PETITION', 'BAIL_APPLICATION');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'FILED', 'UNDER_SCRUTINY', 'ALLOCATED', 'PENDING', 'HEARING_FIXED', 'DECIDED', 'REJECTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('PETITIONER', 'RESPONDENT', 'APPELLANT', 'ACCUSED', 'COMPLAINANT', 'WITNESS');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PLEADING', 'ORDER', 'JUDGMENT', 'ANNEXURE', 'OTHER');

-- CreateEnum
CREATE TYPE "HearingType" AS ENUM ('PHYSICAL', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "HearingStatus" AS ENUM ('SCHEDULED', 'HELD', 'ADJOURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CauseListStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ChallanStatus" AS ENUM ('UNPAID', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MOCK_CARD', 'MOCK_WALLET', 'MOCK_BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SummonsStatus" AS ENUM ('PENDING', 'ASSIGNED', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RetainerTxType" AS ENUM ('DEPOSIT', 'DEDUCTION', 'REFUND');

-- CreateEnum
CREATE TYPE "DiaryReviewStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('JUDGE', 'LAWYER', 'LITIGANT', 'OBSERVER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "cnic" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "profileImage" TEXT,
    "courtId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "barNumber" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "certificateIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CourtType" NOT NULL,
    "city" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courtroom" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "benchNo" INTEGER,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courtroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "ucn" TEXT NOT NULL,
    "caseType" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "reliefSought" TEXT NOT NULL,
    "filingDate" DATE,
    "filedById" TEXT NOT NULL,
    "courtId" TEXT,
    "courtroomId" TEXT,
    "judgeId" TEXT,
    "allocatedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseParty" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "name" TEXT NOT NULL,
    "cnic" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "lawyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDocument" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'PLEADING',
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "courtroomId" TEXT,
    "judgeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeSlot" INTEGER NOT NULL,
    "startTime" TEXT,
    "type" "HearingType" NOT NULL DEFAULT 'PHYSICAL',
    "status" "HearingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "purpose" TEXT,
    "orderSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CauseList" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "CauseListStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CauseList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CauseListEntry" (
    "id" TEXT NOT NULL,
    "causeListId" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,

    CONSTRAINT "CauseListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "caseType" "CaseType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challan" (
    "id" TEXT NOT NULL,
    "challanNo" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ChallanStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRef" TEXT,
    "receiptNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summons" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT,
    "serverId" TEXT,
    "status" "SummonsStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueBy" DATE,
    "deliveredAt" TIMESTAMP(3),
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "photoPath" TEXT,
    "recipientName" TEXT,
    "signaturePath" TEXT,
    "remarks" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Summons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternDiaryEntry" (
    "id" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "reviewStatus" "DiaryReviewStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternDiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "distanceMeters" INTEGER,
    "withinGeofence" BOOLEAN NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamberClient" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnic" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChamberClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillableEntry" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "workedOn" DATE NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerTransaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "RetainerTxType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "billableEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamberExpense" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "clientId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "spentOn" DATE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamberExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSession" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "CourtSessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_cnic_key" ON "User"("cnic");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_courtId_idx" ON "User"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_userId_key" ON "LawyerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawyerProfile_barNumber_key" ON "LawyerProfile"("barNumber");

-- CreateIndex
CREATE INDEX "LawyerProfile_verificationStatus_idx" ON "LawyerProfile"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InternProfile_userId_key" ON "InternProfile"("userId");

-- CreateIndex
CREATE INDEX "InternProfile_supervisorId_idx" ON "InternProfile"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Court_name_key" ON "Court"("name");

-- CreateIndex
CREATE INDEX "Court_city_idx" ON "Court"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Courtroom_courtId_name_key" ON "Courtroom"("courtId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Case_ucn_key" ON "Case"("ucn");

-- CreateIndex
CREATE INDEX "Case_filedById_idx" ON "Case"("filedById");

-- CreateIndex
CREATE INDEX "Case_judgeId_status_idx" ON "Case"("judgeId", "status");

-- CreateIndex
CREATE INDEX "Case_courtId_status_idx" ON "Case"("courtId", "status");

-- CreateIndex
CREATE INDEX "Case_caseType_status_idx" ON "Case"("caseType", "status");

-- CreateIndex
CREATE INDEX "Case_filingDate_idx" ON "Case"("filingDate");

-- CreateIndex
CREATE INDEX "CaseParty_caseId_idx" ON "CaseParty"("caseId");

-- CreateIndex
CREATE INDEX "CaseParty_lawyerId_caseId_idx" ON "CaseParty"("lawyerId", "caseId");

-- CreateIndex
CREATE INDEX "CaseDocument_caseId_type_idx" ON "CaseDocument"("caseId", "type");

-- CreateIndex
CREATE INDEX "Evidence_caseId_idx" ON "Evidence"("caseId");

-- CreateIndex
CREATE INDEX "Hearing_caseId_idx" ON "Hearing"("caseId");

-- CreateIndex
CREATE INDEX "Hearing_date_status_idx" ON "Hearing"("date", "status");

-- CreateIndex
CREATE INDEX "Hearing_courtroomId_date_idx" ON "Hearing"("courtroomId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_judgeId_date_timeSlot_key" ON "Hearing"("judgeId", "date", "timeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "CauseList_courtId_date_key" ON "CauseList"("courtId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CauseListEntry_hearingId_key" ON "CauseListEntry"("hearingId");

-- CreateIndex
CREATE UNIQUE INDEX "CauseListEntry_causeListId_serialNo_key" ON "CauseListEntry"("causeListId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_caseType_effectiveFrom_key" ON "FeeStructure"("caseType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Challan_challanNo_key" ON "Challan"("challanNo");

-- CreateIndex
CREATE INDEX "Challan_caseId_idx" ON "Challan"("caseId");

-- CreateIndex
CREATE INDEX "Challan_payerId_status_idx" ON "Challan"("payerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayRef_key" ON "Payment"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE INDEX "Payment_challanId_idx" ON "Payment"("challanId");

-- CreateIndex
CREATE INDEX "Payment_payerId_status_idx" ON "Payment"("payerId", "status");

-- CreateIndex
CREATE INDEX "Summons_caseId_idx" ON "Summons"("caseId");

-- CreateIndex
CREATE INDEX "Summons_serverId_status_idx" ON "Summons"("serverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InternDiaryEntry_internId_entryDate_key" ON "InternDiaryEntry"("internId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_internId_date_key" ON "Attendance"("internId", "date");

-- CreateIndex
CREATE INDEX "ChamberClient_lawyerId_idx" ON "ChamberClient"("lawyerId");

-- CreateIndex
CREATE INDEX "BillableEntry_lawyerId_workedOn_idx" ON "BillableEntry"("lawyerId", "workedOn");

-- CreateIndex
CREATE INDEX "BillableEntry_clientId_idx" ON "BillableEntry"("clientId");

-- CreateIndex
CREATE INDEX "RetainerTransaction_clientId_createdAt_idx" ON "RetainerTransaction"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ChamberExpense_lawyerId_spentOn_idx" ON "ChamberExpense"("lawyerId", "spentOn");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSession_hearingId_key" ON "CourtSession"("hearingId");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSession_roomName_key" ON "CourtSession"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSessionParticipant_sessionId_userId_key" ON "CourtSessionParticipant"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerProfile" ADD CONSTRAINT "LawyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawyerProfile" ADD CONSTRAINT "LawyerProfile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternProfile" ADD CONSTRAINT "InternProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternProfile" ADD CONSTRAINT "InternProfile_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courtroom" ADD CONSTRAINT "Courtroom_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_courtroomId_fkey" FOREIGN KEY ("courtroomId") REFERENCES "Courtroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocument" ADD CONSTRAINT "CaseDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocument" ADD CONSTRAINT "CaseDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_courtroomId_fkey" FOREIGN KEY ("courtroomId") REFERENCES "Courtroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CauseList" ADD CONSTRAINT "CauseList_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CauseList" ADD CONSTRAINT "CauseList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CauseListEntry" ADD CONSTRAINT "CauseListEntry_causeListId_fkey" FOREIGN KEY ("causeListId") REFERENCES "CauseList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CauseListEntry" ADD CONSTRAINT "CauseListEntry_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challan" ADD CONSTRAINT "Challan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challan" ADD CONSTRAINT "Challan_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "Challan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summons" ADD CONSTRAINT "Summons_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summons" ADD CONSTRAINT "Summons_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "CaseParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summons" ADD CONSTRAINT "Summons_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternDiaryEntry" ADD CONSTRAINT "InternDiaryEntry_internId_fkey" FOREIGN KEY ("internId") REFERENCES "InternProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternDiaryEntry" ADD CONSTRAINT "InternDiaryEntry_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_internId_fkey" FOREIGN KEY ("internId") REFERENCES "InternProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberClient" ADD CONSTRAINT "ChamberClient_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableEntry" ADD CONSTRAINT "BillableEntry_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableEntry" ADD CONSTRAINT "BillableEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ChamberClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableEntry" ADD CONSTRAINT "BillableEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerTransaction" ADD CONSTRAINT "RetainerTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ChamberClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerTransaction" ADD CONSTRAINT "RetainerTransaction_billableEntryId_fkey" FOREIGN KEY ("billableEntryId") REFERENCES "BillableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberExpense" ADD CONSTRAINT "ChamberExpense_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "LawyerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamberExpense" ADD CONSTRAINT "ChamberExpense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ChamberClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSession" ADD CONSTRAINT "CourtSession_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSession" ADD CONSTRAINT "CourtSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSessionParticipant" ADD CONSTRAINT "CourtSessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourtSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSessionParticipant" ADD CONSTRAINT "CourtSessionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
