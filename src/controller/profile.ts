import { FastifyRequest, FastifyReply } from "fastify";
import {
  _getMe,
  _getProfileById,
  _updateMe,
  _toggleAnonymous,
  _updatePracticeAreas,
  _updateLawyer,
  _updateFirm,
  _uploadAvatar,
  _uploadCover,
  _getConnections,
  _getProfileArticles,
  _getProfileReviews,
  _getProfilePosts,
} from "../logic/profile";
import { responseOk, responseBad } from "../helpers/utility";

export const getMe = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getMe(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getProfileById = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseOk(reply, await _getProfileById(accountId, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updateMe = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _updateMe(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const toggleAnonymous = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { isAnonymous } = req.body as { isAnonymous: boolean };
    return responseOk(reply, await _toggleAnonymous(req.account.id, isAnonymous));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updatePracticeAreas = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { practiceAreaIds } = req.body as { practiceAreaIds: string[] };
    return responseOk(reply, await _updatePracticeAreas(req.account.id, practiceAreaIds));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updateLawyer = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _updateLawyer(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updateFirm = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _updateFirm(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

const consumeFile = async (req: FastifyRequest) => {
  const file = await (req as any).file();
  if (!file) throw new Error("No file uploaded");
  const buffer = await file.toBuffer();
  return { buffer, mimetype: file.mimetype, filename: file.filename };
};

export const uploadAvatar = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { buffer, mimetype, filename } = await consumeFile(req);
    return responseOk(reply, await _uploadAvatar(req.account.id, buffer, mimetype, filename));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const uploadCover = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { buffer, mimetype, filename } = await consumeFile(req);
    return responseOk(reply, await _uploadCover(req.account.id, buffer, mimetype, filename));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getConnections = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { page, limit } = req.query as any;
    return responseOk(reply, await _getConnections(accountId, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getProfileArticles = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { page, limit } = req.query as any;
    return responseOk(reply, await _getProfileArticles(accountId, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getProfileReviews = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { page, limit } = req.query as any;
    return responseOk(reply, await _getProfileReviews(accountId, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getProfilePosts = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { page, limit } = req.query as any;
    return responseOk(reply, await _getProfilePosts(accountId, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};
