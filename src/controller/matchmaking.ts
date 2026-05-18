import { FastifyRequest, FastifyReply } from "fastify";
import {
  _searchMatches,
  _saveIntake,
  _getIntake,
  _restartIntake,
  _searchByText,
} from "../logic/matchmaking";
import { responseOk, responseBad } from "../helpers/utility";
import { ExtractionInsufficientError } from "../services/llm";

export const search = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const intake = req.body as any;
    const { page, limit } = req.query as any;
    return responseOk(reply, await _searchMatches(intake, req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const saveIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _saveIntake(req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getIntake(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const restartIntake = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _restartIntake(req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const searchByText = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { text } = req.body as { text: string };
    const { page, limit } = req.query as any;
    return responseOk(
      reply,
      await _searchByText(text, req.account.id, page, limit)
    );
  } catch (e: any) {
    if (e instanceof ExtractionInsufficientError) {
      return reply.status(422).send({
        error: true,
        message: e.message,
        data: { text: e.text, extracted: e.extracted },
      });
    }
    return responseBad(reply, e);
  }
};
