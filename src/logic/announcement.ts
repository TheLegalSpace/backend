import { response, notFound, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { recordAuditLog } from "../dao/admin";
import {
  createAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  updateAnnouncement,
  audienceAccountIds,
  bulkCreateAnnouncementNotifications,
} from "../dao/announcement";

const AUDIENCES = ["all", "lawyers", "firms", "clients"];

// Fan out an announcement to its audience as system notifications, then mark it sent.
const fanOut = async (a: {
  id: string;
  title: string;
  body: string;
  audience: string;
}): Promise<number> => {
  const ids = await audienceAccountIds(a.audience);
  const count = await bulkCreateAnnouncementNotifications(ids, {
    kind: "announcement",
    announcementId: a.id,
    title: a.title,
    body: a.body,
  });
  await updateAnnouncement(a.id, {
    status: "sent",
    sentAt: new Date(),
    recipientCount: count,
  });
  return count;
};

export const _createAnnouncement = async (
  adminId: string,
  input: {
    title: string;
    body: string;
    audience?: string;
    sendNow?: boolean;
    scheduledAt?: string;
  }
): Promise<Response> => {
  const audience = input.audience || "all";
  if (!AUDIENCES.includes(audience)) throw badRequest("Invalid audience");

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (input.scheduledAt && isNaN(scheduledAt!.getTime())) {
    throw badRequest("scheduledAt must be a valid date");
  }

  const status = input.sendNow ? "sent" : scheduledAt ? "scheduled" : "draft";
  let announcement = await createAnnouncement({
    title: input.title,
    body: input.body,
    audience,
    status: input.sendNow ? "draft" : status, // flip to sent inside fanOut
    scheduledAt,
    createdByAdminId: adminId,
  });

  let recipientCount = 0;
  if (input.sendNow) {
    recipientCount = await fanOut(announcement);
    announcement = (await getAnnouncementById(announcement.id))!;
  }

  await recordAuditLog({
    adminAccountId: adminId,
    action: input.sendNow ? "announcement.send" : "announcement.create",
    targetType: "announcement",
    targetId: announcement.id,
    metadata: { audience, recipientCount },
  });

  return response({
    error: false,
    message: input.sendNow ? `Announcement sent to ${recipientCount} accounts` : "Announcement saved",
    data: announcement,
  });
};

export const _listAnnouncements = async (
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listAnnouncements(skip, take);
  return response({
    error: false,
    message: "Announcements retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _sendAnnouncement = async (
  adminId: string,
  id: string
): Promise<Response> => {
  const announcement = await getAnnouncementById(id);
  if (!announcement) throw notFound("Announcement not found");
  if (announcement.status === "sent") throw badRequest("Announcement already sent");

  const recipientCount = await fanOut(announcement);
  await recordAuditLog({
    adminAccountId: adminId,
    action: "announcement.send",
    targetType: "announcement",
    targetId: id,
    metadata: { audience: announcement.audience, recipientCount },
  });
  const updated = await getAnnouncementById(id);
  return response({
    error: false,
    message: `Announcement sent to ${recipientCount} accounts`,
    data: updated,
  });
};
