import { FastifyRequest, FastifyReply } from "fastify";
import {
  _getSettings,
  _updateSettings,
  _changePassword,
} from "../logic/settings";
import { responseOk, responseBad } from "../helpers/utility";

export const get = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getSettings(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const update = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _updateSettings(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const changePassword = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { newPassword } = req.body as { newPassword: string };
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return responseOk(reply, await _changePassword(token, newPassword));
  } catch (e) {
    return responseBad(reply, e);
  }
};
