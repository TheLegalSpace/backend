import { DISPUTED_STATUS, UNDER_REVIEW_STATUS } from "../config/verification";

/**
 * Where a professional is in the signup wizard, as a single field.
 *
 * Lives here rather than in `logic/profile.ts` because two callers need the same
 * answer and they must not drift: `GET /profile/me` renders the client's resume
 * point from it, and `requireVerifiedAccess` puts it on the 403 body so a blocked
 * request tells the client which screen to show. Deriving it twice would mean the
 * gate could send someone to a screen the profile endpoint disagrees with.
 */
export interface OnboardingState {
  nextStep: string;
  verificationStatus: string | null;
  hasBarDetails: boolean;
  identityChecked: boolean;
  applicationSubmitted: boolean;
  profileComplete: boolean;
  disputeOpen: boolean;
  /** Why the last review failed, so a blocked client can render the fix-it screen. */
  rejectionReason: string | null;
}

/** Only meaningful while rejected — a reason left over from a prior round would
 *  otherwise read as a live problem on an approved account. */
const rejectionReasonOf = (profile: any, status: string | null): string | null =>
  status === "rejected" ? (profile?.verificationFlags as any)?.rejectionReason ?? null : null;

export const onboardingState = (account: any): OnboardingState => {
  const profile: any = account.lawyerProfile || account.firmProfile;
  const verificationStatus = profile?.verificationStatus ?? null;
  const hasBarDetails = Boolean(account.lawyerProfile?.scn);
  const identityChecked = Boolean(account.lawyerProfile?.identityCheckStatus);
  const submitted = Boolean(profile?.applicationSubmittedAt);
  const profileComplete = Boolean(account.profileCompletedAt);
  const isProfessionalTier = account.membershipTier === "professional";

  // A firm has no bar-details or NIN step yet, and its satellite is still
  // created at setup — so its wizard is the older shape: plan, then setup.
  const isFirm = account.role === "FIRM";

  let nextStep = "complete";
  if (isFirm) {
    if (!isProfessionalTier && !profileComplete) nextStep = "select_plan";
    else if (!profileComplete) nextStep = "profile_setup";
    else if (!submitted) nextStep = "submit_application";
    else if (verificationStatus === UNDER_REVIEW_STATUS) nextStep = "await_review";
    else if (verificationStatus === "rejected") nextStep = "rejected";
    return {
      nextStep,
      verificationStatus,
      hasBarDetails: false,
      identityChecked: false,
      applicationSubmitted: submitted,
      profileComplete,
      disputeOpen: false,
      rejectionReason: rejectionReasonOf(profile, verificationStatus),
    };
  }

  if (!hasBarDetails) nextStep = "bar_details";
  else if (!identityChecked) nextStep = "identity";
  else if (!submitted) nextStep = "submit_application";
  else if (verificationStatus === UNDER_REVIEW_STATUS) nextStep = "await_review";
  else if (verificationStatus === DISPUTED_STATUS) nextStep = "await_dispute";
  else if (verificationStatus === "rejected") nextStep = "rejected";
  else if (!isProfessionalTier) nextStep = "select_plan";
  else if (!profileComplete) nextStep = "profile_setup";

  return {
    nextStep,
    verificationStatus,
    hasBarDetails,
    identityChecked,
    applicationSubmitted: submitted,
    profileComplete,
    disputeOpen: Boolean((profile?.verificationFlags as any)?.disputeOpen),
    rejectionReason: rejectionReasonOf(profile, verificationStatus),
  };
};
