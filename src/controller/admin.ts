import { FastifyRequest, FastifyReply } from "fastify";
import {
  _listAccounts,
  _suspendAccount,
  _unsuspendAccount,
  _kycQueue,
  _approveKyc,
  _rejectKyc,
  _deletePost,
  _deleteReview,
  _auditLog,
  _listServiceRequests,
  _getServiceRequestAdmin,
  _updateServiceRequestStatus,
  _listPlans,
  _updatePlan,
  _verificationDocuments,
  _listDocket,
  _listAllEvents,
  _getDocketItem,
  _approveDocket,
  _rejectDocket,
  _adminCreatePromotion,
} from "../logic/admin";
import {
  _dashboardMetrics,
  _usersMetrics,
  _subscriptionsMetrics,
  _revenueMetrics,
  _searchInsights,
  _analyticsMetrics,
} from "../logic/adminMetrics";
import { responseOk, responseBad } from "../helpers/utility";

export const dashboardMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _dashboardMetrics());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const usersMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _usersMetrics());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const subscriptionsMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _subscriptionsMetrics());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const revenueMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { months } = req.query as { months?: number };
    return responseOk(reply, await _revenueMetrics(months || 12));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const verificationDocuments = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseOk(reply, await _verificationDocuments(accountId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const searchInsights = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { days, limit } = req.query as { days?: number; limit?: number };
    return responseOk(reply, await _searchInsights(days || 30, limit || 10));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const analyticsMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { days } = req.query as { days?: number };
    return responseOk(reply, await _analyticsMetrics(days || 30));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listDocket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { eventStatus, paymentStatus, page, limit } = req.query as any;
    return responseOk(reply, await _listDocket({ eventStatus, paymentStatus }, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listAllEvents = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status, q, page, limit } = req.query as any;
    return responseOk(reply, await _listAllEvents({ status, q }, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getDocketItem = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getDocketItem(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const approveDocket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _approveDocket(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const rejectDocket = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    return responseOk(reply, await _rejectDocket(req.account.id, id, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const createDocketPromotion = async (req: FastifyRequest, reply: FastifyReply) => {
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
    return responseOk(
      reply,
      await _adminCreatePromotion(req.account.id, {
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
        flyer: { buffer: flyerBuffer, mimetype: flyerMimetype, filename: flyerFilename },
      })
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listPlans = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return responseOk(reply, await _listPlans());
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updatePlan = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    return responseOk(reply, await _updatePlan(req.account.id, id, body));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listAccounts = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { role, status, verificationStatus, q, page, limit } = req.query as any;
    return responseOk(
      reply,
      await _listAccounts({ role, status, verificationStatus, q }, page, limit)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const suspend = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    return responseOk(reply, await _suspendAccount(req.account.id, id, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const unsuspend = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _unsuspendAccount(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const kycQueue = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page, limit } = req.query as any;
    return responseOk(reply, await _kycQueue(page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const approveKyc = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    return responseOk(reply, await _approveKyc(req.account.id, accountId));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const rejectKyc = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { accountId } = req.params as { accountId: string };
    const { reason } = req.body as { reason: string };
    return responseOk(reply, await _rejectKyc(req.account.id, accountId, reason));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deletePost = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deletePost(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const deleteReview = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _deleteReview(req.account.id, id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const auditLog = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { adminAccountId, action, targetType, dateFrom, dateTo, page, limit } =
      req.query as any;
    return responseOk(
      reply,
      await _auditLog(
        { adminAccountId, action, targetType, dateFrom, dateTo },
        page,
        limit
      )
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const listServiceRequests = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { type, status, page, limit } = req.query as any;
    return responseOk(reply, await _listServiceRequests({ type, status }, page, limit));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const getServiceRequest = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    return responseOk(reply, await _getServiceRequestAdmin(id));
  } catch (e) {
    return responseBad(reply, e);
  }
};

export const updateServiceRequest = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = req.params as { id: string };
    const { status, note } = req.body as { status: string; note?: string };
    return responseOk(
      reply,
      await _updateServiceRequestStatus(req.account.id, id, status, note)
    );
  } catch (e) {
    return responseBad(reply, e);
  }
};
