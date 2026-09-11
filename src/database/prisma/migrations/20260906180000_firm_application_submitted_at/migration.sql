-- Firms need the same "application submitted" stamp lawyers have.
--
-- POST /profile/me/application is the only thing that moves a professional to
-- `under_review`, which is the status the admin KYC queue selects on. Without
-- this column that endpoint had no firm-side equivalent to stamp, so a firm
-- could upload its CAC certificate and sit at `pending` forever, invisible to
-- every admin.

ALTER TABLE "firm_profiles" ADD COLUMN "application_submitted_at" TIMESTAMP(3);
