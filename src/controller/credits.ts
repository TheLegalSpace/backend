import { FastifyRequest, FastifyReply } from "fastify";
import { responseOk, responseBad } from "../helpers/utility";
import {
  _getCredits,
  _listPacks,
  _listTransactions,
  _purchaseCredits,
  _verifyCreditPurchase,
} from "../logic/credits";

export const getCredits = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getCredits(req.account));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listPacks = async (_req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _listPacks());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listTransactions = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listTransactions(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const purchaseCredits = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { packCode, callbackUrl } = (req.body as any) ?? {};
    return responseOk(reply, await _purchaseCredits(req.account, packCode, callbackUrl));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const verifyCreditPurchase = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { reference } = req.query as { reference: string };
    return responseOk(reply, await _verifyCreditPurchase(req.account, reference));
  } catch (e) {
    return responseBad(reply, e);
  }
};
