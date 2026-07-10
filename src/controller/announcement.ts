import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createAnnouncement,
  _listAnnouncements,
  _sendAnnouncement,
} from "../logic/announcement";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const createAnnouncement = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createAnnouncement(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listAnnouncements = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listAnnouncements(page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const sendAnnouncement = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _sendAnnouncement(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
