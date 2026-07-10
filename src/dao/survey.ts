import { prisma } from "../config/database";

export const findSurveyBySlug = async (slug: string) =>
  prisma.survey.findUnique({ where: { slug } });

export const findMyResponse = async (surveyId: string, accountId: string) =>
  prisma.surveyResponse.findUnique({
    where: { surveyId_accountId: { surveyId, accountId } },
  });

// Upsert — one response per account per survey; re-submitting updates it.
export const upsertResponse = async (
  surveyId: string,
  accountId: string,
  data: { answer: string; featureVotes: string[] }
) =>
  prisma.surveyResponse.upsert({
    where: { surveyId_accountId: { surveyId, accountId } },
    create: { surveyId, accountId, answer: data.answer, featureVotes: data.featureVotes },
    update: { answer: data.answer, featureVotes: data.featureVotes },
  });

export const countResponses = async (surveyId: string) =>
  prisma.surveyResponse.count({ where: { surveyId } });

export const answerDistribution = async (surveyId: string): Promise<Record<string, number>> => {
  const rows = await prisma.surveyResponse.groupBy({
    by: ["answer"],
    where: { surveyId },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.answer] = r._count._all;
  return out;
};

// Response counts grouped by the responder's account role (LAWYER / FIRM / ...).
export const responsesByRole = async (
  surveyId: string
): Promise<{ role: string; count: number }[]> => {
  const rows = await prisma.$queryRaw<{ role: string; count: bigint }[]>`
    SELECT a.role AS role, COUNT(*) AS count
    FROM survey_responses sr
    JOIN accounts a ON a.id = sr.account_id
    WHERE sr.survey_id = ${surveyId}::uuid
    GROUP BY a.role
  `;
  return rows.map((r) => ({ role: r.role, count: Number(r.count) }));
};

// Tally of feature votes across all responses (unnest the jsonb string arrays).
export const featureVoteTally = async (
  surveyId: string
): Promise<{ feature: string; votes: number }[]> => {
  const rows = await prisma.$queryRaw<{ feature: string; votes: bigint }[]>`
    SELECT feature, COUNT(*) AS votes
    FROM survey_responses sr,
         jsonb_array_elements_text(sr.feature_votes) AS feature
    WHERE sr.survey_id = ${surveyId}::uuid
    GROUP BY feature
    ORDER BY votes DESC
  `;
  return rows.map((r) => ({ feature: r.feature, votes: Number(r.votes) }));
};

// Denominator for participation rate: lawyers + firms are the survey's audience.
export const countProfessionalAccounts = async (): Promise<number> =>
  prisma.account.count({
    where: { role: { in: ["LAWYER", "FIRM"] }, status: { not: "deleted" } },
  });
