import { response, badRequest, notFound, forbidden } from "../helpers/utility";
import { Response, ResearchAttachment } from "../interface";
import {
  createThread,
  listThreads,
  findThreadById,
  updateThread,
  touchThread,
  softDeleteThread,
  createMessage,
  listMessagesForThread,
  countMessagesForThread,
} from "../dao/research";
import { runResearch, generateThreadTitle } from "../services/research";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "../services/storage";

const PDF_MIME = "application/pdf";

const assertOwner = (thread: { accountId: string } | null, accountId: string) => {
  if (!thread) throw notFound("Research thread not found");
  if (thread.accountId !== accountId) throw forbidden("You do not own this research thread");
};

export const _createThread = async (accountId: string): Promise<Response> => {
  const thread = await createThread(accountId);
  return response({ error: false, message: "Research thread created", data: thread });
};

export const _listThreads = async (accountId: string): Promise<Response> => {
  const threads = await listThreads(accountId);
  return response({ error: false, message: "Research threads retrieved", data: threads });
};

export const _getThread = async (id: string, accountId: string): Promise<Response> => {
  const thread = await findThreadById(id);
  assertOwner(thread, accountId);
  return response({ error: false, message: "Research thread retrieved", data: thread });
};

export const _postMessage = async (
  threadId: string,
  accountId: string,
  input: {
    text: string;
    pdfBuffer?: Buffer | null;
    pdfMimetype?: string;
    pdfFilename?: string;
  }
): Promise<Response> => {
  const thread = await findThreadById(threadId);
  assertOwner(thread, accountId);

  const text = (input.text || "").trim();
  if (!text) throw badRequest("Message text is required");
  if (text.length > 5000) throw badRequest("Message exceeds 5000 characters");

  // Optional PDF upload + validation (mirrors article-post handling).
  let attachment: ResearchAttachment | null = null;
  if (input.pdfBuffer && input.pdfBuffer.byteLength > 0) {
    if (input.pdfMimetype !== PDF_MIME) throw badRequest("File must be a PDF");
    if (input.pdfBuffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw badRequest("File does not appear to be a valid PDF");
    }
    const { url } = await uploadToR2({
      buffer: input.pdfBuffer,
      mimetype: input.pdfMimetype,
      originalName: input.pdfFilename || "document.pdf",
      folder: `research/${accountId}`,
      maxBytes: MAX_ARTICLE_ASSET_BYTES,
      allowPdf: true,
    });
    attachment = {
      kind: "pdf",
      url,
      filename: input.pdfFilename || "document.pdf",
      sizeBytes: input.pdfBuffer.byteLength,
    };
  }

  const isFirstMessage = (await countMessagesForThread(threadId)) === 0;

  // Persist the user message.
  await createMessage({
    threadId,
    role: "user",
    content: text,
    attachments: attachment ? [attachment as any] : null,
  });

  // Load prior turns (now includes the just-saved user message) as history.
  const prior = await listMessagesForThread(threadId);
  const history = prior
    .slice(0, -1) // exclude the current user message; it's passed as userText
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const result = await runResearch({
    history,
    userText: text,
    pdf:
      attachment && input.pdfBuffer && input.pdfMimetype
        ? {
            buffer: input.pdfBuffer,
            mimetype: input.pdfMimetype,
            filename: attachment.filename,
          }
        : undefined,
  });

  // When the answer was degraded (e.g. grounding unavailable), persist the note
  // alongside the answer so the thread history stays honest on reload.
  const content = result.degraded
    ? `${result.answer}\n\n> ⚠️ ${result.degraded}`
    : result.answer;

  const assistantMessage = await createMessage({
    threadId,
    role: "assistant",
    content,
    sources: result.sources.length ? (result.sources as any) : null,
    confident: result.confident,
  });

  // Title the thread from the first user message; otherwise just touch it.
  if (isFirstMessage) {
    const title = await generateThreadTitle(text);
    await updateThread(threadId, { title });
  } else {
    await touchThread(threadId);
  }

  return response({
    error: false,
    message: "Research response generated",
    data: { ...assistantMessage, grounded: result.grounded, widened: Boolean(result.widened) },
  });
};

export const _renameThread = async (
  id: string,
  accountId: string,
  title: string
): Promise<Response> => {
  const thread = await findThreadById(id);
  assertOwner(thread, accountId);
  const trimmed = (title || "").trim();
  if (!trimmed) throw badRequest("Title is required");
  if (trimmed.length > 120) throw badRequest("Title exceeds 120 characters");
  const updated = await updateThread(id, { title: trimmed });
  return response({ error: false, message: "Research thread renamed", data: updated });
};

export const _setPinned = async (
  id: string,
  accountId: string,
  pinned: boolean
): Promise<Response> => {
  const thread = await findThreadById(id);
  assertOwner(thread, accountId);
  const updated = await updateThread(id, { pinned });
  return response({
    error: false,
    message: pinned ? "Research thread pinned" : "Research thread unpinned",
    data: updated,
  });
};

export const _deleteThread = async (id: string, accountId: string): Promise<Response> => {
  const thread = await findThreadById(id);
  assertOwner(thread, accountId);
  await softDeleteThread(id);
  return response({ error: false, message: "Research thread deleted" });
};
