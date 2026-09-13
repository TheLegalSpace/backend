import { FastifyReply, FastifyRequest } from "fastify";
import { onboardingState } from "../services/onboarding";
import {
  DISPUTED_STATUS,
  INITIAL_VERIFICATION_STATUS,
  UNDER_REVIEW_STATUS,
} from "../config/verification";

/**
 * The platform gate: a lawyer who has not been verified cannot enter the system.
 *
 * This is a stronger thing than `requireVerified`, which guards a single
 * high-trust action (accepting a lead) and stays permissive behind
 * `KYC_ENFORCEMENT_ENABLED`. This one is the wall around the product — feed,
 * posts, search, matchmaking, conversations, research, services. Until an admin
 * approves them, a lawyer sees the wizard and nothing else.
 *
 * **Why login still succeeds.** The obvious reading of "they can't enter the
 * system" is to refuse the token, but every wizard step — bar details, document
 * upload, NIN, Complete Registration — is an authenticated route, and so is the
 * under-review screen itself. Refusing the token would make verification
 * unreachable and strand everyone mid-flight. So the session is issued and the
 * surfaces are closed, which is the same thing from the user's side.
 *
 * **Who passes:**
 *  - USER and ADMIN — no verification concept applies to them
 *  - PENDING_PROFESSIONAL — still choosing a membership type, has no satellite yet
 *  - FIRM — deliberately ungated. The firm wizard runs the older ordering
 *    (payment *before* setup and before the application), so a firm at
 *    `under_review` has already paid, and locking it out is a different product
 *    call. Gate it once that flow is settled.
 *  - LAWYER at `verified`
 *
 * Everyone else gets a 403 carrying the status and the wizard's `nextStep`, so
 * the client routes to the right screen rather than re-deriving it from a bare
 * status string.
 */

const MESSAGES: Record<string, string> = {
  [INITIAL_VERIFICATION_STATUS]:
    "Finish verifying your professional details to access The Legal Space.",
  [UNDER_REVIEW_STATUS]:
    "Your application is under review. We'll email you as soon as it's approved.",
  [DISPUTED_STATUS]:
    "Your account is on hold while we review the dispute raised over this SCN.",
  rejected:
    "Your application wasn't approved. Check the reason on your profile, make the changes and submit again.",
};

export const requireVerifiedAccess = async (req: FastifyRequest, reply: FastifyReply) => {
  const account = req.account;
  if (!account) {
    return reply.status(401).send({ error: true, message: "Unauthorized" });
  }

  if (account.role !== "LAWYER") return;

  const status = account.lawyerProfile?.verificationStatus;
  if (status === "verified") return;

  // A LAWYER with no satellite has not reached the bar-details step yet. Treat
  // that as the start of the wizard rather than letting it fall through the
  // gate — the satellite is created at step 4, so its absence is an earlier
  // state than `pending`, not a more permissive one.
  const effective = status || INITIAL_VERIFICATION_STATUS;

  return reply.status(403).send({
    error: true,
    message: MESSAGES[effective] || MESSAGES[INITIAL_VERIFICATION_STATUS],
    data: {
      verificationBlocked: true,
      verificationStatus: effective,
      onboarding: onboardingState(account),
    },
  });
};
