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
 *  - Nothing load-bearing may depend on the logo loading. Most clients block
 *    remote images until the reader clicks "show images", so the logo is
 *    decorative and its alt text carries the brand when it doesn't render.
 */

const BRAND = "#0B3B5A";
const INK = "#101828";
const MUTED = "#667085";
const FAINT = "#98A2B3";
const BORDER = "#E4E7EC";
const CANVAS = "#F4F6F8";
const PANEL = "#F7F9FB";

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

/**
 * Masthead sizing and the reason for the dark band behind it.
 *
 * Gmail's mobile app force-inverts an email's CSS colours but never repaints
 * images. A transparent logo therefore collides with whatever the card became:
 * the dark site wordmark vanished on the inverted dark card, which is the bug
 * this replaces.
 *
 * Both available assets are transparent, so neither is safe on its own. What
 * makes it work is pairing the **white** artwork (`logo-email.png`) with a black
 * band: light mode renders a deliberate dark masthead, and Gmail's inversion
 * darkens light backgrounds rather than lightening dark ones, so the band stays
 * black and the white logo keeps its contrast either way.
 *
 * If you ever swap in an opaque asset, the band can go — an opaque image needs no
 * help. Keep `alt` white so a blocked image still reads against the band.
 */
const LOGO_W = 220;
const LOGO_H = 39;
/** The masthead band. Dark by design, not by theme — see above. */
const MASTHEAD_BG = "#000000";

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

/**
 * The masthead: logo when one is configured, plain wordmark otherwise.
 *
 * `alt` is the brand name rather than "Logo" so a reader with images off still
 * sees who the mail is from — the whole point of a masthead on a verification
 * email. Its colour is white because the alt text lands on the dark band. The
 * inline styles are repeated on the <img> because Outlook drops several of them
 * from a parent, and `display:block` kills the baseline gap Gmail otherwise
 * leaves under an image.
 */
const masthead = () =>
  env.emailLogoUrl
    ? `<img src="${env.emailLogoUrl}" width="${LOGO_W}" height="${LOGO_H}" alt="${env.emailFromName}"
             style="display:block;border:0;outline:none;text-decoration:none;width:${LOGO_W}px;height:${LOGO_H}px;max-width:100%;font:600 17px/1.3 ${SANS};color:#FFFFFF;" />`
    : `<span style="font:600 18px/1.3 ${SANS};color:#FFFFFF;letter-spacing:.3px;">${env.emailFromName}</span>`;

const shell = (opts: {
  preview: string;
  heading: string;
  intro: string;
  code: string;
  expiryNote: string;
  footer: string;
}) => `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<!-- Tells clients this design is light-only, so Outlook/Gmail dark modes don't
     force-invert the card and leave the dark wordmark on a dark background. -->
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-font-smoothing:antialiased;">
  <!-- Preheader: the grey line the inbox shows after the subject. Without it the
       client scrapes the first visible text, which would repeat the heading. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${opts.preview}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:32px 12px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;">

        <tr><td align="center" bgcolor="${MASTHEAD_BG}"
                 style="background-color:${MASTHEAD_BG};border-radius:13px 13px 0 0;padding:22px 32px;">
          ${masthead()}
        </td></tr>

        <tr><td align="center" style="padding:30px 32px 0;">
          <h1 style="margin:0 0 10px;font:600 23px/1.3 ${SANS};color:${INK};">${opts.heading}</h1>
          <p style="margin:0;font:400 15px/1.6 ${SANS};color:${MUTED};">${opts.intro}</p>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${PANEL};border:1px solid ${BORDER};border-radius:12px;">
            <tr><td align="center" style="padding:22px 12px 20px;">
              <div style="font:500 11px/1 ${SANS};color:${FAINT};letter-spacing:1.2px;text-transform:uppercase;padding-bottom:12px;">
                Your code
              </div>
              <div style="font:700 32px/1.1 ${MONO};letter-spacing:8px;color:${INK};text-indent:8px;">${opts.code}</div>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font:400 13px/1.6 ${SANS};color:${MUTED};">${opts.expiryNote}</p>
        </td></tr>

        <tr><td style="padding:24px 32px 32px;">
          <div style="height:1px;background:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
          <p style="margin:16px 0 0;font:400 13px/1.6 ${SANS};color:${MUTED};">${opts.footer}</p>
        </td></tr>

      </table>

      <p style="margin:18px 0 0;font:400 12px/1.5 ${SANS};color:${FAINT};">
        &copy; ${new Date().getFullYear()} ${env.emailFromName}
      </p>

    </td></tr>
  </table>
</body>
</html>`;

