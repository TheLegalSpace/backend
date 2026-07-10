import { FastifyRequest, FastifyReply } from "fastify";
import { _getSurvey, _submitResponse, _surveyStats } from "../logic/survey";
import { responseOk, responseBad } from "../helpers/utility";

export const getSurvey = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { slug } = req.params as { slug: string };
    return responseOk(reply, await _getSurvey(slug, req.account.id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const submitResponse = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { slug } = req.params as { slug: string };
    return responseOk(reply, await _submitResponse(slug, req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const adminSurveyStats = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { slug } = req.params as { slug: string };
    return responseOk(reply, await _surveyStats(slug));
  } catch (e) {
    return responseBad(reply, e);
  }
};
