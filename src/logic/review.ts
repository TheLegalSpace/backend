import { prisma } from "../config/database";
import {
  response,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../helpers/utility";
import { Response } from "../interface";
import { createReview } from "../dao/review";
import { dispatchNotification } from "../services/notification";

export const _submitReview = async (
  conversationId: string,
  reviewerAccountId: string,
  body: { rating: number; body?: string }
): Promise<Response> => {
  if (body.rating < 1 || body.rating > 5) throw badRequest("Rating must be 1-5");
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conv) throw notFound("Conversation not found");
  if (conv.status !== "closed") throw badRequest("Conversation must be closed");
  if (
    conv.userAccountId !== reviewerAccountId &&
    conv.lawyerAccountId !== reviewerAccountId
  ) {
    throw forbidden("Not a participant");
  }
  const reviewedAccountId =
    conv.userAccountId === reviewerAccountId ? conv.lawyerAccountId : conv.userAccountId;

  const existing = await prisma.review.findUnique({
    where: {
      reviewerAccountId_reviewedAccountId_conversationId: {
        reviewerAccountId,
        reviewedAccountId,
        conversationId,
      },
    },
  });
  if (existing) throw conflict("You have already reviewed this conversation");

  const review = await createReview({
    reviewerAccountId,
    reviewedAccountId,
    conversationId,
    rating: body.rating,
    body: body.body,
  });

  await dispatchNotification({
    recipientAccountId: reviewedAccountId,
    type: "new_review",
    payload: { reviewId: review.id, rating: body.rating },
  });

  return response({ error: false, message: "Review submitted", data: review });
};
