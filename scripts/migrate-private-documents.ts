import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma, connectDatabase, disconnectDatabase } from "../src/config/database";
import { cloudinary } from "../src/config/cloudinary";
import { deletePrivateDocument, parseCloudinaryUrl } from "../src/services/storage";

/**
 * One-off: move confidential documents uploaded before they went private.
 *
 *  1. KYC documents and SCN-dispute evidence (`VerificationDocument.s3Key`)
 *  2. Research PDFs (`ResearchMessage.attachments[].url`)
 *     — each Cloudinary asset is switched from public `upload` to `authenticated`
 *     in place (same public_id, so nothing is re-uploaded), and the row is
 *     rewritten to the private key shape `<public_id>.<format>`. The old public
 *     URL stops working.
 *  3. Research threads soft-deleted before deletion became permanent — erased,
 *     rows and files, as their owners were told they had been.
 *
 * Idempotent: rows already in the private shape are skipped, so it is safe to
 * re-run after a partial failure.
 *
 *   npx tsx scripts/migrate-private-documents.ts          # dry run
 *   npx tsx scripts/migrate-private-documents.ts --apply  # write
 */

const APPLY = process.argv.includes("--apply");
const RESOURCE_TYPE = "image"; // PDFs uploaded with resource_type "auto" are stored as images

const isPrivateKey = (key: string) => /\.[a-z0-9]+$/i.test(key);

/**
 * Make one asset private and return its private key, or null if it can't be found.
 * Tolerates an asset that an earlier, interrupted run already moved.
 */
const makePrivate = async (publicId: string, knownFormat?: string): Promise<string | null> => {
  try {
    const res = await cloudinary.api.resource(publicId, { resource_type: RESOURCE_TYPE, type: "upload" });
    const format = knownFormat || res.format;
    if (APPLY) {
      await cloudinary.uploader.rename(publicId, publicId, {
        resource_type: RESOURCE_TYPE,
        type: "upload",
        to_type: "authenticated",
        invalidate: true,
      });
    }
    return `${publicId}.${format}`;
  } catch (err: any) {
    if (err?.error?.http_code !== 404 && err?.http_code !== 404) throw err;
  }
  try {
    const res = await cloudinary.api.resource(publicId, {
      resource_type: RESOURCE_TYPE,
      type: "authenticated",
    });
    return `${publicId}.${knownFormat || res.format}`;
  } catch {
    return null;
  }
};

async function migrateVerificationDocuments() {
  const docs = await prisma.verificationDocument.findMany({ select: { id: true, s3Key: true } });
  const legacy = docs.filter((d) => !isPrivateKey(d.s3Key));
  console.log(`[kyc] ${docs.length} documents, ${legacy.length} still public`);
  for (const doc of legacy) {
    const key = await makePrivate(doc.s3Key);
    if (!key) {
      console.warn(`[kyc] asset missing for document ${doc.id} (${doc.s3Key}) — left as is`);
      continue;
    }
    console.log(`[kyc] ${doc.id}: ${doc.s3Key} -> ${key}`);
    if (APPLY) {
      await prisma.verificationDocument.update({ where: { id: doc.id }, data: { s3Key: key } });
    }
  }
}

async function migrateResearchAttachments() {
  const messages = await prisma.researchMessage.findMany({
    where: { attachments: { not: Prisma.DbNull }, thread: { deletedAt: null } },
    select: { id: true, attachments: true },
  });
  let moved = 0;
  for (const message of messages) {
    if (!Array.isArray(message.attachments)) continue;
    let changed = false;
    const next: any[] = [];
    for (const a of message.attachments as any[]) {
      if (a?.key || !a?.url) {
        next.push(a);
        continue;
      }
      const parsed = parseCloudinaryUrl(a.url);
      const key = parsed ? await makePrivate(parsed.publicId, parsed.format) : null;
      if (!key) {
        console.warn(`[research] asset missing for message ${message.id} (${a.url}) — left as is`);
        next.push(a);
        continue;
      }
      const { url, ...rest } = a;
      next.push({ ...rest, key });
      changed = true;
      moved++;
      console.log(`[research] ${message.id}: -> ${key}`);
    }
    if (changed && APPLY) {
      await prisma.researchMessage.update({ where: { id: message.id }, data: { attachments: next } });
    }
  }
  console.log(`[research] ${moved} attachments made private`);
}

async function purgeSoftDeletedThreads() {
  const threads = await prisma.researchThread.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, messages: { select: { attachments: true } } },
  });
  console.log(`[research] ${threads.length} soft-deleted threads to erase`);
  for (const thread of threads) {
    const keys = thread.messages
      .flatMap((m) => (Array.isArray(m.attachments) ? (m.attachments as any[]) : []))
      .map((a) => a?.key ?? (a?.url ? parseCloudinaryUrl(a.url)?.publicId : null))
      .filter((k): k is string => Boolean(k));
    console.log(`[research] erase thread ${thread.id} (${keys.length} files)`);
    if (APPLY) {
      await prisma.researchThread.delete({ where: { id: thread.id } });
      for (const key of keys) await deletePrivateDocument(key);
    }
  }
}

async function main() {
  await connectDatabase();
  console.log(APPLY ? "APPLYING changes" : "DRY RUN — pass --apply to write");
  await migrateVerificationDocuments();
  await migrateResearchAttachments();
  await purgeSoftDeletedThreads();
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
