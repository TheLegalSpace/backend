-- Click counter for promoted events (approximate ad performance: clicks -> CTR/CPC).
ALTER TABLE "events" ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0;
