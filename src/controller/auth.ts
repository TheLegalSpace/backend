import { FastifyRequest, FastifyReply } from "fastify";
import {
  _registerStart,
  _registerResend,
  _registerVerify,
  _registerGoogle,
  _login,
  _refresh,
  _logout,
  _forgotPassword,
  _resetPassword,
  _deleteAccount,
} from "../logic/auth";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const registerStart = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _registerStart(req.body as any));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const registerResend = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email } = req.body as { email: string };
    return responseOk(reply, await _registerResend(email));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const registerVerify = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _registerVerify(req.body as any));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const registerGoogle = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _registerGoogle(req.body as any));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const login = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _login(req.body as any));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const refresh = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    return responseOk(reply, await _refresh(refreshToken));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const logout = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return responseOk(reply, await _logout(req.account?.authUserId, token));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const forgotPassword = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email } = req.body as { email: string };
    return responseOk(reply, await _forgotPassword(email));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const resetPassword = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    return responseOk(reply, await _resetPassword(token, newPassword));
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const deleteAccount = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _deleteAccount(req.account.id, req.account.authUserId));
  } catch (error) {
    return responseBad(reply, error);
  }
};
