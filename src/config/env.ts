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

  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  // Frontend base URL Paystack redirects to after checkout (callback_url).
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
};

export const isProd = env.nodeEnv === "production";
