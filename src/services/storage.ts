import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";
import "../config/cloudinary"; // Ensure Cloudinary is configured
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

  // Upload to Cloudinary
  const result = await new Promise<any>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder.replace(/\/$/, ""),
        public_id: `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });

  return { key: result.public_id, url: result.secure_url };
};

// Build a secure, signed delivery URL for a stored asset (identified by its
// Cloudinary public_id / `s3Key`). Used by admins to view KYC documents.
// NOTE (hardening TODO): verification docs are currently uploaded as public
// `type: "upload"` assets, so `sign_url` signs the transform but does not truly
// gate access. For enforced privacy, upload KYC docs with
// `access_mode: "authenticated"` and serve time-limited token URLs.
export const signedFileUrl = (publicId: string): string => {
  // PDFs uploaded with resource_type "auto" are stored by Cloudinary as "image".
  return cloudinary.url(publicId, {
    resource_type: "image",
    type: "upload",
    secure: true,
    sign_url: true,
  });
};

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const MAX_ARTICLE_ASSET_BYTES = 25 * 1024 * 1024;
