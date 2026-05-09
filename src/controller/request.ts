import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createRequest,
  _listMyRequests,
  _getRequest,
  _cancelRequest,
  _listLeads,
  _getLead,
  _acceptLead,
  _declineLead,
} from "../logic/request";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createRequest(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listMyRequests = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status, page, limit } = req.query as any;
    return responseOk(
      reply,
      await _listMyRequests(req.account.id, req.account.id, { status, page, limit })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getRequest = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getRequest(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const cancelRequest = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _cancelRequest(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listLeads = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status, page, limit } = req.query as any;
    return responseOk(
      reply,
      await _listLeads(req.account.id, req.account.id, { status, page, limit })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getLead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getLead(id, req.account.id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const acceptLead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _acceptLead(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const declineLead = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = (req.body || {}) as { reason?: string };
    return responseOk(reply, await _declineLead(id, req.account.id, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};
