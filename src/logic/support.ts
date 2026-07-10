import { response, notFound, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import { paginate, buildPagination } from "../helpers/pagination";
import { dispatchNotification } from "../services/notification";
import {
  createTicket,
  findTicketById,
  listTickets,
  listTicketsByAccount,
  updateTicketStatus,
  ticketCountsByStatus,
} from "../dao/support";

const CATEGORIES = ["billing", "technical", "account", "general"];
const STATUSES = ["open", "in_progress", "closed"];

// ---- User-facing ----

export const _createTicket = async (
  account: any,
  input: { category: string; subject: string; body: string; email?: string; name?: string }
): Promise<Response> => {
  if (!CATEGORIES.includes(input.category)) throw badRequest("Invalid category");
  const ticket = await createTicket({
    accountId: account.id,
    name: input.name?.trim() || account.fullName,
    email: input.email?.trim() || account.email,
    category: input.category,
    subject: input.subject,
    body: input.body,
  });
  await dispatchNotification({
    recipientAccountId: account.id,
    type: "system",
    payload: { kind: "support_ticket_received", ticketNumber: ticket.ticketNumber, subject: ticket.subject },
    emailable: true,
  });
  return response({ error: false, message: "Support ticket submitted", data: ticket });
};

export const _listMyTickets = async (
  accountId: string,
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const { items, total } = await listTicketsByAccount(accountId, skip, take);
  return response({
    error: false,
    message: "Support tickets retrieved",
    data: { items, pagination: buildPagination(total, p, l) },
  });
};

// ---- Admin ----

export const _adminListTickets = async (
  filters: { status?: string; category?: string; q?: string },
  page: number,
  limit: number
): Promise<Response> => {
  const { skip, take, page: p, limit: l } = paginate(page, limit);
  const [{ items, total }, counts] = await Promise.all([
    listTickets(filters, skip, take),
    ticketCountsByStatus(),
  ]);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
  return response({
    error: false,
    message: "Support tickets retrieved",
    data: {
      items,
      stats: {
        totalTickets: totalAll,
        openTickets: (counts.open || 0) + (counts.in_progress || 0),
        closedTickets: counts.closed || 0,
      },
      pagination: buildPagination(total, p, l),
    },
  });
};

export const _adminGetTicket = async (id: string): Promise<Response> => {
  const ticket = await findTicketById(id);
  if (!ticket) throw notFound("Ticket not found");
  return response({ error: false, message: "Ticket retrieved", data: ticket });
};

export const _adminUpdateTicketStatus = async (
  id: string,
  status: string
): Promise<Response> => {
  if (!STATUSES.includes(status)) throw badRequest("Invalid status");
  const existing = await findTicketById(id);
  if (!existing) throw notFound("Ticket not found");
  const ticket = await updateTicketStatus(id, status);
  // Notify the submitter their ticket status changed.
  await dispatchNotification({
    recipientAccountId: existing.accountId,
    type: "system",
    payload: { kind: "support_ticket_updated", ticketNumber: ticket.ticketNumber, status },
    emailable: true,
  });
  return response({ error: false, message: "Ticket updated", data: ticket });
};
