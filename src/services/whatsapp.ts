import { env } from "../config/env";

export interface WhatsAppTemplateMessage {
  to: string; // recipient phone in E.164 (e.g. 2348012345678)
  template: string; // approved Meta template name
  params?: string[]; // ordered body variables substituted into the template
}

/**
 * Send a WhatsApp template message via Meta's WhatsApp Cloud API.
 *
 * Business-initiated messages (like our unread-client reminder) MUST use a
 * pre-approved template — free-form text is only allowed inside the 24h
 * customer-service window. This is intentionally behind `WHATSAPP_ENABLED`:
 * until a verified WhatsApp Business number + approved templates exist, this
 * no-ops and just logs, so the rest of the notification pipeline ships now.
 *
 * Returns true if the message was accepted by Meta, false otherwise. Never
 * throws — WhatsApp is a best-effort side channel and must not break the
 * in-app notification it accompanies.
 */
export const sendWhatsAppTemplate = async (
  msg: WhatsAppTemplateMessage
): Promise<boolean> => {
  if (!env.whatsappEnabled) {
    console.log(
      `[whatsapp] disabled — would send template="${msg.template}" to=${msg.to}`
    );
    return false;
  }
  if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) {
    console.warn("[whatsapp] enabled but missing access token / phone number id");
    return false;
  }
  const to = msg.to.replace(/[^\d]/g, "");
  if (!to) {
    console.warn("[whatsapp] recipient has no usable phone number");
    return false;
  }

  try {
    const res = await fetch(
      `${env.whatsappApiBase}/${env.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.whatsappAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: msg.template,
            language: { code: "en" },
            ...(msg.params && msg.params.length
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: msg.params.map((text) => ({ type: "text", text })),
                    },
                  ],
                }
              : {}),
          },
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[whatsapp] send failed status=${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[whatsapp] send error:", err?.message);
    return false;
  }
};
