import { FastifyRequest, FastifyReply } from "fastify";
import {
  _follow,
  _unfollow,
  _listFollowing,
  _listFollowers,
} from "../logic/follow";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const follow = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseCreated(reply, await _follow(req.account.id, accountId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unfollow = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseOk(reply, await _unfollow(req.account.id, accountId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listFollowing = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listFollowing(req.account.id, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listFollowers = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listFollowers(req.account.id, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};
