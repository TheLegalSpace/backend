import { FastifyRequest, FastifyReply } from "fastify";
import {
  _registerUser,
  _registerLawyer,
  _registerFirm,
  _login,
  _refresh,
  _logout,
  _forgotPassword,
  _resetPassword,
  _deleteAccount,
} from "../logic/auth";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const registerUser = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await _registerUser(req.body as any);
    return responseCreated(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const registerLawyer = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await _registerLawyer(req.body as any);
    return responseCreated(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const registerFirm = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await _registerFirm(req.body as any);
    return responseCreated(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const login = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await _login(req.body as any);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const refresh = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const result = await _refresh(refreshToken);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const logout = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const result = await _logout(req.account?.authUserId, token);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const forgotPassword = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email } = req.body as { email: string };
    const result = await _forgotPassword(email);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const resetPassword = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const result = await _resetPassword(token, newPassword);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};

export const deleteAccount = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await _deleteAccount(req.account.id, req.account.authUserId);
    return responseOk(reply, result);
  } catch (error) {
    return responseBad(reply, error);
  }
};
