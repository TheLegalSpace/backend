import { FastifyRequest, FastifyReply } from "fastify";
import {
  _list,
  _get,
  _create,
  _update,
  _delete,
  _uploadCover,
} from "../logic/event";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const list = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status = "upcoming", page, limit } = req.query as any;
    return responseOk(reply, await _list(status, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getById = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _get(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _create(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const update = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _update(id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const remove = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _delete(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const uploadCover = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const file = await (req as any).file();
    if (!file) throw new Error("No file uploaded");
    const buffer = await file.toBuffer();
    return responseOk(
      reply,
      await _uploadCover(id, buffer, file.mimetype, file.filename)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
