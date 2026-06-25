export type ResearchRole = "user" | "assistant";

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchAttachment {
  kind: "pdf";
  url: string;
  filename: string;
  sizeBytes: number;
}

export interface ResearchCitation {
  title: string;
  url: string;
}

export interface ResearchHistoryTurn {
  role: ResearchRole;
  content: string;
}

export interface RunResearchInput {
  history: ResearchHistoryTurn[];
  userText: string;
  pdf?: {
    buffer: Buffer;
    mimetype: string;
    filename: string;
  };
}

export interface RunResearchResult {
  answer: string;
  sources: ResearchSource[];
  /**
   * True when the model produced a substantive answer; false only when it
   * returned the refusal text. NOT a quality score — the refusal IS the
   * low-confidence signal, and the source list conveys sourcing strength.
   * Deliberately independent of grounding-chunk count, which is
   * non-deterministic and previously caused identical answers to flip-flop.
   */
  confident: boolean;
  /** Whether the answer was produced with live Google Search grounding. */
  grounded: boolean;
  /**
   * True when the Nigerian-first pass was insufficient and the answer was
   * produced by a second pass widened to English/Commonwealth persuasive
   * authority. The answer text itself states this; this flag lets the UI add a
   * "Commonwealth authority" cue on the fresh response.
   */
  widened?: boolean;
  /** Honest note shown to the user when the answer was degraded (e.g. search unavailable). Undefined on a normal answer. */
  degraded?: string;
}
