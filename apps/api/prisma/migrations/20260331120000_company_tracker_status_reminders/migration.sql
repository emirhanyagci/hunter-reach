-- CreateEnum
CREATE TYPE "CompanyTrackerStatus" AS ENUM ('INTERESTED', 'PLANNED', 'APPLIED', 'REMINDER_SET', 'ARCHIVED');

-- AlterTable
ALTER TABLE "company_notes" ADD COLUMN "status" "CompanyTrackerStatus" NOT NULL DEFAULT 'INTERESTED';
ALTER TABLE "company_notes" ADD COLUMN "source_contact_id" TEXT;
ALTER TABLE "company_notes" ADD COLUMN "applied_at" TIMESTAMP(3);
ALTER TABLE "company_notes" ADD COLUMN "reminder_at" TIMESTAMP(3);
ALTER TABLE "company_notes" ADD COLUMN "reminder_timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "company_notes" ADD COLUMN "reminder_recurrence_days" INTEGER;
ALTER TABLE "company_notes" ADD COLUMN "reminder_stop_on_applied" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_notes" ADD COLUMN "last_reminder_sent_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "company_notes" ADD CONSTRAINT "company_notes_source_contact_id_fkey" FOREIGN KEY ("source_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Helpful index for the reminder worker
CREATE INDEX "company_notes_reminder_at_idx" ON "company_notes"("reminder_at");
