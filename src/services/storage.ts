import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { r2, r2PublicUrl } from "../config/r2";
import { env } from "../config/env";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

export interface UploadInput {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  folder: string;
  maxBytes?: number;
  allowPdf?: boolean;
}

export const uploadToR2 = async (input: UploadInput): Promise<{ key: string; url: string }> => {
  const { buffer, mimetype, originalName, folder, maxBytes, allowPdf } = input;
  if (maxBytes && buffer.byteLength > maxBytes) {
    throw new Error(`File exceeds max size of ${maxBytes} bytes`);
  }
  const allowed = allowPdf ? [...ALLOWED_IMAGE_MIMES, "application/pdf"] : ALLOWED_IMAGE_MIMES;
  if (!allowed.includes(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }
  const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
  const key = `${folder.replace(/\/$/, "")}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await r2.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );
  return { key, url: r2PublicUrl(key) };
};

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const MAX_ARTICLE_ASSET_BYTES = 25 * 1024 * 1024;
