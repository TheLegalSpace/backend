import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createThread,
  _listThreads,
  _getThread,
  _postMessage,
  _renameThread,
  _setPinned,
  _deleteThread,
} from "../logic/research";
import { responseOk, responseCreated, responseBad, badRequest } from "../helpers/utility";

export const createThread = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createThread(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listThreads = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _listThreads(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getThread = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getThread(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const patchThread = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { title, pinned } = req.body as { title?: string; pinned?: boolean };
    if (title === undefined && pinned === undefined) {
      return responseBad(reply, badRequest("Provide title and/or pinned"));
    }
    let result;
    if (pinned !== undefined) {
      result = await _setPinned(id, req.account.id, pinned);
    }
    if (title !== undefined) {
      result = await _renameThread(id, req.account.id, title);
    }
    return responseOk(reply, result!);
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deleteThread = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deleteThread(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const postMessage = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const parts = (req as any).parts();
    let text = "";
    let pdfBuffer: Buffer | null = null;
    let pdfMimetype = "";
    let pdfFilename = "";
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname === "pdf") {
          pdfBuffer = await part.toBuffer();
          pdfMimetype = part.mimetype;
          pdfFilename = part.filename;
        } else {
          await part.toBuffer();
        }
      } else if (part.fieldname === "text") {
        text = String(part.value || "");
      }
    }
    return responseCreated(
      reply,
      await _postMessage(id, req.account.id, {
        text,
        pdfBuffer,
        pdfMimetype,
        pdfFilename,
      })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
