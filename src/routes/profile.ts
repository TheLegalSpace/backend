import { FastifyInstance } from "fastify";
import { authHook } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireVerifiedAccess } from "../middleware/requireVerifiedAccess";
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
  saveOnboardingDraft,
  getOnboardingDraft,
  clearOnboardingDraft,
} from "../controller/profile";
import {
  submitBarDetails,
  raiseScnDispute,
  uploadDisputeEvidence,
  getMyDispute,
  verifyIdentity,
  submitApplication,
  getVerificationState,
} from "../controller/verification";
import { stricter } from "../middleware/rateLimiter";
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
  barDetailsSchema,
  scnDisputeSchema,
  identityVerifySchema,
  disputeIdParamSchema,
  paginationQuery,
} from "../dto/profile";

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authHook);

  fastify.get("/me", getMe);
  // Everything under /me stays open — the wizard and the under-review screen
  // run on it, so gating it would make verification unreachable. Reading
  // *other* accounts is the platform, and is gated.
  fastify.get("/:accountId", { preHandler: requireVerifiedAccess }, getProfileById);
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

  // --- Professional identity verification (lawyer signup wizard) ------------
  //
  // Bar details is rate limited hard. An SCN is guessable (a year plus a short
  // sequence) and a hit returns a masked name and email, so without a ceiling
  // the endpoint is a roster scraper. Combined with needing a verified-email
  // account, enumeration costs a signup per handful of probes.
  fastify.post(
    "/me/bar-details",
    {
      schema: barDetailsSchema,
      preHandler: onboardingRoles,
      ...stricter(10, "1 hour"),
    },
    submitBarDetails
  );
  fastify.post(
    "/me/bar-details/dispute",
    { schema: scnDisputeSchema, preHandler: onboardingRoles, ...stricter(5, "1 hour") },
    raiseScnDispute
  );
  fastify.get(
    "/me/bar-details/dispute",
    { preHandler: onboardingRoles },
    getMyDispute
  );
  fastify.post(
    "/me/bar-details/dispute/:id/evidence",
    { schema: disputeIdParamSchema, preHandler: onboardingRoles },
    uploadDisputeEvidence
  );
  // Two attempts, each a paid lookup. The per-hour ceiling is a second line of
  // defence behind the attempt counter in the logic layer.
  fastify.post(
    "/me/identity",
    { schema: identityVerifySchema, preHandler: requireRole("LAWYER"), ...stricter(6, "1 hour") },
    verifyIdentity
  );
  fastify.post(
    "/me/application",
    { preHandler: requireRole("LAWYER", "FIRM") },
    submitApplication
  );
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

  fastify.get("/:accountId/connections", { schema: { querystring: paginationQuery }, preHandler: requireVerifiedAccess }, getConnections);
  fastify.get("/:accountId/articles", { schema: { querystring: paginationQuery }, preHandler: requireVerifiedAccess }, getProfileArticles);
  fastify.get("/:accountId/reviews", { schema: { querystring: paginationQuery }, preHandler: requireVerifiedAccess }, getProfileReviews);
  fastify.get("/:accountId/posts", { schema: { querystring: paginationQuery }, preHandler: requireVerifiedAccess }, getProfilePosts);
}
