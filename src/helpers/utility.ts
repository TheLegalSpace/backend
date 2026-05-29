import { FastifyReply } from "fastify";
import { Response } from "../interface";

export const response = <T = any>(data: {
  error: boolean;
  message: string;
  data?: T;
}): Response<T> => data;

export const responseOk = <T = any>(reply: FastifyReply, body: Response<T>) => {
  return reply.status(200).send(body);
};

export const responseCreated = <T = any>(reply: FastifyReply, body: Response<T>) => {
  return reply.status(201).send(body);
};

export const responseBad = (reply: FastifyReply, error: any) => {
  const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
  const message = error?.message || "Something went wrong";
  return reply.status(status).send({ error: true, message });
};

export class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFound = (msg = "Not found") => new HttpError(msg, 404);
export const forbidden = (msg = "Forbidden") => new HttpError(msg, 403);
export const unauthorized = (msg = "Unauthorized") => new HttpError(msg, 401);
export const conflict = (msg = "Conflict") => new HttpError(msg, 409);
export const badRequest = (msg = "Bad request") => new HttpError(msg, 400);
export const serviceUnavailable = (msg = "Service unavailable") => new HttpError(msg, 503);
