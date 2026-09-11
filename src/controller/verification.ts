import { FastifyRequest, FastifyReply } from "fastify";
import {
  _submitBarDetails,
  _raiseScnDispute,
  _uploadDisputeEvidence,
  _getMyDispute,
  _verifyIdentity,
  _submitApplication,
  _getVerificationState,
  _listScnDisputes,
  _resolveScnDispute,
} from "../logic/verification";
import { responseOk, responseCreated, responseBad, badRequest } from "../helpers/utility";

// Thin: pull request data, call logic, return. Same multipart handling as
// controller/post.ts -> createArticle.
const consumeFile = async (req: FastifyRequest) => {
  const file = await (req as any).file();
  if (!file) throw badRequest("No file uploaded");
  const buffer = await file.toBuffer();
  return { buffer, mimetype: file.mimetype as string, filename: file.filename as string };
};

export const submitBarDetails = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(
      reply,
      await _submitBarDetails(req.account.id, req.account.authUserId, req.body as any)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const raiseScnDispute = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(
      reply,
      await _raiseScnDispute(req.account.id, req.account.authUserId, req.body as any)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const uploadDisputeEvidence = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { buffer, mimetype, filename } = await consumeFile(req);
    return responseCreated(
      reply,
      await _uploadDisputeEvidence(req.account.id, id, buffer, mimetype, filename)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getMyDispute = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getMyDispute(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const verifyIdentity = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(
      reply,
      await _verifyIdentity(req.account.id, req.account.authUserId, req.body as any)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const submitApplication = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _submitApplication(req.account.id, req.account.authUserId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getVerificationState = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getVerificationState(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

// --- admin

export const listScnDisputes = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page = 1, limit = 20, status } = req.query as any;
    return responseOk(reply, await _listScnDisputes(page, limit, status));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const resolveScnDispute = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { outcome, note } = req.body as any;
    return responseOk(reply, await _resolveScnDispute(req.account.id, id, outcome, note));
  } catch (e) {
    return responseBad(reply, e);
  }
};
