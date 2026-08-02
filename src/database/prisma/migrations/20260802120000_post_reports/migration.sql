-- Post reporting / content moderation.

-- Moderation counters on posts. `report_count` is the number of OPEN reports;
-- `auto_hidden_at` is stamped when that count crosses the auto-hide threshold.
ALTER TABLE "posts" ADD COLUMN "report_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "posts" ADD COLUMN "auto_hidden_at" TIMESTAMP(3);

CREATE TABLE "post_reports" (
  "id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "reporter_account_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by_admin_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

-- One report per reporter per post — makes reporting idempotent.
CREATE UNIQUE INDEX "post_reports_post_id_reporter_account_id_key"
  ON "post_reports"("post_id", "reporter_account_id");
CREATE INDEX "post_reports_status_created_at_idx"
  ON "post_reports"("status", "created_at" DESC);
CREATE INDEX "post_reports_reporter_account_id_idx"
  ON "post_reports"("reporter_account_id");

ALTER TABLE "post_reports"
  ADD CONSTRAINT "post_reports_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reports"
  ADD CONSTRAINT "post_reports_reporter_account_id_fkey"
  FOREIGN KEY ("reporter_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reports"
  ADD CONSTRAINT "post_reports_reviewed_by_admin_id_fkey"
  FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
