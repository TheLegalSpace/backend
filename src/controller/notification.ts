import { FastifyRequest, FastifyReply } from "fastify";
import {
  _list,
  _unreadCount,
  _markRead,
  _markAllRead,
} from "../logic/notification";
import { responseOk, responseBad } from "../helpers/utility";

export const list = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _list(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unreadCount = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _unreadCount(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const markRead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _markRead(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const markAllRead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _markAllRead(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
