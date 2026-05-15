import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../config/env";
import { findActivePracticeAreas } from "../dao/practiceArea";
import { IntakeBudget, IntakePreference } from "../interface";

export interface ExtractedIntake {
  matter: { id: string; name: string } | null;
  budget: IntakeBudget | null;
  location: string | null;
  preference: IntakePreference | null;
}

export class ExtractionInsufficientError extends Error {
  statusCode = 422;
  extracted: ExtractedIntake;
  constructor(message: string, extracted: ExtractedIntake) {
    super(message);
    this.name = "ExtractionInsufficientError";
    this.extracted = extracted;
  }
}

let cachedClient: GoogleGenAI | null = null;
const getClient = (): GoogleGenAI => {
  if (!env.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return cachedClient;
};

const BUDGET_VALUES: IntakeBudget[] = [
  "under_100k",
  "100k_to_500k",
  "500k_to_2m",
  "above_2m",
];
const PREFERENCE_VALUES: IntakePreference[] = ["lawyer", "firm", "either"];

const buildPrompt = (text: string, practiceAreaNames: string[]) => `You extract structured legal-matchmaking intake fields from a Nigerian user's free-text description of their legal need.

Available practice areas (pick exactly one or null):
${practiceAreaNames.map((n) => `- ${n}`).join("\n")}

Budget bands (in Nigerian Naira):
- under_100k: Below ₦100,000
- 100k_to_500k: ₦100,000 – ₦500,000
- 500k_to_2m: ₦500,000 – ₦2,000,000
- above_2m: Above ₦2,000,000

Preference: "lawyer" (individual practitioner), "firm" (law firm), or "either".

User's description:
"""
${text}
"""

Extract:
- matter: best-matching practice area NAME from the list above. Null if no clear match.
- budget: best-matching band. Null if the user does not mention money/budget at all.
- location: Nigerian city or state name the user mentions (e.g. "Lagos", "Abuja", "Port Harcourt"). Null if not mentioned.
- preference: "lawyer", "firm", or "either" if the user states a preference. Null otherwise.

Be conservative — return null when uncertain rather than guessing.`;

const isTransientError = (err: any): boolean => {
  const msg = String(err?.message || err || "");
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand)\b/i.test(msg);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const callGeminiWithRetry = async (
  client: GoogleGenAI,
  prompt: string,
  attempts = 3
): Promise<string | undefined> => {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matter: { type: Type.STRING, nullable: true },
              budget: {
                type: Type.STRING,
                nullable: true,
                enum: BUDGET_VALUES as unknown as string[],
              },
              location: { type: Type.STRING, nullable: true },
              preference: {
                type: Type.STRING,
                nullable: true,
                enum: PREFERENCE_VALUES as unknown as string[],
              },
            },
          },
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      return response.text;
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

export const extractIntakeFromText = async (
  text: string
): Promise<ExtractedIntake> => {
  const practiceAreas = await findActivePracticeAreas();
  const nameToId = new Map(practiceAreas.map((p) => [p.name.toLowerCase(), p]));

  const client = getClient();
  const raw = await callGeminiWithRetry(
    client,
    buildPrompt(
      text,
      practiceAreas.map((p) => p.name)
    )
  );

  if (!raw) {
    return { matter: null, budget: null, location: null, preference: null };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { matter: null, budget: null, location: null, preference: null };
  }

  let matter: ExtractedIntake["matter"] = null;
  if (parsed.matter && typeof parsed.matter === "string") {
    const match = nameToId.get(parsed.matter.toLowerCase().trim());
    if (match) matter = { id: match.id, name: match.name };
  }

  const budget: IntakeBudget | null =
    parsed.budget && BUDGET_VALUES.includes(parsed.budget)
      ? parsed.budget
      : null;
  const preference: IntakePreference | null =
    parsed.preference && PREFERENCE_VALUES.includes(parsed.preference)
      ? parsed.preference
      : null;
  const location: string | null =
    parsed.location && typeof parsed.location === "string" && parsed.location.trim()
      ? parsed.location.trim()
      : null;

  return { matter, budget, location, preference };
};
