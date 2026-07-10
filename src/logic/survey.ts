import { response, notFound, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import {
  findSurveyBySlug,
  findMyResponse,
  upsertResponse,
  countResponses,
  answerDistribution,
  responsesByRole,
  featureVoteTally,
  countProfessionalAccounts,
} from "../dao/survey";

// ---- User-facing ----

export const _getSurvey = async (slug: string, accountId: string): Promise<Response> => {
  const survey = await findSurveyBySlug(slug);
  if (!survey || !survey.isActive) throw notFound("Survey not found");
  const mine = await findMyResponse(survey.id, accountId);
  return response({
    error: false,
    message: "Survey retrieved",
    data: {
      id: survey.id,
      slug: survey.slug,
      question: survey.question,
      options: survey.options,
      myResponse: mine
        ? { answer: mine.answer, featureVotes: mine.featureVotes }
        : null,
    },
  });
};

export const _submitResponse = async (
  slug: string,
  accountId: string,
  input: { answer: string; featureVotes?: string[] }
): Promise<Response> => {
  const survey = await findSurveyBySlug(slug);
  if (!survey || !survey.isActive) throw notFound("Survey not found");
  const options = Array.isArray(survey.options) ? (survey.options as string[]) : [];
  if (!options.includes(input.answer)) {
    throw badRequest(`answer must be one of: ${options.join(", ")}`);
  }
  const featureVotes = (input.featureVotes || [])
    .map((f) => String(f).trim())
    .filter(Boolean)
    .slice(0, 20);
  const saved = await upsertResponse(survey.id, accountId, { answer: input.answer, featureVotes });
  return response({ error: false, message: "Response recorded", data: saved });
};

// ---- Admin ----

export const _surveyStats = async (slug: string): Promise<Response> => {
  const survey = await findSurveyBySlug(slug);
  if (!survey) throw notFound("Survey not found");

  const [total, distribution, byRole, features, audience] = await Promise.all([
    countResponses(survey.id),
    answerDistribution(survey.id),
    responsesByRole(survey.id),
    featureVoteTally(survey.id),
    countProfessionalAccounts(),
  ]);

  const pct = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);
  const options = Array.isArray(survey.options) ? (survey.options as string[]) : [];
  const responseDistribution = options.map((opt) => ({
    answer: opt,
    count: distribution[opt] || 0,
    percentage: pct(distribution[opt] || 0),
  }));

  const lawyers = byRole.find((r) => r.role === "LAWYER")?.count || 0;
  const firms = byRole.find((r) => r.role === "FIRM")?.count || 0;

  return response({
    error: false,
    message: "Survey stats retrieved",
    data: {
      question: survey.question,
      totalResponses: total,
      yesResponses: distribution.yes || 0,
      noResponses: distribution.no || 0,
      participationRate: audience > 0 ? Number(((total / audience) * 100).toFixed(1)) : 0,
      breakdownByUserType: {
        lawyers: { count: lawyers, percentage: pct(lawyers) },
        lawFirms: { count: firms, percentage: pct(firms) },
      },
      topFeatureRequests: features,
      responseDistribution,
    },
  });
};
