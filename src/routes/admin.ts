import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  adminListTickets,
  adminGetTicket,
  adminUpdateTicket,
} from "../controller/support";
import { adminSurveyStats } from "../controller/survey";
import {
  adminListReportedPosts,
  adminGetReportedPost,
  adminModerateReportedPost,
} from "../controller/postReport";
import { REPORT_REASON_VALUES } from "../config/moderation";
import {
  createAnnouncement,
  listAnnouncements,
  sendAnnouncement,
} from "../controller/announcement";
import {
  listAccounts,
  accountDeletionRecord,
  suspend,
  unsuspend,
  kycQueue,
  approveKyc,
  rejectKyc,
  deletePost,
  deleteReview,
  auditLog,
  listServiceRequests,
  getServiceRequest,
  updateServiceRequest,
  dashboardMetrics,
  usersMetrics,
  subscriptionsMetrics,
  revenueMetrics,
  listPlans,
  updatePlan,
  verificationDocuments,
  listDocket,
  listAllEvents,
  getDocketItem,
  approveDocket,
  rejectDocket,
  createDocketPromotion,
  searchInsights,
  analyticsMetrics,
} from "../controller/admin";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

const accountIdParam = {
  type: "object",
  required: ["accountId"],
  properties: { accountId: { type: "string", format: "uuid" } },
};

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);
  fastify.addHook("preHandler", requireRole("ADMIN"));

  // ---- Metrics (aggregation-only, no migrations) ----
  fastify.get("/metrics/dashboard", dashboardMetrics);
  fastify.get("/metrics/users", usersMetrics);
  fastify.get("/metrics/subscriptions", subscriptionsMetrics);
  fastify.get(
    "/metrics/revenue",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { months: { type: "integer", default: 12, minimum: 1, maximum: 36 } },
        },
      },
    },
    revenueMetrics
  );
  fastify.get(
    "/metrics/search",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            days: { type: "integer", default: 30, minimum: 1, maximum: 365 },
            limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
          },
        },
      },
    },
    searchInsights
  );
  fastify.get(
    "/metrics/analytics",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            days: { type: "integer", default: 30, minimum: 1, maximum: 365 },
          },
        },
      },
    },
    analyticsMetrics
  );

  // ---- Plans (Edit Plan) ----
  fastify.get("/plans", listPlans);
  fastify.patch(
    "/plans/:id",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            priceKobo: { type: "integer", minimum: 0 },
            features: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean" },
          },
        },
      },
    },
    updatePlan
  );

  fastify.get(
    "/accounts",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            role: { type: "string" },
            status: { type: "string" },
            verificationStatus: { type: "string" },
            q: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listAccounts
  );

  // The retained identity behind a deleted account. Reading it is audited.
  fastify.get(
    "/accounts/:id/deletion-record",
    { schema: { params: idParam } },
    accountDeletionRecord
  );

  fastify.patch(
    "/accounts/:id/suspend",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
        },
      },
    },
    suspend
  );
  fastify.patch("/accounts/:id/unsuspend", { schema: { params: idParam } }, unsuspend);
  fastify.get(
    "/accounts/:accountId/verification-documents",
    { schema: { params: accountIdParam } },
    verificationDocuments
  );

  fastify.get(
    "/kyc/queue",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    kycQueue
  );
  fastify.post(
    "/kyc/:accountId/approve",
    { schema: { params: accountIdParam } },
    approveKyc
  );
  fastify.post(
    "/kyc/:accountId/reject",
    {
      schema: {
        params: accountIdParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
        },
      },
    },
    rejectKyc
  );

  fastify.delete("/posts/:id", { schema: { params: idParam } }, deletePost);
  fastify.delete("/reviews/:id", { schema: { params: idParam } }, deleteReview);

  // ---- Content moderation (reported posts) ----
  // Grouped by post, not by report — one decision resolves every open report
  // on a piece of content.
  fastify.get(
    "/reports/posts",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "actioned", "dismissed"], default: "pending" },
            reason: { type: "string", enum: REPORT_REASON_VALUES },
            autoHiddenOnly: { type: "boolean", default: false },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    adminListReportedPosts
  );
  fastify.get(
    "/reports/posts/:postId",
    {
      schema: {
        params: {
          type: "object",
          required: ["postId"],
          properties: { postId: { type: "string", format: "uuid" } },
        },
      },
    },
    adminGetReportedPost
  );
  fastify.post(
    "/reports/posts/:postId/action",
    {
      schema: {
        params: {
          type: "object",
          required: ["postId"],
          properties: { postId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["remove", "dismiss"] },
            // Shown verbatim to the author when the post is removed — write it
            // as something a person should read.
            reason: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    adminModerateReportedPost
  );

  // ---- On The Docket (event promotions) ----
  fastify.get(
    "/docket",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            eventStatus: {
              type: "string",
              enum: ["pending_payment", "pending_review", "published", "rejected", "past"],
            },
            paymentStatus: { type: "string", enum: ["pending", "paid"] },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listDocket
  );
  // All events, every status (event-centric — includes editorial + promotion events).
  fastify.get(
    "/events",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["draft", "pending_payment", "pending_review", "published", "rejected", "past"],
            },
            q: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listAllEvents
  );
  fastify.post("/docket", createDocketPromotion); // multipart flyer — validated in controller
  fastify.get("/docket/:id", { schema: { params: idParam } }, getDocketItem);
  fastify.post("/docket/:id/approve", { schema: { params: idParam } }, approveDocket);
  fastify.post(
    "/docket/:id/reject",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
        },
      },
    },
    rejectDocket
  );

  fastify.get(
    "/service-requests",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["website", "appointment", "productivity", "consulting", "event_promotion"],
            },
            status: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listServiceRequests
  );
  fastify.get("/service-requests/:id", { schema: { params: idParam } }, getServiceRequest);
  fastify.patch(
    "/service-requests/:id",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: [
                // inquiry lifecycle
                "new",
                "in_progress",
                "lead_lost",
                "closed",
                // event-promotion lifecycle
                "pending",
                "active",
                "completed",
              ],
            },
            note: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    updateServiceRequest
  );

  // ---- Support Center ----
  fastify.get(
    "/support/tickets",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["open", "in_progress", "closed"] },
            category: { type: "string", enum: ["billing", "technical", "account", "general"] },
            q: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    adminListTickets
  );
  fastify.get("/support/tickets/:id", { schema: { params: idParam } }, adminGetTicket);
  fastify.patch(
    "/support/tickets/:id",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string", enum: ["open", "in_progress", "closed"] } },
        },
      },
    },
    adminUpdateTicket
  );

  // ---- Announcements ----
  fastify.post(
    "/announcements",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "body"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            body: { type: "string", minLength: 1, maxLength: 5000 },
            audience: { type: "string", enum: ["all", "lawyers", "firms", "clients"] },
            sendNow: { type: "boolean" },
            scheduledAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    createAnnouncement
  );
  fastify.get(
    "/announcements",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    listAnnouncements
  );
  fastify.post("/announcements/:id/send", { schema: { params: idParam } }, sendAnnouncement);

  // ---- Legal News Survey ----
  fastify.get(
    "/surveys/:slug/stats",
    {
      schema: {
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
      },
    },
    adminSurveyStats
  );

  fastify.get(
    "/audit-log",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            adminAccountId: { type: "string", format: "uuid" },
            action: { type: "string" },
            targetType: { type: "string" },
            dateFrom: { type: "string", format: "date-time" },
            dateTo: { type: "string", format: "date-time" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    auditLog
  );
}
