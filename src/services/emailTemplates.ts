import { env } from "../config/env";

/**
 * Transactional email bodies.
 *
 * These live in the repo rather than in the Supabase dashboard's template editor
 * so they are versioned, reviewable, and identical across environments — dashboard
 * templates are per-project config and drift silently between staging and prod.
 *
 * Constraints worth keeping if you edit these:
 *  - Table-based layout and inline styles. Gmail strips <style> blocks, and
 *    Outlook's renderer does not do flex/grid.
 *  - Every message ships a plain-text alternative. HTML-only mail scores as spam,
 *    which for an auth code means the user simply never receives it.
 *  - The code is rendered as selectable text, never an image — it has to survive
 *    image-blocking, screen readers, and copy-paste.
 */

const BRAND = "#0B3B5A";
const INK = "#101828";
const MUTED = "#667085";
const BORDER = "#E4E7EC";

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

const shell = (heading: string, intro: string, code: string, expiryNote: string, footer: string) => `
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#F4F6F8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font:600 15px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND};letter-spacing:.2px;">
            ${env.emailFromName}
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="margin:0 0 10px;font:600 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
            ${heading}
          </h1>
          <p style="margin:0 0 22px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
            ${intro}
          </p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FB;border:1px solid ${BORDER};border-radius:10px;">
            <tr><td align="center" style="padding:20px 12px;">
              <span style="font:600 30px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:7px;color:${INK};">
                ${code}
              </span>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
            ${expiryNote}
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 30px;">
          <hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />
          <p style="margin:0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
            ${footer}
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#98A2B3;">
        &copy; ${new Date().getFullYear()} ${env.emailFromName}
      </p>
    </td></tr>
  </table>
</body>
</html>`;

export const verificationCodeEmail = (code: string): EmailBody => ({
  // Code first: it shows in the lock-screen/notification preview, so many users
  // never open the mail. The brand is carried by the From name, not repeated here.
  subject: `${code} is your verification code`,
  html: shell(
    "Confirm your email",
    "Enter this code to finish creating your account.",
    code,
    "This code expires in 1 hour. If you asked for more than one code, only the newest one works. Don't share it with anyone.",
    "If you didn't try to create an account, you can ignore this email — nothing was set up."
  ),
  text: [
    `Confirm your email`,
    ``,
    `Enter this code to finish creating your account:`,
    ``,
    `    ${code}`,
    ``,
    `This code expires in 1 hour. If you asked for more than one code, only the newest one works.`,
    `Don't share it with anyone.`,
    ``,
    `If you didn't try to create an account, you can ignore this email — nothing was set up.`,
    ``,
    `— ${env.emailFromName}`,
  ].join("\n"),
});

export const passwordResetCodeEmail = (code: string): EmailBody => ({
  subject: `${code} is your password reset code`,
  html: shell(
    "Reset your password",
    "Enter this code to choose a new password.",
    code,
    "This code expires in 1 hour. If you asked for more than one code, only the newest one works. Don't share it with anyone.",
    "If you didn't ask to reset your password, ignore this email — your password has not changed."
  ),
  text: [
    `Reset your password`,
    ``,
    `Enter this code to choose a new password:`,
    ``,
    `    ${code}`,
    ``,
    `This code expires in 1 hour. If you asked for more than one code, only the newest one works.`,
    `Don't share it with anyone.`,
    ``,
    `If you didn't ask to reset your password, ignore this email — your password has not changed.`,
    ``,
    `— ${env.emailFromName}`,
  ].join("\n"),
});
