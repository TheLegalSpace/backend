-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "auth_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "cover_url" TEXT,
    "bio" TEXT,
    "location_city" TEXT,
    "location_country" TEXT NOT NULL DEFAULT 'Nigeria',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "avg_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "connection_count" INTEGER NOT NULL DEFAULT 0,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "scn" TEXT,
    "call_to_bar_year" INTEGER NOT NULL,
    "nba_branch" TEXT,
    "fee_range_min" INTEGER NOT NULL DEFAULT 0,
    "fee_range_max" INTEGER NOT NULL DEFAULT 0,
    "verification_status" TEXT NOT NULL DEFAULT 'verified',
    "verification_flags" JSONB NOT NULL DEFAULT '{}',
    "practicing_cert_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lawyer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firm_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "firm_name" TEXT NOT NULL,
    "rc_number" TEXT,
    "firm_establishment_year" INTEGER NOT NULL,
    "verifying_partner_account_id" UUID,
    "verifying_partner_scn" TEXT,
    "fee_range_min" INTEGER NOT NULL DEFAULT 0,
    "fee_range_max" INTEGER NOT NULL DEFAULT 0,
    "verification_status" TEXT NOT NULL DEFAULT 'verified',
    "verification_flags" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firm_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_practice_areas" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_practice_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "author_account_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cover_url" TEXT,
    "body" TEXT NOT NULL,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "dislike_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_reactions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_account_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attached_article_id" UUID,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "dislike_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reactions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" UUID NOT NULL,
    "follower_account_id" UUID NOT NULL,
    "followed_account_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "lawyer_account_id" UUID NOT NULL,
    "intake_payload" JSONB NOT NULL,
    "relevance_score" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "conversation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "lawyer_account_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_account_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL,
    "account_a_id" UUID NOT NULL,
    "account_b_id" UUID NOT NULL,
    "first_conversation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "reviewer_account_id" UUID NOT NULL,
    "reviewed_account_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "location" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "registration_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "ocr_extracted" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "admin_account_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_settings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "notification_email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_auth_user_id_key" ON "accounts"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE INDEX "accounts_role_status_idx" ON "accounts"("role", "status");

-- CreateIndex
CREATE INDEX "accounts_role_status_location_city_idx" ON "accounts"("role", "status", "location_city");

-- CreateIndex
CREATE INDEX "accounts_last_active_at_idx" ON "accounts"("last_active_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_profiles_account_id_key" ON "lawyer_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_profiles_scn_key" ON "lawyer_profiles"("scn");

-- CreateIndex
CREATE INDEX "lawyer_profiles_verification_status_idx" ON "lawyer_profiles"("verification_status");

-- CreateIndex
CREATE INDEX "lawyer_profiles_fee_range_min_fee_range_max_idx" ON "lawyer_profiles"("fee_range_min", "fee_range_max");

-- CreateIndex
CREATE UNIQUE INDEX "firm_profiles_account_id_key" ON "firm_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "firm_profiles_rc_number_key" ON "firm_profiles"("rc_number");

-- CreateIndex
CREATE INDEX "firm_profiles_verification_status_idx" ON "firm_profiles"("verification_status");

-- CreateIndex
CREATE INDEX "firm_profiles_fee_range_min_fee_range_max_idx" ON "firm_profiles"("fee_range_min", "fee_range_max");

-- CreateIndex
CREATE UNIQUE INDEX "practice_areas_name_key" ON "practice_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "practice_areas_slug_key" ON "practice_areas"("slug");

-- CreateIndex
CREATE INDEX "account_practice_areas_practice_area_id_idx" ON "account_practice_areas"("practice_area_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_practice_areas_account_id_practice_area_id_key" ON "account_practice_areas"("account_id", "practice_area_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_author_account_id_idx" ON "articles"("author_account_id");

-- CreateIndex
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "article_reactions_article_id_account_id_key" ON "article_reactions"("article_id", "account_id");

-- CreateIndex
CREATE INDEX "posts_author_account_id_idx" ON "posts"("author_account_id");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_attached_article_id_idx" ON "posts"("attached_article_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_reactions_post_id_account_id_key" ON "post_reactions"("post_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_account_id_followed_account_id_key" ON "follows"("follower_account_id", "followed_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "requests_conversation_id_key" ON "requests"("conversation_id");

-- CreateIndex
CREATE INDEX "requests_user_account_id_status_created_at_idx" ON "requests"("user_account_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "requests_lawyer_account_id_status_created_at_idx" ON "requests"("lawyer_account_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "requests_expires_at_idx" ON "requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_request_id_key" ON "conversations"("request_id");

-- CreateIndex
CREATE INDEX "conversations_user_account_id_last_message_at_idx" ON "conversations"("user_account_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_lawyer_account_id_last_message_at_idx" ON "conversations"("lawyer_account_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "connections_account_a_id_idx" ON "connections"("account_a_id");

-- CreateIndex
CREATE INDEX "connections_account_b_id_idx" ON "connections"("account_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_account_a_id_account_b_id_key" ON "connections"("account_a_id", "account_b_id");

-- CreateIndex
CREATE INDEX "reviews_reviewed_account_id_created_at_idx" ON "reviews"("reviewed_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_conversation_id_idx" ON "reviews"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_reviewer_account_id_reviewed_account_id_conversatio_key" ON "reviews"("reviewer_account_id", "reviewed_account_id", "conversation_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_account_id_created_at_idx" ON "notifications"("recipient_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_account_id_read_at_idx" ON "notifications"("recipient_account_id", "read_at");

-- CreateIndex
CREATE INDEX "events_status_start_at_idx" ON "events"("status", "start_at");

-- CreateIndex
CREATE INDEX "verification_documents_account_id_doc_type_idx" ON "verification_documents"("account_id", "doc_type");

-- CreateIndex
CREATE INDEX "verification_documents_status_idx" ON "verification_documents"("status");

-- CreateIndex
CREATE INDEX "admin_audit_log_admin_account_id_created_at_idx" ON "admin_audit_log"("admin_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_log_target_type_target_id_idx" ON "admin_audit_log"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_settings_account_id_key" ON "account_settings"("account_id");

-- AddForeignKey
ALTER TABLE "lawyer_profiles" ADD CONSTRAINT "lawyer_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_profiles" ADD CONSTRAINT "firm_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_profiles" ADD CONSTRAINT "firm_profiles_verifying_partner_account_id_fkey" FOREIGN KEY ("verifying_partner_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_practice_areas" ADD CONSTRAINT "account_practice_areas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_practice_areas" ADD CONSTRAINT "account_practice_areas_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_account_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_reactions" ADD CONSTRAINT "article_reactions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_reactions" ADD CONSTRAINT "article_reactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_account_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_attached_article_id_fkey" FOREIGN KEY ("attached_article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_account_id_fkey" FOREIGN KEY ("follower_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_account_id_fkey" FOREIGN KEY ("followed_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_lawyer_account_id_fkey" FOREIGN KEY ("lawyer_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lawyer_account_id_fkey" FOREIGN KEY ("lawyer_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_account_id_fkey" FOREIGN KEY ("closed_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_first_conversation_id_fkey" FOREIGN KEY ("first_conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewed_account_id_fkey" FOREIGN KEY ("reviewed_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_account_id_fkey" FOREIGN KEY ("admin_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
