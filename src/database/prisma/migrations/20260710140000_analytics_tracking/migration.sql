-- Lightweight behavioural tracking: search logging + daily active-user snapshots.

CREATE TABLE "search_logs" (
  "id" UUID NOT NULL,
  "account_id" UUID,
  "query" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "result_count" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "search_logs_created_at_idx" ON "search_logs"("created_at" DESC);
CREATE INDEX "search_logs_kind_created_at_idx" ON "search_logs"("kind", "created_at" DESC);

CREATE TABLE "daily_stats" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "dau" INTEGER NOT NULL DEFAULT 0,
  "mau" INTEGER NOT NULL DEFAULT 0,
  "new_users" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_stats_date_key" ON "daily_stats"("date");
