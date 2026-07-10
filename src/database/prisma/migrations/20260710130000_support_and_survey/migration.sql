-- Support Center + Legal News Survey modules.

-- Support tickets
CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL,
  "ticket_number" SERIAL NOT NULL,
  "account_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at" DESC);
CREATE INDEX "support_tickets_account_id_created_at_idx" ON "support_tickets"("account_id", "created_at" DESC);

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Surveys
CREATE TABLE "surveys" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '["yes","no","maybe"]',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "surveys_slug_key" ON "surveys"("slug");

CREATE TABLE "survey_responses" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "answer" TEXT NOT NULL,
  "feature_votes" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_responses_survey_id_account_id_key" ON "survey_responses"("survey_id", "account_id");
CREATE INDEX "survey_responses_survey_id_answer_idx" ON "survey_responses"("survey_id", "answer");

ALTER TABLE "survey_responses"
  ADD CONSTRAINT "survey_responses_survey_id_fkey"
  FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses"
  ADD CONSTRAINT "survey_responses_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
