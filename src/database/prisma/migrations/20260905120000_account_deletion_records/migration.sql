-- Account deletion = deactivate + archive, never erase.
--
-- The live `accounts` row is scrubbed of contact/identity fields on delete
-- (they ride along in every `include: { author: true }` response, and the
-- unique index on `email` would otherwise block the person from ever
-- re-registering). Those values are copied here first, so a later dispute over
-- what a lawyer or firm did still has an identity behind it.

CREATE TABLE "account_deletion_records" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "auth_user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "membership_tier" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "full_name" TEXT NOT NULL,
  "first_name" TEXT,
  "last_name" TEXT,
  "scn" TEXT,
  "rc_number" TEXT,
  "deleted_at" TIMESTAMP(3) NOT NULL,
  "purge_after" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_deletion_records_pkey" PRIMARY KEY ("id")
);

-- One archive row per account. Also stops a repeated DELETE from overwriting
-- good evidence with the already-scrubbed placeholder values.
CREATE UNIQUE INDEX "account_deletion_records_account_id_key"
  ON "account_deletion_records"("account_id");
-- The evidence lookup path: a complaint arrives naming an email address.
CREATE INDEX "account_deletion_records_email_idx"
  ON "account_deletion_records"("email");
CREATE INDEX "account_deletion_records_deleted_at_idx"
  ON "account_deletion_records"("deleted_at" DESC);

ALTER TABLE "account_deletion_records"
  ADD CONSTRAINT "account_deletion_records_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
