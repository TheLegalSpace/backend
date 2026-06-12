-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_created_by_admin_id_fkey";

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "created_by_admin_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contact_name" TEXT,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "firm_name" TEXT,
    "payload" JSONB NOT NULL,
    "amount" INTEGER,
    "pricing" JSONB,
    "payment_status" TEXT NOT NULL DEFAULT 'not_required',
    "event_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_event_id_key" ON "service_requests"("event_id");

-- CreateIndex
CREATE INDEX "service_requests_account_id_created_at_idx" ON "service_requests"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "service_requests_type_status_created_at_idx" ON "service_requests"("type", "status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
