import { FastifyRequest, FastifyReply } from "fastify";
import {
  _searchMatches,
  _saveIntake,
  _getIntake,
  _restartIntake,
} from "../logic/matchmaking";
import { responseOk, responseBad } from "../helpers/utility";

export const search = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const intake = req.body as any;
    const { page, limit } = req.query as any;
    return responseOk(reply, await _searchMatches(intake, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const saveIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _saveIntake(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getIntake(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const restartIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _restartIntake(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
