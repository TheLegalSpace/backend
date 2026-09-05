// Professional verification (KYC) — the taxonomy behind the signup wizard's
// "Verify Your Professional Status" step and the admin review queue.
//
// Status lifecycle:
//   pending      — profile set up, required document not uploaded yet
//   under_review — required document received, waiting on an admin
//   verified     — an admin approved it
//   rejected     — an admin rejected it
//
// The admin queue (`dao/admin.ts → listKycQueue`) filters on `under_review`, so
// only the upload transition puts an account in front of a human. Before this
// existed, setup wrote `verified` outright and uploads never moved the status —
// certificates landed in storage and no admin ever saw them.

export const INITIAL_VERIFICATION_STATUS = "pending";
export const UNDER_REVIEW_STATUS = "under_review";

// Every document type an account of this role may upload.
export const ALLOWED_DOC_TYPES: Record<string, string[]> = {
  LAWYER: ["call_to_bar_cert", "practicing_cert", "id_card"],
  FIRM: ["cac_cert"],
};

// The subset that must be present before the account enters the review queue.
// Deliberately one document per role — the signup wizard asks for exactly one
// (Call to Bar Certificate / Certificate of Incorporation), and asking for more
// at the door is what onboarding drop-off is made of. The others stay uploadable
// and give an admin more to go on when a borderline case needs it.
export const REQUIRED_DOC_TYPES: Record<string, string[]> = {
  LAWYER: ["call_to_bar_cert"],
  FIRM: ["cac_cert"],
};

// Labels the upload step renders, served from here so the string the user reads
// is the value the API validates.
export const DOC_TYPE_LABELS: Record<string, string> = {
  call_to_bar_cert: "Call to Bar Certificate",
  practicing_cert: "NBA Practicing Certificate",
  id_card: "Means of Identification",
  cac_cert: "Certificate of Incorporation",
};

export const allowedDocTypes = (role: string): string[] => ALLOWED_DOC_TYPES[role] ?? [];
export const requiredDocTypes = (role: string): string[] => REQUIRED_DOC_TYPES[role] ?? [];
