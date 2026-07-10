-- Lead status vocabulary for TLS Services inquiries (admin design):
--   pending   -> new
--   contacted -> in_progress
-- 'closed' is unchanged. Event promotions (type = 'event_promotion') are left
-- untouched — they use pending/active/completed alongside payment_status.
-- `status` is a plain text column (no DB enum), so this is a data-only migration.

UPDATE "service_requests"
SET "status" = 'new'
WHERE "type" <> 'event_promotion' AND "status" = 'pending';

UPDATE "service_requests"
SET "status" = 'in_progress'
WHERE "type" <> 'event_promotion' AND "status" = 'contacted';
