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
  confident: boolean;
  /** Whether the answer was produced with live Google Search grounding. */
  grounded: boolean;
  /** Honest note shown to the user when the answer was degraded (e.g. search unavailable). Undefined on a normal answer. */
  degraded?: string;
}
