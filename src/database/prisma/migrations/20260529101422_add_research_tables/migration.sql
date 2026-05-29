-- CreateTable
CREATE TABLE "research_threads" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New research',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "research_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "sources" JSONB,
    "confident" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_threads_account_id_pinned_updated_at_idx" ON "research_threads"("account_id", "pinned", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "research_messages_thread_id_created_at_idx" ON "research_messages"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "research_threads" ADD CONSTRAINT "research_threads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_messages" ADD CONSTRAINT "research_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "research_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
