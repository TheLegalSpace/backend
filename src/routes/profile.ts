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
  setProfessionalRole,
  setupLawyer,
  setupFirm,
  uploadVerificationDocument,
  getVerificationState,
  saveOnboardingDraft,
  getOnboardingDraft,
  clearOnboardingDraft,
} from "../controller/profile";
import {
  updateProfileSchema,
  toggleAnonymousSchema,
  updatePracticeAreasSchema,
  updateLawyerSchema,
  updateFirmSchema,
  professionalRoleSchema,
  lawyerSetupSchema,
  firmSetupSchema,
  verificationDocSchema,
  onboardingDraftSchema,
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
  fastify.patch(
    "/me/professional-role",
    {
      schema: professionalRoleSchema,
      preHandler: requireRole("PENDING_PROFESSIONAL", "LAWYER", "FIRM"),
    },
    setProfessionalRole
  );
  fastify.post(
    "/me/lawyer/setup",
    { schema: lawyerSetupSchema, preHandler: requireRole("PENDING_PROFESSIONAL", "LAWYER") },
    setupLawyer
  );
  fastify.post(
    "/me/firm/setup",
    { schema: firmSetupSchema, preHandler: requireRole("PENDING_PROFESSIONAL", "FIRM") },
    setupFirm
  );
  // Wizard draft state. Open to PENDING_PROFESSIONAL as well as LAWYER/FIRM —
  // the account is still PENDING_PROFESSIONAL for most of the wizard, and a
  // lawyer who paid before setup is LAWYER with no satellite profile yet.
  const onboardingRoles = requireRole("PENDING_PROFESSIONAL", "LAWYER", "FIRM");
  fastify.post(
    "/me/onboarding-draft",
    { schema: onboardingDraftSchema, preHandler: onboardingRoles },
    saveOnboardingDraft
  );
  fastify.get("/me/onboarding-draft", { preHandler: onboardingRoles }, getOnboardingDraft);
  fastify.delete("/me/onboarding-draft", { preHandler: onboardingRoles }, clearOnboardingDraft);

  fastify.get(
    "/me/verification",
    { preHandler: requireRole("LAWYER", "FIRM") },
    getVerificationState
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
