import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  socketPath: process.env.SOCKET_PATH || "/realtime",
  eventsInboxEmail: process.env.EVENTS_INBOX_EMAIL || "events@thelegalspace.com",

  databaseUrl: process.env.DATABASE_URL || "",
  directUrl: process.env.DIRECT_URL || "",

  redisUrl: process.env.REDIS_URL || "",
  redisHost: process.env.REDIS_HOST || "",
  redisPort: parseInt(process.env.REDIS_PORT || "6379", 10),
  redisUsername: process.env.REDIS_USERNAME || "default",
  redisPassword: process.env.REDIS_PASSWORD || "",
  redisTls: process.env.REDIS_TLS === "true",

  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  r2AccountId: process.env.R2_ACCOUNT_ID || "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2Bucket: process.env.R2_BUCKET || "legalspace",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || "",

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinarySecure: process.env.SECURE === "true",

  brevoApiKey: process.env.BREVO_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "notifications@thelegalspace.com",
  emailFromName: process.env.EMAIL_FROM_NAME || "The Legal Space",

  geminiApiKey: process.env.GEMINI_API_KEY || "",

  // Web Push (VAPID). Private key stays server-side; the public key is embedded
  // in the frontend as the applicationServerKey. Push no-ops if the pair is unset.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:support@thelegalspace.com",

  // WhatsApp (Meta Cloud API). Disabled until a verified WhatsApp Business number
  // + approved message templates exist — then flip WHATSAPP_ENABLED=true.
  whatsappEnabled: process.env.WHATSAPP_ENABLED === "true",
  whatsappApiBase: process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  // Name of the approved Meta template used for the unread-client-message reminder.
  whatsappUnreadTemplate: process.env.WHATSAPP_UNREAD_TEMPLATE || "unread_client_message",

  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  // Frontend base URL Paystack redirects to after checkout (callback_url).
  // Used as the default when the client doesn't send its own callbackUrl.
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  // Extra origins allowed as client-supplied payment callback targets, beyond
  // FRONTEND_URL's origin and localhost (comma-separated), e.g. a Netlify
  // preview domain. Guards against open redirects off the back of a real payment.
  frontendAllowedOrigins: (process.env.FRONTEND_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const isProd = env.nodeEnv === "production";