const EXPIRY_NOTE =
  "This code expires in 1 hour. If you asked for more than one code, only the newest one works. Don't share it with anyone.";
const EXPIRY_TEXT = [
  "This code expires in 1 hour. If you asked for more than one code, only the newest one works.",
  "Don't share it with anyone.",
];

export const verificationCodeEmail = (code: string): EmailBody => ({
  // Code first: it shows in the lock-screen/notification preview, so many users
  // never open the mail. The brand is carried by the From name, not repeated here.
  subject: `${code} is your verification code`,
  html: shell({
    preview: "Enter this code to finish creating your account.",
    heading: "Confirm your email",
    intro: "Enter this code to finish creating your account.",
    code,
    expiryNote: EXPIRY_NOTE,
    footer:
      "If you didn't try to create an account, you can ignore this email — nothing was set up.",
  }),
  text: [
    "Confirm your email",
    "",
    "Enter this code to finish creating your account:",
    "",
    `    ${code}`,
    "",
    ...EXPIRY_TEXT,
    "",
    "If you didn't try to create an account, you can ignore this email — nothing was set up.",
    "",
    `— ${env.emailFromName}`,
  ].join("\n"),
});

export const passwordResetCodeEmail = (code: string): EmailBody => ({
  subject: `${code} is your password reset code`,
  html: shell({
    preview: "Enter this code to choose a new password.",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password.",
    code,
    expiryNote: EXPIRY_NOTE,
    footer:
      "If you didn't ask to reset your password, ignore this email — your password has not changed.",
  }),
  text: [
    "Reset your password",
    "",
    "Enter this code to choose a new password:",
    "",
    `    ${code}`,
    "",
    ...EXPIRY_TEXT,
    "",
    "If you didn't ask to reset your password, ignore this email — your password has not changed.",
    "",
    `— ${env.emailFromName}`,
  ].join("\n"),
});

// ---------------------------------------------------------------------------
// Verification outcome
// ---------------------------------------------------------------------------

/**
 * The same card as `shell`, with a call-to-action button where the code block
 * goes, and an optional callout panel for a rejection reason.
 *
 * A separate shell rather than a flag on the existing one because the code block
 * is the entire middle of that layout — the monospace panel, the "YOUR CODE"
 * eyebrow and the expiry line all exist to serve it. Threading an "is this a
 * code or a button" conditional through it would have left one function serving
 * two designs badly.
 *
 * The button is a table, not an <a> with padding: Outlook's renderer drops the
 * padding and leaves a bare text link. The same URL is repeated as visible text
 * underneath because a corporate mail client that strips the button would
 * otherwise leave the reader with no way through, and because this mail is the
 * only route back for someone who is locked out of the app.
 */
