import { FastifyRequest, FastifyReply } from "fastify";
import {
  _listPracticeAreas,
  _createPracticeArea,
  _updatePracticeArea,
} from "../logic/practiceArea";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const list = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _listPracticeAreas());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { name } = req.body as { name: string };
    return responseCreated(reply, await _createPracticeArea(name));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const update = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _updatePracticeArea(id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};
