import slugify from "slugify";
import crypto from "crypto";
import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { response, badRequest, notFound } from "../helpers/utility";
import { Response } from "../interface";
import {
  createArticle,
  findArticleBySlug,
  findArticleById,
  updateArticle,
  softDeleteArticle,
  upsertArticleReaction,
  removeArticleReaction,
} from "../dao/article";
import { maskAccount } from "../services/anonymity";
import { enqueueNotification } from "../services/notification";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "../services/storage";

const generateSlug = (title: string) =>
  `${slugify(title, { lower: true, strict: true }).slice(0, 60)}-${crypto.randomBytes(3).toString("hex")}`;

export const _createArticle = async (
  authorAccountId: string,
  body: { title: string; body: string; coverUrl?: string; status?: "draft" | "published" }
): Promise<Response> => {
  if (!body.title || !body.body) throw badRequest("Title and body are required");
  const status = body.status || "draft";
  const slug = generateSlug(body.title);
  const article = await createArticle({
    authorAccountId,
    title: body.title,
    body: body.body,
    coverUrl: body.coverUrl,
    slug,
    status,
    publishedAt: status === "published" ? new Date() : null,
  });

  if (status === "published") {
    const followers = await prisma.follow.findMany({
      where: { followedAccountId: authorAccountId },
      select: { followerAccountId: true },
    });
    for (const f of followers) {
      await enqueueNotification({
        recipientAccountId: f.followerAccountId,
        type: "article_published",
        payload: { articleId: article.id, slug: article.slug, title: article.title },
      });
    }
  }
  return response({ error: false, message: "Article created", data: article });
};

export const _getArticleBySlug = async (
  slug: string,
  viewerId: string
): Promise<Response> => {
  const article = await findArticleBySlug(slug);
  if (!article) throw notFound("Article not found");
  return response({
    error: false,
    message: "Article retrieved",
    data: {
      ...article,
      author: maskAccount(article.author as any, viewerId),
    },
  });
};

export const _updateArticle = async (
  id: string,
  body: { title?: string; body?: string; coverUrl?: string; status?: "draft" | "published" }
): Promise<Response> => {
  const existing = await findArticleById(id);
  if (!existing) throw notFound("Article not found");
  const data: any = { ...body };
  if (body.status === "published" && existing.status !== "published") {
    data.publishedAt = new Date();
  }
  if (body.title && body.title !== existing.title) {
    data.slug = generateSlug(body.title);
  }
  const updated = await updateArticle(id, data);
  return response({ error: false, message: "Article updated", data: updated });
};

export const _deleteArticle = async (id: string): Promise<Response> => {
  await softDeleteArticle(id);
  return response({ error: false, message: "Article deleted" });
};

export const _readArticle = async (
  articleId: string,
  accountId: string
): Promise<Response> => {
  const key = `read:article:${articleId}:account:${accountId}`;
  const set = await redis.set(key, "1", "EX", 24 * 60 * 60, "NX").catch(() => null);
  if (set === "OK") {
    await prisma.article.update({
      where: { id: articleId },
      data: { readCount: { increment: 1 } },
    });
  }
  return response({ error: false, message: "Read recorded" });
};

export const _reactToArticle = async (
  articleId: string,
  accountId: string,
  type: "like" | "dislike"
): Promise<Response> => {
  const article = await findArticleById(articleId);
  if (!article) throw notFound("Article not found");
  const { reaction } = await upsertArticleReaction(articleId, accountId, type);
  return response({ error: false, message: "Reaction recorded", data: reaction });
};

export const _removeArticleReaction = async (
  articleId: string,
  accountId: string
): Promise<Response> => {
  await removeArticleReaction(articleId, accountId);
  return response({ error: false, message: "Reaction removed" });
};

export const _uploadArticleCover = async (
  articleId: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  const { url } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `articles/${articleId}`,
    maxBytes: MAX_ARTICLE_ASSET_BYTES,
    allowPdf: false,
  });
  const updated = await updateArticle(articleId, { coverUrl: url });
  return response({ error: false, message: "Cover uploaded", data: { url, article: updated } });
};
