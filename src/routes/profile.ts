import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  getMe,
  getProfileById,
  updateMe,
  toggleAnonymous,
  updatePracticeAreas,
  updateLawyer,
  updateFirm,
  uploadAvatar,
  uploadCover,
  getConnections,
  getProfileArticles,
  getProfileReviews,
  getProfilePosts,
  setupLawyer,
  setupFirm,
  uploadVerificationDocument,
} from "../controller/profile";
import {
  updateProfileSchema,
  toggleAnonymousSchema,
  updatePracticeAreasSchema,
  updateLawyerSchema,
  updateFirmSchema,
  lawyerSetupSchema,
  firmSetupSchema,
  verificationDocSchema,
  paginationQuery,
} from "../dto/profile";

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/me", getMe);
  fastify.get("/:accountId", getProfileById);
  fastify.patch("/me", { schema: updateProfileSchema }, updateMe);
  fastify.post("/me/avatar", uploadAvatar);
  fastify.post("/me/cover", uploadCover);
  fastify.patch(
    "/me/anonymous",
    { schema: toggleAnonymousSchema, preHandler: requireRole("USER") },
    toggleAnonymous
  );
  fastify.patch(
    "/me/practice-areas",
    { schema: updatePracticeAreasSchema, preHandler: requireRole("LAWYER", "FIRM") },
    updatePracticeAreas
  );
  fastify.patch(
    "/me/lawyer",
    { schema: updateLawyerSchema, preHandler: requireRole("LAWYER") },
    updateLawyer
  );
  fastify.patch(
    "/me/firm",
    { schema: updateFirmSchema, preHandler: requireRole("FIRM") },
    updateFirm
  );
  fastify.post(
    "/me/lawyer/setup",
    { schema: lawyerSetupSchema, preHandler: requireRole("LAWYER") },
    setupLawyer
  );
  fastify.post(
    "/me/firm/setup",
    { schema: firmSetupSchema, preHandler: requireRole("FIRM") },
    setupFirm
  );
  fastify.post(
    "/me/verification/document",
    { schema: verificationDocSchema, preHandler: requireRole("LAWYER", "FIRM") },
    uploadVerificationDocument
  );

  fastify.get("/:accountId/connections", { schema: { querystring: paginationQuery } }, getConnections);
  fastify.get("/:accountId/articles", { schema: { querystring: paginationQuery } }, getProfileArticles);
  fastify.get("/:accountId/reviews", { schema: { querystring: paginationQuery } }, getProfileReviews);
  fastify.get("/:accountId/posts", { schema: { querystring: paginationQuery } }, getProfilePosts);
}
