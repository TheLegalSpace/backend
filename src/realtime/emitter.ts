import type { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export const setIo = (instance: SocketServer) => {
  io = instance;
};

export const getIo = (): SocketServer | null => io;

export const emitToAccount = (accountId: string, event: string, payload: any) => {
  io?.to(`account:${accountId}`).emit(event, payload);
};

export const emitToConversation = (conversationId: string, event: string, payload: any) => {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
};
