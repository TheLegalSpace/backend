// Matches the browser PushSubscription.toJSON() shape the frontend sends:
// { subscription: { endpoint, expirationTime, keys: { p256dh, auth } }, deviceType }
export const subscribePushSchema = {
  body: {
    type: "object",
    required: ["subscription"],
    properties: {
      subscription: {
        type: "object",
        required: ["endpoint", "keys"],
        properties: {
          endpoint: { type: "string", minLength: 1 },
          expirationTime: { type: ["integer", "null"] },
          keys: {
            type: "object",
            required: ["p256dh", "auth"],
            properties: {
              p256dh: { type: "string", minLength: 1 },
              auth: { type: "string", minLength: 1 },
            },
          },
        },
      },
      deviceType: { type: "string", maxLength: 40 },
    },
  },
};

// Unsubscribe accepts either a bare endpoint or the full subscription object,
// so the frontend can send whichever it has on hand.
export const unsubscribePushSchema = {
  body: {
    type: "object",
    properties: {
      endpoint: { type: "string", minLength: 1 },
      subscription: {
        type: "object",
        properties: { endpoint: { type: "string", minLength: 1 } },
      },
    },
  },
};
