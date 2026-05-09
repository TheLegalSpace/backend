import { Server as SocketServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server as HttpServer } from "http";
import { supabase } from "../config/supabase";
import { prisma } from "../config/database";
import { pubClient, subClient } from "../config/redis";
import { env } from "../config/env";
import { setIo } from "./emitter";
import { _markRead, _sendMessage } from "../logic/conversation";

export const initRealtime = (httpServer: HttpServer): SocketServer => {
  const io = new SocketServer(httpServer, {
    path: env.socketPath,
    cors: { origin: "*" },
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("missing token"));
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return next(new Error("invalid token"));
      const account = await prisma.account.findUnique({
        where: { authUserId: data.user.id },
      });
      if (!account || account.status !== "active") return next(new Error("no account"));
      (socket as any).accountId = account.id;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", async (socket) => {
    const accountId = (socket as any).accountId as string;
    socket.join(`account:${accountId}`);

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ userAccountId: accountId }, { lawyerAccountId: accountId }],
        status: "active",
      },
      select: { id: true },
    });
    for (const c of conversations) socket.join(`conversation:${c.id}`);

    socket.emit("connected", {
      accountId,
      conversationIds: conversations.map((c) => c.id),
    });

    socket.on("typing", (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket
        .to(`conversation:${data.conversationId}`)
        .emit("typing", { conversationId: data.conversationId, accountId });
    });

    socket.on(
      "message:read",
      async (data: { conversationId: string; messageId: string }) => {
        try {
          if (!data?.conversationId || !data?.messageId) return;
          await _markRead(data.conversationId, data.messageId, accountId);
        } catch (err) {
          console.error("[socket] message:read failed:", (err as Error).message);
        }
      }
    );

    socket.on("conversation:join", (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.join(`conversation:${data.conversationId}`);
    });

    socket.on("conversation:leave", (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.leave(`conversation:${data.conversationId}`);
    });

    socket.on("disconnect", () => {});
  });

  setIo(io);
  return io;
};