const actionShell = (opts: {
  preview: string;
  heading: string;
  intro: string;
  callout?: { label: string; body: string };
  ctaLabel?: string;
  ctaUrl?: string;
  footer: string;
}) => `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${opts.preview}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:32px 12px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;">

        <tr><td align="center" style="padding:32px 32px 0;">
          ${masthead()}
        </td></tr>

        <tr><td align="center" style="padding:26px 32px 0;">
          <h1 style="margin:0 0 10px;font:600 23px/1.3 ${SANS};color:${INK};">${opts.heading}</h1>
          <p style="margin:0;font:400 15px/1.6 ${SANS};color:${MUTED};">${opts.intro}</p>
        </td></tr>

        ${
          opts.callout
            ? `<tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${PANEL};border:1px solid ${BORDER};border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="font:500 11px/1 ${SANS};color:${FAINT};letter-spacing:1.2px;text-transform:uppercase;padding-bottom:10px;">
                ${opts.callout.label}
              </div>
              <div style="font:400 15px/1.6 ${SANS};color:${INK};">${opts.callout.body}</div>
            </td></tr>
          </table>
        </td></tr>`
            : ""
        }

        ${
          opts.ctaUrl && opts.ctaLabel
            ? `<tr><td align="center" style="padding:26px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="background:${BRAND};border-radius:10px;">
              <a href="${opts.ctaUrl}"
                 style="display:inline-block;padding:13px 28px;font:600 15px/1 ${SANS};color:#FFFFFF;text-decoration:none;">
                ${opts.ctaLabel}
              </a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font:400 12px/1.6 ${SANS};color:${FAINT};word-break:break-all;">
            Or paste this into your browser:<br />${opts.ctaUrl}
          </p>
        </td></tr>`
            : ""
        }

        <tr><td style="padding:24px 32px 32px;">
          <div style="height:1px;background:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
          <p style="margin:16px 0 0;font:400 13px/1.6 ${SANS};color:${MUTED};">${opts.footer}</p>
        </td></tr>

      </table>

      <p style="margin:18px 0 0;font:400 12px/1.5 ${SANS};color:${FAINT};">
        &copy; ${new Date().getFullYear()} ${env.emailFromName}
      </p>

    </td></tr>
  </table>
</body>
</html>`;

/** Escapes admin-authored text before it is interpolated into the HTML body. */
const escapeHtml = (raw: string) =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Sent when an admin approves a professional application.
 *
 * This mail is load-bearing rather than courteous: an applicant awaiting review
 * cannot reach any part of the product, so there is nothing in-app that can tell
 * them the wait is over. The in-app notification is written at the same moment,
 * but they have to be let in before they can read it.
 */
export const verificationApprovedEmail = (name: string): EmailBody => ({
  subject: "You're verified — welcome to The Legal Space",
  html: actionShell({
    preview: "Your professional verification is complete. Choose a plan to get started.",
    heading: "You're verified",
    intro: `${escapeHtml(
      name
    )}, your professional details have been confirmed. The last step is choosing your membership plan, and your profile goes live.`,
    ctaLabel: "Choose your plan",
    ctaUrl: `${env.frontendUrl}/membership/plans`,
    footer: "Signing in with the email and password you registered with will take you there too.",
  }),
  text: [
    "You're verified",
    "",
    `${name}, your professional details have been confirmed.`,
    "The last step is choosing your membership plan, and your profile goes live.",
    "",
    `Choose your plan: ${env.frontendUrl}/membership/plans`,
    "",
    "Signing in with the email and password you registered with will take you there too.",
    "",
    `— ${env.emailFromName}`,
  ].join("\n"),
});

/**
 * Sent when an admin rejects an application.
 *
 * Carries the reason, because a rejected applicant is locked out of the app and
 * cannot read the in-app notification that says why. A rejection they can't read
 * is indistinguishable from the platform being broken — and since rejection is
 * retryable, the reason is the only thing that tells them what to change.
 */
export const verificationRejectedEmail = (name: string, reason: string): EmailBody => ({
  subject: "About your Legal Space application",
  html: actionShell({
    preview: "We couldn't approve your application yet — here's what to change.",
    heading: "We couldn't approve this yet",
    intro: `${escapeHtml(
      name
    )}, we reviewed your application and can't approve it as submitted. You can fix the issue below and send it back for review.`,
    callout: { label: "What needs changing", body: escapeHtml(reason) },
    ctaLabel: "Update and resubmit",
    ctaUrl: `${env.frontendUrl}/verification`,
    footer: `If you think this is a mistake, reply to this email or contact us at ${env.emailFrom}.`,
  }),
  text: [
    "We couldn't approve this yet",
    "",
    `${name}, we reviewed your application and can't approve it as submitted.`,
    "",
    "What needs changing:",
    `    ${reason}`,
    "",
    `Update and resubmit: ${env.frontendUrl}/verification`,
    "",
    `If you think this is a mistake, reply to this email or contact us at ${env.emailFrom}.`,
    "",
    `— ${env.emailFromName}`,
  ].join("\n"),
});
