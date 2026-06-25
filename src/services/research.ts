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

type ResearchScope = "nigeria" | "commonwealth";

const buildSystemPrompt = (scope: ResearchScope): string => {
  const jurisdiction =
    scope === "nigeria"
      ? `Jurisdiction (primary):
- Prioritise authoritative NIGERIAN sources: Nigerian statutes, the Constitution, and decisions of Nigerian courts (especially the Supreme Court and Court of Appeal).`
      : `Jurisdiction (widened — persuasive authority):
- No sufficiently strong Nigerian authority was available for this question, so you may now ALSO rely on English and other Commonwealth (e.g. UK) authorities as PERSUASIVE authority.
- You MUST open your answer by stating plainly that no directly applicable Nigerian authority was found, and that the authorities below are persuasive English/Commonwealth authority — NOT binding on Nigerian courts.
- NEVER present foreign law as binding, and never let it override a Nigerian statute, the Constitution, or binding Nigerian precedent. Use it only to fill the gap.
- If even English/Commonwealth sources are insufficient, return the refusal text exactly.`;

  return `You are a Nigerian legal research assistant for legal professionals (lawyers and law firms).

Your job:
- Help with legal research: case law, statutes, summaries, plain-language explanations, citation assistance, and analysis of documents the user uploads.
- Ground EVERY legal claim (case names, citations, statutes, sections, holdings) in the Google Search results available to you.
- NEVER fabricate or guess case names, citations, statute sections, or holdings. If you cannot find reliable sources to support an answer, do not invent one.

${jurisdiction}

Recency (important — these readers litigate on current law):
- Prefer the MOST RECENT authority you can verify. State the YEAR of every case and the date/edition of every statute you cite.
- If the most recent reliable authority you found is several years old, say so explicitly (e.g. "The most recent directly-applicable authority I could verify is from 2017.") so the reader knows it may not reflect the latest position. Do not pad with old cases dressed up as current.

Answer shape (for a substantive answer — match depth to the question, do not pad a simple one):
1. Bottom line — a direct, plain-language answer to what was asked, up front.
2. Breakdown — explain the governing law and reasoning, broken into clear points. Be thorough and practical but not verbose.
3. Illustrative scenario — give ONE short, clearly-labelled hypothetical ("Illustrative scenario:") showing how the law applies in practice. It must be an obvious application of the law you just stated — NOT a real case, and never a substitute for a real citation. Skip it for trivial or purely clarifying questions.
4. Authorities — list the cases/statutes you relied on, each cited by name with its year, inline where relevant.

Refusal rule (critical):
- When the available sources are insufficient, weak, or absent for the legal question asked, DO NOT guess. Respond with exactly this text and nothing else:
"${REFUSAL_TEXT}"

Scope:
- You are source-based legal research only. You do not provide legal representation or formal legal advice, you do not build websites or apps, and you do not perform tasks outside legal research and document understanding.
- Politely and briefly decline out-of-scope requests, then offer to help with a legal research question instead.

Style:
- Be precise and professional. Cite the sources you relied on inline by name.`;
};

const toText = (
  history: RunResearchInput["history"],
  userText: string,
  scope: ResearchScope
): string => {
  const transcript = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");
  const prefix = transcript ? `${transcript}\n\n` : "";
  return `${buildSystemPrompt(scope)}\n\n--- Conversation so far ---\n${prefix}User: ${userText}`;
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

const buildContents = (input: RunResearchInput, scope: ResearchScope) => {
  const text = toText(input.history, input.userText, scope);
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
 *
 * Two-pass jurisdiction widening: the first pass is grounded Nigerian-first. If
 * it refuses for want of Nigerian authority, a second grounded pass widens to
 * English/Commonwealth *persuasive* authority (Nigeria is a common-law
 * jurisdiction). The widened answer states this in-text; `widened` flags it for
 * the UI. If the second pass also refuses, we return the refusal.
 */
const groundedConfig = { tools: [{ googleSearch: {} }], temperature: 0 };

export const runResearch = async (
  input: RunResearchInput
): Promise<RunResearchResult> => {
  const nigeriaContents = buildContents(input, "nigeria");

  let response: any;
  try {
    response = await generateWithRetry({
      model: RESEARCH_MODEL,
      contents: nigeriaContents,
      config: groundedConfig,
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
          contents: nigeriaContents,
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

  let answer = (response?.text ?? "").trim() || REFUSAL_TEXT;
  let sources = extractSources(response);
  let isRefusal = answer === REFUSAL_TEXT;
  let widened = false;

  // Nigerian-first pass refused -> widen to Commonwealth persuasive authority.
  if (isRefusal) {
    try {
      const widenedResp = await generateWithRetry({
        model: RESEARCH_MODEL,
        contents: buildContents(input, "commonwealth"),
        config: groundedConfig,
      });
      const widenedAnswer = (widenedResp?.text ?? "").trim() || REFUSAL_TEXT;
      if (widenedAnswer !== REFUSAL_TEXT) {
        answer = widenedAnswer;
        sources = extractSources(widenedResp);
        isRefusal = false;
        widened = true;
      }
    } catch (err) {
      // Widening is best-effort: the Nigerian pass already produced a valid
      // (refusal) answer, so we keep it rather than escalating to a 503.
      console.error("[research] commonwealth widening failed:", {
        detail: String((err as any)?.message || err || "unknown error"),
      });
    }
  }

  // `confident` means "produced a substantive answer". The refusal is itself the
  // low-confidence signal, and the source list conveys sourcing strength. We do
  // NOT tie this to grounding-chunk count — that's non-deterministic and made
  // identical answers flip between confident/not-confident across runs.
  const confident = !isRefusal;

  return { answer, sources, confident, grounded: true, widened };
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
