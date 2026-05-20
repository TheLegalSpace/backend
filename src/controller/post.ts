import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createCaptionPost,
  _createArticlePost,
  _getPost,
  _deletePost,
  _reactToPost,
  _removeReaction,
} from "../logic/post";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const create = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createCaptionPost(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const createArticle = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const parts = (req as any).parts();
    let body = "";
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
      } else if (part.fieldname === "body") {
        body = String(part.value || "");
      }
    }
    if (!pdfBuffer) {
      return responseBad(reply, new Error("PDF file is required (field name: pdf)"));
    }
    return responseCreated(
      reply,
      await _createArticlePost(req.account.id, {
        body,
        pdfBuffer,
        pdfMimetype,
        pdfFilename,
      })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getById = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getPost(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const remove = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deletePost(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const react = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { type } = req.body as { type: "like" | "dislike" };
    return responseOk(reply, await _reactToPost(id, req.account.id, type));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unreact = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _removeReaction(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
