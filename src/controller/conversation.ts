import { FastifyRequest, FastifyReply } from "fastify";
import {
  _listConversations,
  _getConversation,
  _listMessages,
  _sendMessage,
  _markRead,
  _closeConversation,
  _archiveConversation,
} from "../logic/conversation";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const list = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listConversations(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getById = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getConversation(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listMessages = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { before, limit } = req.query as any;
    return responseOk(reply, await _listMessages(id, before, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const sendMessage = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseCreated(reply, await _sendMessage(id, req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const markRead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id, messageId } = req.params as { id: string; messageId: string };
    return responseOk(reply, await _markRead(id, messageId, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const close = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _closeConversation(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const archive = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _archiveConversation(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
