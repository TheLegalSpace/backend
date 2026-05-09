import { response, badRequest, notFound, forbidden } from "../helpers/utility";
import { Response } from "../interface";
import {
  createPost,
  findPostById,
  softDeletePost,
  upsertReaction,
  removeReaction,
} from "../dao/post";
import { prisma } from "../config/database";
import { maskAccount } from "../services/anonymity";
import { enqueueNotification } from "../services/notification";

export const _createPost = async (
  authorAccountId: string,
  body: { body: string; attachedArticleId?: string }
): Promise<Response> => {
  if (!body.body || body.body.length === 0) throw badRequest("Body is required");
  if (body.body.length > 5000) throw badRequest("Body exceeds 5000 characters");
  if (body.attachedArticleId) {
    const article = await prisma.article.findFirst({
      where: { id: body.attachedArticleId, deletedAt: null },
    });
    if (!article) throw notFound("Article not found");
    if (article.authorAccountId !== authorAccountId) {
      throw forbidden("Can only attach your own article");
    }
  }
  const post = await createPost({
    authorAccountId,
    body: body.body,
    attachedArticleId: body.attachedArticleId || null,
  });
  return response({ error: false, message: "Post created", data: post });
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
    await enqueueNotification({
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
