import { io, Socket } from "socket.io-client";
import {
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from "@shared/types";

const defaultOrigin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
const defaultSocketUrl = import.meta.env.PROD ? defaultOrigin : "http://localhost:3000";
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || defaultSocketUrl).replace(/\/+$/, "");

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
