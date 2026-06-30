/*
  Warnings:

  - You are about to drop the `service_offerings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "service_offerings" DROP CONSTRAINT "service_offerings_account_id_fkey";

-- DropForeignKey
ALTER TABLE "service_offerings" DROP CONSTRAINT "service_offerings_practice_area_id_fkey";

-- AlterTable
ALTER TABLE "account_practice_areas" ADD COLUMN     "fee_max" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fee_min" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "expiry_warning_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_1h_sent_for_message_id" UUID,
ADD COLUMN     "reminder_3h_sent_for_message_id" UUID;

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "expiry_warning_sent_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "service_offerings";
