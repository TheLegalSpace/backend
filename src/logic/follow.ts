import { response, badRequest, notFound } from "../helpers/utility";
import { Response } from "../interface";
import {
  followAccount,
  unfollowAccount,
  listFollowing,
  listFollowers,
} from "../dao/follow";
import { findAccountById } from "../dao/account";
import { paginate, buildPagination } from "../helpers/pagination";
import { maskAccount } from "../services/anonymity";
import { enqueueNotification } from "../services/notification";

export const _follow = async (
  followerAccountId: string,
  followedAccountId: string
): Promise<Response> => {
  if (followerAccountId === followedAccountId) {
    throw badRequest("Cannot follow yourself");
  }
  const target = await findAccountById(followedAccountId);
  if (!target || target.status !== "active") throw notFound("Target not found");
  const { follow, created } = await followAccount(followerAccountId, followedAccountId);
  if (created) {
    await enqueueNotification({
      recipientAccountId: followedAccountId,
      type: "new_follower",
      payload: { followerAccountId },
      emailable: false,
    });
  }
  return response({ error: false, message: "Followed", data: follow });
};

export const _unfollow = async (
  followerAccountId: string,
  followedAccountId: string
): Promise<Response> => {
  await unfollowAccount(followerAccountId, followedAccountId);
  return response({ error: false, message: "Unfollowed" });
};

export const _listFollowing = async (
  accountId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { rows, total } = await listFollowing(accountId, skip, take);
  const items = rows.map((r) => maskAccount(r.followed as any, viewerId));
  return response({
    error: false,
    message: "Following retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _listFollowers = async (
  accountId: string,
  viewerId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { rows, total } = await listFollowers(accountId, skip, take);
  const items = rows.map((r) => maskAccount(r.follower as any, viewerId));
  return response({
    error: false,
    message: "Followers retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};
