-- Matched-not-browsed lawyer selection.
--
-- Adds `match_offers` (one row per lawyer/firm offered to a user, grouped by
-- batch_id) and denormalises the intake's practice area onto `requests` so the
-- per-area cooldown and the 2-per-7-days quota can be indexed lookups instead of
-- JSON path scans.
--
-- Additive and reversible: no column is dropped, and `practice_area_id` is
-- nullable so rows written before this migration stay valid.

-- AlterTable
ALTER TABLE "requests" ADD COLUMN "practice_area_id" UUID;

-- Backfill the new column from the intake JSON. `matter` is a PracticeArea id,
-- but intake_payload is untyped Json, so only cast values that actually look
-- like a UUID and that resolve to a live practice area — anything else stays
-- NULL rather than failing the migration.
UPDATE "requests" r
SET "practice_area_id" = (r."intake_payload" ->> 'matter')::uuid
WHERE r."intake_payload" ->> 'matter' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM "practice_areas" pa
    WHERE pa."id" = (r."intake_payload" ->> 'matter')::uuid
  );

-- CreateTable
CREATE TABLE "match_offers" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "offered_account_id" UUID NOT NULL,
    "offered_role" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "matched_factors" JSONB NOT NULL DEFAULT '[]',
    "intake_snapshot" JSONB NOT NULL,
    "budget_relaxed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "request_id" UUID,

    CONSTRAINT "match_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_user_account_id_practice_area_id_created_at_idx" ON "requests"("user_account_id", "practice_area_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "match_offers_user_account_id_practice_area_id_created_at_idx" ON "match_offers"("user_account_id", "practice_area_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "match_offers_user_account_id_offered_account_id_created_at_idx" ON "match_offers"("user_account_id", "offered_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "match_offers_batch_id_idx" ON "match_offers"("batch_id");

-- CreateIndex
CREATE INDEX "match_offers_request_id_idx" ON "match_offers"("request_id");

-- AddForeignKey
ALTER TABLE "match_offers" ADD CONSTRAINT "match_offers_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_offers" ADD CONSTRAINT "match_offers_offered_account_id_fkey" FOREIGN KEY ("offered_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_offers" ADD CONSTRAINT "match_offers_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_offers" ADD CONSTRAINT "match_offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
