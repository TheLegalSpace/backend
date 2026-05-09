import { FastifyRequest, FastifyReply } from "fastify";
import {
  _getFeedAll,
  _getFeedTopAccounts,
  _getFeedArticles,
  _getFeedEvents,
  _getSidebar,
} from "../logic/feed";
import { responseOk, responseBad } from "../helpers/utility";

export const getFeed = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { filter = "all", page, limit } = req.query as any;
    let result;
    switch (filter) {
      case "top_firms":
        result = await _getFeedTopAccounts("FIRM", req.account.id, page, limit);
        break;
      case "top_lawyers":
        result = await _getFeedTopAccounts("LAWYER", req.account.id, page, limit);
        break;
      case "articles":
        result = await _getFeedArticles(req.account.id, page, limit);
        break;
      case "events":
        result = await _getFeedEvents(page, limit);
        break;
      default:
        result = await _getFeedAll(req.account.id, page, limit);
    }
    return responseOk(reply, result);
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getSidebar = async (_req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getSidebar());
  } catch (e) {
    return responseBad(reply, e);
  }
};
