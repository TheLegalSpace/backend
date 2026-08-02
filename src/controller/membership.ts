import { FastifyRequest, FastifyReply } from "fastify";
import { responseOk, responseBad } from "../helpers/utility";
import {
  _getMembership,
  _getPlans,
  _subscribe,
  _verifyPayment,
  _setAutoRenew,
  _cancelRenewal,
  _updatePaymentMethod,
  _listInvoices,
  _getInvoiceDownload,
} from "../logic/membership";

export const getMembership = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getMembership(req.account));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getPlans = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _getPlans(req.account));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const subscribe = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { context, callbackUrl, intervalMonths, interval } = (req.body as any) ?? {};
    // `interval` is the friendly alias the payment page sends ("annual"/"biannual").
    const months =
      intervalMonths ?? (interval === "annual" || interval === "yearly" ? 12 : undefined);
    return responseOk(reply, await _subscribe(req.account, context, callbackUrl, months));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const verifyPayment = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { reference } = req.query as { reference: string };
    return responseOk(reply, await _verifyPayment(req.account, reference));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const setAutoRenew = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { autoRenew } = req.body as { autoRenew: boolean };
    return responseOk(reply, await _setAutoRenew(req.account, autoRenew));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const cancelRenewal = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _cancelRenewal(req.account));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updatePaymentMethod = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _updatePaymentMethod(req.account));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listInvoices = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _listInvoices(req.account.id, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const downloadInvoice = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getInvoiceDownload(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};
