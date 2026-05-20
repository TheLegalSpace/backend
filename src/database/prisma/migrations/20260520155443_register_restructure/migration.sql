-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT;

-- AlterTable
ALTER TABLE "firm_profiles" ADD COLUMN     "office_address" TEXT;

-- CreateTable
CREATE TABLE "service_offerings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_offerings_account_id_practice_area_id_idx" ON "service_offerings"("account_id", "practice_area_id");

-- AddForeignKey
ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
