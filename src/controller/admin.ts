import { FastifyRequest, FastifyReply } from "fastify";
import {
  _listAccounts,
  _suspendAccount,
  _unsuspendAccount,
  _kycQueue,
  _approveKyc,
  _rejectKyc,
  _deletePost,
  _deleteArticle,
  _deleteReview,
  _auditLog,
} from "../logic/admin";
import { responseOk, responseBad } from "../helpers/utility";

export const listAccounts = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { role, status, verificationStatus, q, page, limit } = req.query as any;
    return responseOk(
      reply,
      await _listAccounts({ role, status, verificationStatus, q }, page, limit)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const suspend = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    return responseOk(reply, await _suspendAccount(req.account.id, id, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unsuspend = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _unsuspendAccount(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const kycQueue = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _kycQueue(page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const approveKyc = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseOk(reply, await _approveKyc(req.account.id, accountId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const rejectKyc = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { reason } = req.body as { reason: string };
    return responseOk(reply, await _rejectKyc(req.account.id, accountId, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deletePost = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deletePost(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deleteArticle = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deleteArticle(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deleteReview = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deleteReview(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const auditLog = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { adminAccountId, action, targetType, dateFrom, dateTo, page, limit } =
      req.query as any;
    return responseOk(
      reply,
      await _auditLog(
        { adminAccountId, action, targetType, dateFrom, dateTo },
        page,
        limit
      )
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
