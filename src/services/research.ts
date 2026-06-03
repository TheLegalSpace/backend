import { getClient, isTransientError, sleep } from "./llm";
import { serviceUnavailable } from "../helpers/utility";
import {
  RunResearchInput,
  RunResearchResult,
  ResearchSource,
} from "../interface/research";

const RESEARCH_MODEL = "gemini-2.5-flash";

export const REFUSAL_TEXT =
  "I'm not confident enough in the available sources to give you a reliable answer. Instead of guessing, I'd recommend refining the query, uploading supporting documents, or providing a jurisdiction/source reference.";

const SYSTEM_PROMPT = `You are a Nigerian legal research assistant for legal professionals (lawyers and law firms).

Your job:
- Help with legal research: case law, statutes, summaries, plain-language explanations, citation assistance, and analysis of documents the user uploads.
- Ground EVERY legal claim (case names, citations, statutes, sections, holdings) in the Google Search results available to you. Prefer authoritative Nigerian sources.
- NEVER fabricate or guess case names, citations, statute sections, or holdings. If you cannot find reliable sources to support an answer, do not invent one.

Refusal rule (critical):
- When the available sources are insufficient, weak, or absent for the legal question asked, DO NOT guess. Respond with exactly this text and nothing else:
"${REFUSAL_TEXT}"

Scope:
- You are source-based legal research only. You do not provide legal representation or formal legal advice, you do not build websites or apps, and you do not perform tasks outside legal research and document understanding.
- Politely and briefly decline out-of-scope requests, then offer to help with a legal research question instead.

Style:
- Be precise and professional. Cite the sources you relied on inline by name. Keep answers focused and well-structured.`;

const toText = (history: RunResearchInput["history"], userText: string): string => {
  const transcript = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");
  const prefix = transcript ? `${transcript}\n\n` : "";
  return `${SYSTEM_PROMPT}\n\n--- Conversation so far ---\n${prefix}User: ${userText}`;
};

const extractSources = (response: any): ResearchSource[] => {
  const chunks =
    response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri) continue;
    if (seen.has(web.uri)) continue;
    seen.add(web.uri);
    sources.push({ url: web.uri, title: web.title || web.uri });
  }
  return sources;
};

const buildContents = (input: RunResearchInput) => {
  const text = toText(input.history, input.userText);
  if (!input.pdf) return text;
  return [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: input.pdf.mimetype,
            data: input.pdf.buffer.toString("base64"),
          },
        },
        { text },
      ],
    },
  ];
};

const generateWithRetry = async (params: any, attempts = 3): Promise<any> => {
  const client = getClient();
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1 && isTransientError(err)) {
        await sleep(500 * Math.pow(2, i));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

/**
 * Runs a grounded legal-research turn. Uses Gemini with the built-in Google
 * Search tool. Note: googleSearch cannot be combined with responseSchema (JSON
 * mode), so the answer is free-form text and sources come from grounding
 * metadata.
 *
 * Failure handling is task-aware and transparent — we never silently answer
 * ungrounded for a pure research question (that's the hallucination this
 * feature exists to avoid):
 *  - Pure research, grounding fails -> throw 503 with the real cause.
 *  - PDF attached, grounding fails  -> fall back to doc-only analysis but flag
 *    it as `degraded` so the user knows sources weren't verified.
 *  - Model unreachable entirely     -> throw 503 with the real cause.
 */
export const runResearch = async (
  input: RunResearchInput
): Promise<RunResearchResult> => {
  const contents = buildContents(input);

  let response: any;
  try {
    response = await generateWithRetry({
      model: RESEARCH_MODEL,
      contents,
      config: { tools: [{ googleSearch: {} }], temperature: 0 },
    });
  } catch (err) {
    const detail = String((err as any)?.message || err || "unknown error");
    console.error("[research] grounded generation failed:", {
      detail,
      status: (err as any)?.status ?? (err as any)?.code,
      hasPdf: Boolean(input.pdf),
    });

    if (input.pdf) {
      // Document understanding doesn't strictly need web search. Degrade to a
      // doc-only analysis, but tell the user grounding was unavailable.
      try {
        const docOnly = await generateWithRetry({
          model: RESEARCH_MODEL,
          contents,
          config: { temperature: 0 },
        });
        const docAnswer = (docOnly?.text ?? "").trim();
        if (!docAnswer) throw new Error("empty response");
        return {
          answer: docAnswer,
          sources: [],
          confident: docAnswer !== REFUSAL_TEXT,
          grounded: false,
          degraded:
            "Legal source search was unavailable, so this is based only on the uploaded document and general knowledge — verify any cited cases or statutes independently.",
        };
      } catch (docErr) {
        console.error("[research] doc-only fallback also failed:", {
          detail: String((docErr as any)?.message || docErr || "unknown error"),
        });
        throw serviceUnavailable(
          `The research model is temporarily unavailable. Please try again shortly. (${detail})`
        );
      }
    }

    // Pure research with no document: grounding is essential. Surface the real
    // error rather than answering ungrounded.
    throw serviceUnavailable(
      `Legal source search is currently unavailable, so I can't verify citations right now. Please try again shortly. (${detail})`
    );
  }

  const answer = (response?.text ?? "").trim() || REFUSAL_TEXT;
  const sources = extractSources(response);
  const isRefusal = answer === REFUSAL_TEXT;
  // Confident when grounded in at least one source and not a refusal.
  const confident = !isRefusal && sources.length > 0;

  return { answer, sources, confident, grounded: true };
};

/**
 * Generates a short (≤6 word) topic title for a research thread from the first
 * user message. Non-grounded, fast call. Falls back to a truncation.
 */
export const generateThreadTitle = async (
  firstUserText: string
): Promise<string> => {
  const fallback = () => {
    const trimmed = firstUserText.trim().replace(/\s+/g, " ");
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed || "New research";
  };

  try {
    const response = await generateWithRetry(
      {
        model: RESEARCH_MODEL,
        contents: `Generate a concise topic title (at most 6 words, no quotes, Title Case) for this legal research request:\n\n"${firstUserText}"\n\nReturn only the title.`,
        config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      },
      2
    );
    const title = (response?.text ?? "").trim().replace(/^["']|["']$/g, "");
    if (!title) return fallback();
    return title.length > 60 ? `${title.slice(0, 57)}...` : title;
  } catch {
    return fallback();
  }
};
