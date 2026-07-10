-- Platform announcements (admin → users, fanned out as system notifications).

CREATE TABLE "announcements" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'all',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduled_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_status_created_at_idx" ON "announcements"("status", "created_at" DESC);

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
