import { response, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import {
  createPost,
  findPostById,
  softDeletePost,
  upsertReaction,
  removeReaction,
} from "../dao/post";
import { notFound } from "../helpers/utility";
import { prisma } from "../config/database";
import { maskAccount } from "../services/anonymity";
import { dispatchNotification } from "../services/notification";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "../services/storage";

const PDF_MIME = "application/pdf";
const TITLE_MAX = 200;

const normalizeTitle = (title?: string | null): string | null => {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > TITLE_MAX) {
    throw badRequest(`Title exceeds ${TITLE_MAX} characters`);
  }
  return trimmed;
};

const notifyFollowersOfArticle = async (authorAccountId: string, postId: string) => {
  const followers = await prisma.follow.findMany({
    where: { followedAccountId: authorAccountId },
    select: { followerAccountId: true },
  });
  for (const f of followers) {
    await dispatchNotification({
      recipientAccountId: f.followerAccountId,
      type: "article_published",
      payload: { postId },
    });
  }
};

export const _createCaptionPost = async (
  authorAccountId: string,
  body: { body: string; title?: string | null }
): Promise<Response> => {
  if (!body.body || body.body.length === 0) throw badRequest("Body is required");
  if (body.body.length > 5000) throw badRequest("Body exceeds 5000 characters");
  const title = normalizeTitle(body.title);
  const post = await createPost({ authorAccountId, title, body: body.body });
  return response({ error: false, message: "Post created", data: post });
};

export const _createArticlePost = async (
  authorAccountId: string,
  input: { body: string; pdfBuffer: Buffer; pdfMimetype: string; pdfFilename: string }
): Promise<Response> => {
  if (!input.body || input.body.length === 0) throw badRequest("Body is required");
  if (input.body.length > 5000) throw badRequest("Body exceeds 5000 characters");
  if (input.pdfMimetype !== PDF_MIME) throw badRequest("File must be a PDF");
  if (!input.pdfBuffer || input.pdfBuffer.byteLength === 0) {
    throw badRequest("PDF file is empty");
  }
  if (input.pdfBuffer.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw badRequest("File does not appear to be a valid PDF");
  }

  const { url } = await uploadToR2({
    buffer: input.pdfBuffer,
    mimetype: input.pdfMimetype,
    originalName: input.pdfFilename,
    folder: `posts/${authorAccountId}/pdfs`,
    maxBytes: MAX_ARTICLE_ASSET_BYTES,
    allowPdf: true,
  });

  const post = await createPost({
    authorAccountId,
    body: input.body,
    pdfUrl: url,
    pdfName: input.pdfFilename,
    pdfSizeBytes: input.pdfBuffer.byteLength,
  });

  await notifyFollowersOfArticle(authorAccountId, post.id);

  return response({ error: false, message: "Article post created", data: post });
};

export const _getPost = async (id: string, viewerId: string): Promise<Response> => {
  const post = await findPostById(id);
  if (!post) throw notFound("Post not found");
  return response({
    error: false,
    message: "Post retrieved",
    data: {
      ...post,
      author: maskAccount(post.author as any, viewerId),
    },
  });
};

export const _deletePost = async (id: string): Promise<Response> => {
  await softDeletePost(id);
  return response({ error: false, message: "Post deleted" });
};

export const _reactToPost = async (
  postId: string,
  accountId: string,
  type: "like" | "dislike"
): Promise<Response> => {
  const post = await findPostById(postId);
  if (!post) throw notFound("Post not found");
  const { reaction, changed } = await upsertReaction(postId, accountId, type);
  if (changed && type === "like" && post.authorAccountId !== accountId) {
    await dispatchNotification({
      recipientAccountId: post.authorAccountId,
      type: "post_liked",
      payload: { postId, accountId },
      emailable: false,
    });
  }
  return response({ error: false, message: "Reaction recorded", data: reaction });
};

export const _removeReaction = async (
  postId: string,
  accountId: string
): Promise<Response> => {
  await removeReaction(postId, accountId);
  return response({ error: false, message: "Reaction removed" });
};
