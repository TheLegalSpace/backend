import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createPost,
  _getPost,
  _deletePost,
  _reactToPost,
  _removeReaction,
} from "../logic/post";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createPost(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getById = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getPost(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const remove = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deletePost(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const react = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { type } = req.body as { type: "like" | "dislike" };
    return responseOk(reply, await _reactToPost(id, req.account.id, type));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unreact = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _removeReaction(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
