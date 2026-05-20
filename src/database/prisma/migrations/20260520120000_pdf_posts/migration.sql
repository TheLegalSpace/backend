-- Drop article-related foreign keys
ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_attached_article_id_fkey";
ALTER TABLE "article_reactions" DROP CONSTRAINT IF EXISTS "article_reactions_article_id_fkey";
ALTER TABLE "article_reactions" DROP CONSTRAINT IF EXISTS "article_reactions_account_id_fkey";
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_author_account_id_fkey";

-- Drop the attached_article_id column + its index on posts
DROP INDEX IF EXISTS "posts_attached_article_id_idx";
ALTER TABLE "posts" DROP COLUMN IF EXISTS "attached_article_id";

-- Add PDF fields to posts
ALTER TABLE "posts" ADD COLUMN "pdf_url" TEXT;
ALTER TABLE "posts" ADD COLUMN "pdf_name" TEXT;
ALTER TABLE "posts" ADD COLUMN "pdf_size_bytes" INTEGER;

-- Drop article tables entirely
DROP TABLE IF EXISTS "article_reactions";
DROP TABLE IF EXISTS "articles";
