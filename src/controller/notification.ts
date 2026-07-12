import { FastifyRequest, FastifyReply } from "fastify";
import {
  _list,
  _unreadCount,
  _markRead,
  _markAllRead,
  _subscribePush,
  _unsubscribePush,
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

export const subscribePush = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { subscription, deviceType } = req.body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      deviceType?: string;
    };
    const userAgent = req.headers["user-agent"] as string | undefined;
    return responseOk(
      reply,
      await _subscribePush(req.account.id, subscription, deviceType, userAgent)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unsubscribePush = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const body = (req.body || {}) as {
      endpoint?: string;
      subscription?: { endpoint?: string };
    };
    const endpoint = body.endpoint || body.subscription?.endpoint;
    if (!endpoint) {
      return responseBad(reply, new Error("endpoint is required"));
    }
    return responseOk(reply, await _unsubscribePush(req.account.id, endpoint));
  } catch (e) {
    return responseBad(reply, e);
  }
};
