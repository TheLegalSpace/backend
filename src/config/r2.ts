import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

export const r2PublicUrl = (key: string): string => {
  if (env.r2PublicBaseUrl) {
    return `${env.r2PublicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
  return `https://${env.r2Bucket}.${env.r2AccountId}.r2.cloudflarestorage.com/${key}`;
};
