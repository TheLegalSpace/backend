import { FastifyRequest, FastifyReply } from "fastify";
import {
  _createInquiry,
  _createEventPromotion,
  _listMyServiceRequests,
  _getServiceRequest,
} from "../logic/service";
import { responseOk, responseCreated, responseBad } from "../helpers/utility";

export const createInquiry = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseCreated(reply, await _createInquiry(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const createEventPromotion = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const parts = (req as any).parts();
    const fields: Record<string, string> = {};
    let flyerBuffer: Buffer | null = null;
    let flyerMimetype = "";
    let flyerFilename = "";
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname === "flyer") {
          flyerBuffer = await part.toBuffer();
          flyerMimetype = part.mimetype;
          flyerFilename = part.filename;
        } else {
          await part.toBuffer();
        }
      } else {
        fields[part.fieldname] = String(part.value ?? "");
      }
    }
    if (!flyerBuffer) {
      return responseBad(reply, new Error("Flyer file is required (field name: flyer)"));
    }
    const links = fields.links
      ? String(fields.links)
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
    return responseCreated(
      reply,
      await _createEventPromotion(req.account.id, {
        title: fields.title,
        address: fields.address,
        startAt: fields.startAt,
        endAt: fields.endAt,
        shareOnSocial: fields.shareOnSocial === "true",
        links,
        contactName: fields.contactName,
        contactEmail: fields.contactEmail,
        contactPhone: fields.contactPhone,
        firmName: fields.firmName,
        flyer: {
          buffer: flyerBuffer,
          mimetype: flyerMimetype,
          filename: flyerFilename,
        },
      })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listMine = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listMyServiceRequests(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getOne = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getServiceRequest(id, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
