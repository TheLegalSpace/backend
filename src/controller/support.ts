import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createTicket,
  _listMyTickets,
  _adminListTickets,
  _adminGetTicket,
  _adminUpdateTicketStatus,
} from "../logic/support";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

// ---- User-facing ----

export const createTicket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createTicket(req.account, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listMyTickets = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listMyTickets(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

// ---- Admin ----

export const adminListTickets = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status, category, q, page, limit } = req.query as any;
    return responseOk(reply, await _adminListTickets({ status, category, q }, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const adminGetTicket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _adminGetTicket(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const adminUpdateTicket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    return responseOk(reply, await _adminUpdateTicketStatus(id, status));
  } catch (e) {
    return responseBad(reply, e);
  }
};
