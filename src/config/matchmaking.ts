// Matched-not-browsed tuning.
//
// The platform matches rather than lists: a client states their matter and gets
// one lawyer and one firm, not a rankable price list. These constants are the
// knobs on how tightly that holds. They live here (not inline) because they are
// product policy that will get tuned once there is real usage, and because the
// tests assert against them rather than against magic numbers.

/**
 * How long a user must wait before a fresh roll for the SAME practice area.
 * A repeat search inside this window replays the offer they already have.
 */
export const MATCH_COOLDOWN_HOURS = 48;

/**
 * How long an offer stays actionable — i.e. how long POST /requests will accept
 * the offered accounts. Deliberately longer than the cooldown so a client who
 * takes a few days to decide is not stranded with an offer they can no longer use.
 */
export const OFFER_VALID_DAYS = 7;

/** Rolling window for the per-practice-area offer quota. */
export const OFFER_WINDOW_DAYS = 7;

/**
 * Offers per practice area per OFFER_WINDOW_DAYS. Released offers (the lawyer
 * declined, or the request lapsed unanswered) do not count — a client should not
 * burn their allowance on someone who never replied.
 */
export const OFFERS_PER_AREA_PER_WINDOW = 2;

/**
 * A candidate shown to this user within this many days is held back, so the same
 * few names do not recur. Soft, not absolute: if honouring it would leave nobody
 * to offer, previously-seen candidates come back, least-recently-shown first.
 */
export const CANDIDATE_ROTATION_DAYS = 30;

/**
 * Randomisation band. Candidates scoring within this many points of the best are
 * all treated as eligible and one is drawn at random, weighted by score. Wide
 * enough that the top-scorer does not win every time (which is what makes pricing
 * inferable), narrow enough that a ₦2m matter is not handed to a poor fit.
 */
export const SELECTION_BAND_POINTS = 15;

/**
 * Always draw from at least this many candidates where they exist, even if the
 * band would be tighter. Stops a thin pool collapsing back to "always the same one".
 */
export const SELECTION_MIN_POOL = 5;

export const MATCH_COOLDOWN_MS = MATCH_COOLDOWN_HOURS * 60 * 60 * 1000;
export const OFFER_VALID_MS = OFFER_VALID_DAYS * 24 * 60 * 60 * 1000;
export const OFFER_WINDOW_MS = OFFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const CANDIDATE_ROTATION_MS = CANDIDATE_ROTATION_DAYS * 24 * 60 * 60 * 1000;
