import { FastifyRequest, FastifyReply } from "fastify";
import {
  _getReportReasons,
  _reportPost,
  _listReportedPosts,
  _getReportedPost,
  _moderateReportedPost,
} from "../logic/postReport";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

// ---- User-facing ----

export const reportReasons = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getReportReasons());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const reportPost = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as { reason: string; details?: string };
    const result = await _reportPost(req.account.id, id, body);
    // A repeat report is a no-op, not a creation — 200 keeps the client's
    // "already reported" branch distinguishable from a fresh 201.
    return (result.data as any)?.alreadyReported
      ? responseOk(reply, result)
      : responseCreated(reply, result);
  } catch (e) {
    return responseBad(reply, e);
  }
};

// ---- Admin ----

export const adminListReportedPosts = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status, reason, autoHiddenOnly, page, limit } = req.query as any;
    return responseOk(
      reply,
      await _listReportedPosts({ status, reason, autoHiddenOnly }, page, limit)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const adminGetReportedPost = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { postId } = req.params as { postId: string };
    return responseOk(reply, await _getReportedPost(postId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const adminModerateReportedPost = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { postId } = req.params as { postId: string };
    const { action, reason } = req.body as { action: "remove" | "dismiss"; reason?: string };
    return responseOk(
      reply,
      await _moderateReportedPost(req.account.id, postId, action, reason)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
