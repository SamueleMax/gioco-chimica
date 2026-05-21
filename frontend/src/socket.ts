import { io, Socket } from "socket.io-client";
import {
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from "@shared/types";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";

let socket: Socket<SocketServerToClientEvents, SocketClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
    });
  }
  return socket;
}

export function authenticateSocket(playerId: string, nickname: string) {
  const activeSocket = getSocket();
  activeSocket.emit("auth:set_nickname", { playerId, nickname });
  return activeSocket;
}
