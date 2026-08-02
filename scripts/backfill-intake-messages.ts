import "dotenv/config";
import {
  prisma,
  connectDatabase,
  disconnectDatabase,
} from "../src/config/database";

/**
 * One-off backfill: seed the client's intake complaint as the first message of
 * conversations that were created before `_acceptLead` started doing it.
 *
 * Only conversations with *zero* messages are touched, so this is idempotent and
 * can never insert a duplicate or push into a live thread. Conversations whose
 * request carried no free-text description are skipped.
 *
 *   npx tsx scripts/backfill-intake-messages.ts          # dry run
 *   npx tsx scripts/backfill-intake-messages.ts --apply  # write
 */

const APPLY = process.argv.includes("--apply");

const complaintOf = (intakePayload: any): string | null => {
  const text = typeof intakePayload?.freeText === "string" ? intakePayload.freeText.trim() : "";
  return text || null;
};

async function main() {
  await connectDatabase();

  const conversations = await prisma.conversation.findMany({
    where: { messages: { none: {} } },
    select: {
      id: true,
      userAccountId: true,
      createdAt: true,
      request: { select: { intakePayload: true } },
    },
  });

  let seeded = 0;
  let skipped = 0;

  for (const c of conversations) {
    const complaint = complaintOf(c.request?.intakePayload);
    if (!complaint) {
      skipped++;
      continue;
    }

    if (!APPLY) {
      console.log(`[dry-run] ${c.id} <- "${complaint.slice(0, 60)}…"`);
      seeded++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // Backdate to the conversation's creation so the thread reads in order.
      const message = await tx.message.create({
        data: {
          conversationId: c.id,
          senderAccountId: c.userAccountId,
          body: complaint,
          createdAt: c.createdAt,
        },
      });
      await tx.conversation.update({
        where: { id: c.id },
        data: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: complaint.slice(0, 80),
        },
      });
    });
    seeded++;
  }

  console.log(
    `[backfill] ${APPLY ? "seeded" : "would seed"} ${seeded} conversation(s); skipped ${skipped} with no intake description; ${conversations.length} empty in total`
  );
  if (!APPLY) console.log("[backfill] dry run — re-run with --apply to write");

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error("[backfill] failed:", err);
  await disconnectDatabase().catch(() => null);
  process.exit(1);
});
