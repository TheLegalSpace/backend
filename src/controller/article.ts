import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createArticle,
  _getArticleBySlug,
  _updateArticle,
  _deleteArticle,
  _readArticle,
  _reactToArticle,
  _removeArticleReaction,
  _uploadArticleCover,
} from "../logic/article";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createArticle(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getBySlug = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { slug } = req.params as { slug: string };
    return responseOk(reply, await _getArticleBySlug(slug, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const update = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _updateArticle(id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const remove = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deleteArticle(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const recordRead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _readArticle(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const react = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { type } = req.body as { type: "like" | "dislike" };
    return responseOk(reply, await _reactToArticle(id, req.account.id, type));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unreact = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _removeArticleReaction(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const uploadCover = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const file = await (req as any).file();
    if (!file) throw new Error("No file uploaded");
    const buffer = await file.toBuffer();
    return responseOk(
      reply,
      await _uploadArticleCover(id, buffer, file.mimetype, file.filename)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
