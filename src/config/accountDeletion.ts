/**
 * How long a deleted account's identity record is retained before it may be
 * purged. The Nigeria Data Protection Act permits retaining personal data
 * beyond its original purpose where it is needed to establish, exercise or
 * defend a legal claim — so a deletion is a deactivation plus an archived
 * identity record, not an erasure.
 *
 * Seven years is the upper end of the 5-7 year window commonly applied to
 * professional-conduct and contractual disputes here. It is stamped onto every
 * AccountDeletionRecord as `purgeAfter` at deletion time, so a record carries
 * its own expiry rather than depending on whatever this constant says years
 * from now. Nothing purges yet — the column is what makes a purge job a
 * one-query change when we want one.
 */
export const DELETION_RECORD_RETENTION_YEARS = 7;

export const purgeAfterFor = (deletedAt: Date): Date => {
  const purge = new Date(deletedAt);
  purge.setFullYear(purge.getFullYear() + DELETION_RECORD_RETENTION_YEARS);
  return purge;
};

/** What a deleted account is called wherever its retained content still shows. */
export const DELETED_ACCOUNT_NAME = "Deleted Account";
