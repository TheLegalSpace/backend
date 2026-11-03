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

// ---- Private documents ----
//
// KYC documents, SCN-dispute evidence and research PDFs are confidential, so they
// are stored as Cloudinary `authenticated` assets: there is no public URL, and the
// only way to fetch one is a signed download link that expires. Links are minted
// at read time, behind whatever ownership check the endpoint applies, so a link
// that leaks stops working within PRIVATE_LINK_TTL_SECONDS.
//
// The stored key is `<public_id>.<format>` — the download API needs the format,
// and generated public_ids never contain a dot. A key with no extension is a
// legacy public upload from before this existed; see
// `scripts/migrate-private-documents.ts`, which converts those in place.

export const PRIVATE_LINK_TTL_SECONDS = 15 * 60;

// PDFs and images uploaded with resource_type "auto" are both stored as "image".
const DOCUMENT_RESOURCE_TYPE = "image";

export const uploadPrivateDocument = async (
  input: UploadInput
): Promise<{ key: string }> => {
  const { buffer, mimetype, folder, maxBytes } = input;
  if (maxBytes && buffer.byteLength > maxBytes) {
    throw new Error(`File exceeds max size of ${maxBytes} bytes`);
  }
  const allowed = [...ALLOWED_IMAGE_MIMES, "application/pdf"];
  if (!allowed.includes(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  const result = await new Promise<any>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder.replace(/\/$/, ""),
        public_id: `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`,
        resource_type: "auto",
        type: "authenticated",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });

  return { key: `${result.public_id}.${result.format}` };
};

const isPrivateKey = (key: string) => /\.[a-z0-9]+$/i.test(key);

const splitPrivateKey = (key: string) => {
  const dot = key.lastIndexOf(".");
  return { publicId: key.slice(0, dot), format: key.slice(dot + 1) };
};

/**
 * A time-limited link to a stored document.
 *
 * Handles both key shapes, so the app keeps working whether or not the migration
 * script has run yet: a private key gets an expiring download link; a legacy key
 * (bare public_id of a public upload) gets its old delivery URL.
 */
export const documentUrl = (key: string): string => {
  if (!isPrivateKey(key)) {
    return cloudinary.url(key, {
      resource_type: DOCUMENT_RESOURCE_TYPE,
      type: "upload",
      secure: true,
      sign_url: true,
    });
  }
  const { publicId, format } = splitPrivateKey(key);
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: DOCUMENT_RESOURCE_TYPE,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + PRIVATE_LINK_TTL_SECONDS,
  });
};

/**
 * Permanently remove a stored document. Best-effort — callers have already
 * deleted the row that referenced it, so a failure leaves an unreachable private
 * file rather than a broken record, and is logged rather than surfaced.
 */
export const deletePrivateDocument = async (key: string): Promise<void> => {
  const { publicId, type } = isPrivateKey(key)
    ? { publicId: splitPrivateKey(key).publicId, type: "authenticated" }
    : { publicId: key, type: "upload" };
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: DOCUMENT_RESOURCE_TYPE,
      type,
      invalidate: true,
    });
  } catch (err) {
    console.error(`[storage] failed to delete ${publicId}:`, (err as Error).message);
  }
};

/**
 * Recover the public_id and format from a legacy public delivery URL, e.g.
 * `https://res.cloudinary.com/<cloud>/image/upload/v1712/research/<acc>/<id>.pdf`.
 * Research attachments stored only the URL before keys existed.
 */
export const parseCloudinaryUrl = (
  url: string
): { publicId: string; format: string; resourceType: string } | null => {
  // `secure_url` always carries a version segment, so anchor on it rather than
  // trying to tell transformation segments apart from folders.
  const match = url
    .split(/[?#]/)[0]
    .match(/\/(image|raw|video)\/upload\/(?:.*?\/)?v\d+\/(.+)\.([a-z0-9]+)$/i);
  if (!match) return null;
  return { resourceType: match[1], publicId: match[2], format: match[3] };
};

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const MAX_ARTICLE_ASSET_BYTES = 25 * 1024 * 1024;
