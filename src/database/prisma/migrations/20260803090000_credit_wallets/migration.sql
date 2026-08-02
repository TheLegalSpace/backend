-- TLS Research credits: one wallet per account + an append-only transaction ledger.
-- 1 credit = 1 grounded research question. See docs/research-credits.md.

CREATE TABLE "credit_wallets" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "last_monthly_grant_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_wallets_account_id_key" ON "credit_wallets"("account_id");

CREATE TABLE "credit_transactions" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reference" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_transactions_account_id_created_at_idx"
  ON "credit_transactions"("account_id", "created_at" DESC);
CREATE INDEX "credit_transactions_reference_idx"
  ON "credit_transactions"("reference");

ALTER TABLE "credit_wallets"
  ADD CONSTRAINT "credit_wallets_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
