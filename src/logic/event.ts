import { response, notFound } from "../helpers/utility";
import { Response } from "../interface";
import {
  listEvents,
  findEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  incrementEventClick,
} from "../dao/event";
import { paginate, buildPagination } from "../helpers/pagination";
import { uploadToR2, MAX_AVATAR_BYTES } from "../services/storage";

export const _list = async (
  status: "upcoming" | "past",
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listEvents(status, skip, take);
  return response({
    error: false,
    message: "Events retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

export const _get = async (id: string): Promise<Response> => {
  const event = await findEventById(id);
  if (!event) throw notFound("Event not found");
  return response({ error: false, message: "Event retrieved", data: event });
};

// Beacon fired by the client when a user taps a promoted event's flyer /
// registration link. Powers the approximate Clicks/CTR/CPC on the admin docket.
export const _trackEventClick = async (id: string): Promise<Response> => {
  const event = await findEventById(id);
  if (!event) throw notFound("Event not found");
  await incrementEventClick(id);
  return response({ error: false, message: "Click recorded" });
};

export const _create = async (
  adminAccountId: string,
  body: any
): Promise<Response> => {
  const event = await createEvent({
    ...body,
    createdByAdminId: adminAccountId,
    startAt: new Date(body.startAt),
    endAt: body.endAt ? new Date(body.endAt) : null,
  });
  return response({ error: false, message: "Event created", data: event });
};

export const _update = async (id: string, body: any): Promise<Response> => {
  const data = { ...body };
  if (body.startAt) data.startAt = new Date(body.startAt);
  if (body.endAt) data.endAt = new Date(body.endAt);
  const event = await updateEvent(id, data);
  return response({ error: false, message: "Event updated", data: event });
};

export const _delete = async (id: string): Promise<Response> => {
  await deleteEvent(id);
  return response({ error: false, message: "Event deleted" });
};

export const _uploadCover = async (
  id: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<Response> => {
  const { url } = await uploadToR2({
    buffer,
    mimetype,
    originalName: filename,
    folder: `events/${id}`,
    maxBytes: MAX_AVATAR_BYTES,
  });
  const event = await updateEvent(id, { coverUrl: url });
  return response({ error: false, message: "Cover uploaded", data: { url, event } });
};
