import { FastifyRequest, FastifyReply } from "fastify";
import { _submitReview } from "../logic/review";
import { responseCreated, responseBad } from "../helpers/utility";

export const submit = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseCreated(reply, await _submitReview(id, req.account.id, req.body as any));
  } catch (e) {
    return responseBad(reply, e);
  }
};
