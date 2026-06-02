/**
 * Throwaway smoke test for TLS Research — no auth, no DB.
 * Run: npx tsx scripts/test-research.ts
 *
 * Step 1 proves the GEMINI_API_KEY works for a plain (ungrounded) call.
 * Step 2 is the real test: a grounded research query. If grounding requires
 * billing (Tier 1) and it isn't enabled, this is where it fails — and our
 * service now surfaces that as a clear 503 instead of hiding it.
 */
import "dotenv/config";
import { getClient } from "../src/services/llm";
import { runResearch } from "../src/services/research";

const line = "=".repeat(70);

async function main() {
  // --- Step 1: plain ungrounded call (control) ---
  console.log(line);
  console.log("STEP 1 — plain ungrounded model call (is the key valid at all?)");
  console.log(line);
  try {
    const res = await getClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Reply with exactly: OK",
      config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    });
    console.log("✅ Plain call works. Model said:", JSON.stringify((res.text || "").trim()));
  } catch (err: any) {
    console.log("❌ Plain call FAILED — the API key itself is the problem.");
    console.log("   Reason:", err?.message || err);
    console.log("\nStopping — fix the key before testing grounding.");
    return;
  }

  // --- Step 2: grounded research query (the billing test) ---
  console.log("\n" + line);
  console.log("STEP 2 — grounded research query (THIS needs Google Search grounding)");
  console.log(line);
  try {
    const result = await runResearch({
      history: [],
      userText:
        "Find Nigerian precedents on unlawful termination of employment without severance for employees with 5+ years of service. Cite the cases.",
    });
    console.log("✅ Grounded research SUCCEEDED — billing/grounding is working.");
    console.log("   grounded :", result.grounded);
    console.log("   confident:", result.confident);
    console.log("   sources  :", result.sources.length);
    result.sources.slice(0, 5).forEach((s, i) => console.log(`     [${i + 1}] ${s.title} — ${s.url}`));
    console.log("\n   answer (first 400 chars):\n");
    console.log("   " + result.answer.slice(0, 400).replace(/\n/g, "\n   "));
  } catch (err: any) {
    console.log("❌ Grounded research FAILED.");
    console.log("   statusCode:", err?.statusCode ?? "(none)");
    console.log("   message   :", err?.message || err);
    console.log(
      "\n   👉 If this mentions billing / permission / Tier / quota, it confirms"
    );
    console.log(
      "      grounding needs Cloud Billing enabled on the Gemini project."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  });
