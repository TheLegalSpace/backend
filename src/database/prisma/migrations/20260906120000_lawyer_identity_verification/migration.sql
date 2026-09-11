-- Lawyer identity verification: bar details, NIN check, SCN disputes.
--
-- The professional signup wizard now verifies identity before it takes money:
-- bar details -> Call to Bar certificate -> NIN -> admin review -> plan. Two
-- structural consequences are encoded here.
--
-- 1. The satellite profile is created at the BAR-DETAILS step, not at setup,
--    because `verification_status` lives on it and every step after 4 needs a
--    status. Its unique index on `scn` is therefore also the SCN reservation --
--    two registrants can never both get past the bar-details step on one SCN.
--
-- 2. Because the satellite now exists long before onboarding finishes, its
--    presence no longer means "profile complete". `accounts.profile_completed_at`
--    carries that instead, and is backfilled at the bottom of this file for
--    every account that completed under the old rule.
--
-- The NIN itself is never stored: the consent copy on the screen promises it is
-- not, so only the verdict, the provider reference and the timestamp are kept.
--
-- Additive and reversible: every new column is nullable or defaulted, and the
-- one new table is new.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "profile_completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lawyer_profiles" ADD COLUMN     "application_submitted_at" TIMESTAMP(3),
ADD COLUMN     "bar_full_name" TEXT,
ADD COLUMN     "identity_check_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "identity_check_reference" TEXT,
ADD COLUMN     "identity_check_status" TEXT,
ADD COLUMN     "identity_checked_at" TIMESTAMP(3),
ADD COLUMN     "nba_check_status" TEXT,
ADD COLUMN     "nba_checked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "verification_documents" ADD COLUMN     "dispute_id" UUID;

-- CreateTable
CREATE TABLE "scn_disputes" (
    "id" UUID NOT NULL,
    "case_reference" TEXT NOT NULL,
    "scn" TEXT NOT NULL,
    "claimant_account_id" UUID NOT NULL,
    "existing_account_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "claimant_statement" TEXT,
    "resolution_note" TEXT,
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scn_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scn_disputes_case_reference_key" ON "scn_disputes"("case_reference");

-- CreateIndex
CREATE INDEX "scn_disputes_status_created_at_idx" ON "scn_disputes"("status", "created_at");

-- CreateIndex
CREATE INDEX "scn_disputes_scn_idx" ON "scn_disputes"("scn");

-- CreateIndex
CREATE UNIQUE INDEX "scn_disputes_claimant_account_id_scn_key" ON "scn_disputes"("claimant_account_id", "scn");

-- CreateIndex
CREATE INDEX "verification_documents_dispute_id_idx" ON "verification_documents"("dispute_id");

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "scn_disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scn_disputes" ADD CONSTRAINT "scn_disputes_claimant_account_id_fkey" FOREIGN KEY ("claimant_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scn_disputes" ADD CONSTRAINT "scn_disputes_existing_account_id_fkey" FOREIGN KEY ("existing_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scn_disputes" ADD CONSTRAINT "scn_disputes_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the new completeness signal. Under the old rule a satellite profile
-- only existed once setup had run, so every account that has one today is
-- complete by definition. Without this, `requireCompletedProfile` would treat
-- every existing lawyer and firm as mid-onboarding and 403 them.
UPDATE "accounts" a
SET "profile_completed_at" = COALESCE(lp."created_at", fp."created_at", a."created_at")
FROM "accounts" a2
LEFT JOIN "lawyer_profiles" lp ON lp."account_id" = a2."id"
LEFT JOIN "firm_profiles"   fp ON fp."account_id" = a2."id"
WHERE a."id" = a2."id"
  AND a."profile_completed_at" IS NULL
  AND (lp."id" IS NOT NULL OR fp."id" IS NOT NULL);

-- Existing lawyer/firm rows keep whatever verification_status they already
-- carry. Only accounts created from here on start at 'pending'.
