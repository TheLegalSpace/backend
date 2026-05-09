import { FastifyRequest, FastifyReply } from "fastify";
import { _search } from "../logic/search";
import { responseOk, responseBad } from "../helpers/utility";

export const search = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { q = "", type = "all", page, limit } = req.query as any;
    return responseOk(reply, await _search(q, type, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};
