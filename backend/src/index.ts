import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import {
  Indicator,
  IndicatorOutcome,
  MatchState,
  MatchStatus,
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from "../../shared/types";
import {
  createMatchRecord,
  endMatchRecord,
  getIndicators,
  getLeaderboard,
  getP2MaxScore,
  insertMatchEvent,
  resetLeaderboard,
  setP2MaxScore,
  updateLeaderboardForMatch,
  updateMatchProgress,
  upsertUser,
} from "./db";

dotenv.config();

type PlayerState = {
  playerId: string;
  nickname: string;
  socketId: string;
  connected: boolean;
  graceEndsAt: number | null;
  disconnectTimer?: NodeJS.Timeout;
};

type ActiveMatch = {
  id: string;
  status: MatchStatus;
  p1: PlayerState;
  p2: PlayerState;
  p1Ph: number | null;
  pendingQuestion: Indicator | null;
  history: MatchState["history"];
  questionsCount: number;
  p1Penalty: number;
  p2Penalty: number;
  p2MaxScore: number;
  startedAt: number;
};

function isIntegerInRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function getOutcome(ph: number, indicator: Indicator): IndicatorOutcome {
  if (ph < indicator.low) {
    return "ACIDO";
  }
  if (ph > indicator.high) {
    return "BASICO";
  }
  return "INTERMEDIO";
}

function calculateScores(match: ActiveMatch) {
  const baseP1 = match.questionsCount;
  const baseP2 = Math.max(0, match.p2MaxScore - match.questionsCount);

  return {
    p1Score: Math.max(0, baseP1 - match.p1Penalty),
    p2Score: Math.max(0, baseP2 - match.p2Penalty),
  };
}

function buildMatchState(match: ActiveMatch, playerId: string, indicators: Indicator[]): MatchState {
  const isP1 = match.p1.playerId === playerId;
  const you = isP1 ? match.p1 : match.p2;
  const opponent = isP1 ? match.p2 : match.p1;
  const scores = calculateScores(match);

  return {
    matchId: match.id,
    role: isP1 ? "p1" : "p2",
    status: match.status,
    p1Ph: isP1 ? match.p1Ph : null,
    pendingQuestion: match.pendingQuestion,
    indicators,
    history: match.history,
    questionsCount: match.questionsCount,
    p1Score: scores.p1Score,
    p2Score: scores.p2Score,
    p1Penalty: match.p1Penalty,
    p2Penalty: match.p2Penalty,
    p2MaxScore: match.p2MaxScore,
    you: {
      playerId: you.playerId,
      nickname: you.nickname,
    },
    opponent: {
      playerId: opponent.playerId,
      nickname: opponent.nickname,
      connected: opponent.connected,
      graceEndsAt: opponent.graceEndsAt,
    },
  };
}

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const indicators = await getIndicators();
  const indicatorsById = new Map(indicators.map((indicator) => [indicator.id, indicator]));

  const io = new Server<SocketClientToServerEvents, SocketServerToClientEvents>(app.server, {
    cors: { origin: "*" },
  });

  const waitingQueue: string[] = [];
  const activeMatches = new Map<string, ActiveMatch>();
  const playerToMatch = new Map<string, string>();

  function emitState(match: ActiveMatch) {
    const p1Socket = io.sockets.sockets.get(match.p1.socketId);
    const p2Socket = io.sockets.sockets.get(match.p2.socketId);

    if (p1Socket) {
      p1Socket.emit("match:state", buildMatchState(match, match.p1.playerId, indicators));
    }
    if (p2Socket) {
      p2Socket.emit("match:state", buildMatchState(match, match.p2.playerId, indicators));
    }
  }

  function emitNotification(match: ActiveMatch, playerId: string, message: string, level: "info" | "warn" | "error") {
    const socketId = match.p1.playerId === playerId ? match.p1.socketId : match.p2.socketId;
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("match:notification", { message, level });
    }
  }

  async function persistMatch(match: ActiveMatch) {
    const scores = calculateScores(match);
    await updateMatchProgress({
      id: match.id,
      status: match.status,
      p1Ph: match.p1Ph,
      questionsCount: match.questionsCount,
      p1Penalty: match.p1Penalty,
      p2Penalty: match.p2Penalty,
      p1Score: scores.p1Score,
      p2Score: scores.p2Score,
    });
  }

  async function endMatch(match: ActiveMatch, winnerPlayerId: string | null, reason: string) {
    match.status = "ended";
    const scores = calculateScores(match);
    await endMatchRecord({
      id: match.id,
      status: match.status,
      p1Ph: match.p1Ph,
      questionsCount: match.questionsCount,
      p1Penalty: match.p1Penalty,
      p2Penalty: match.p2Penalty,
      p1Score: scores.p1Score,
      p2Score: scores.p2Score,
      winnerPlayerId,
      endedReason: reason,
      endedAt: new Date(),
    });

    await insertMatchEvent(match.id, "match_ended", null, {
      winnerPlayerId,
      reason,
      p1Score: scores.p1Score,
      p2Score: scores.p2Score,
    });

    await updateLeaderboardForMatch({
      p1PlayerId: match.p1.playerId,
      p2PlayerId: match.p2.playerId,
      p1Nickname: match.p1.nickname,
      p2Nickname: match.p2.nickname,
      p1Score: scores.p1Score,
      p2Score: scores.p2Score,
      winnerPlayerId,
    });

    emitState(match);
    const p1Socket = io.sockets.sockets.get(match.p1.socketId);
    const p2Socket = io.sockets.sockets.get(match.p2.socketId);

    if (p1Socket) {
      p1Socket.emit("match:ended", {
        matchId: match.id,
        winnerPlayerId,
        reason,
        p1Score: scores.p1Score,
        p2Score: scores.p2Score,
      });
    }
    if (p2Socket) {
      p2Socket.emit("match:ended", {
        matchId: match.id,
        winnerPlayerId,
        reason,
        p1Score: scores.p1Score,
        p2Score: scores.p2Score,
      });
    }

    activeMatches.delete(match.id);
    playerToMatch.delete(match.p1.playerId);
    playerToMatch.delete(match.p2.playerId);

    if (match.p1.disconnectTimer) {
      clearTimeout(match.p1.disconnectTimer);
    }
    if (match.p2.disconnectTimer) {
      clearTimeout(match.p2.disconnectTimer);
    }
  }

  function getMatchForPlayer(playerId: string) {
    const matchId = playerToMatch.get(playerId);
    if (!matchId) {
      return null;
    }
    return activeMatches.get(matchId) || null;
  }

  app.get("/api/leaderboard", async () => {
    return getLeaderboard();
  });

  app.get("/api/settings", async (request, reply) => {
    const adminPin = request.headers["x-admin-pin"];
    if (!process.env.ADMIN_PIN || adminPin !== process.env.ADMIN_PIN) {
      reply.code(401);
      return { error: "PIN non valido" };
    }

    const p2MaxScore = await getP2MaxScore();
    return { p2MaxScore };
  });

  app.post("/api/settings/p2MaxScore", async (request, reply) => {
    const adminPin = request.headers["x-admin-pin"];
    if (!process.env.ADMIN_PIN || adminPin !== process.env.ADMIN_PIN) {
      reply.code(401);
      return { error: "PIN non valido" };
    }

    const body = (request.body ?? {}) as { value?: number };
    const value = body.value;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
      reply.code(400);
      return { error: "Valore non valido" };
    }

    await setP2MaxScore(value);
    return { ok: true };
  });

  app.post("/api/admin/reset-leaderboard", async (request, reply) => {
    const adminPin = request.headers["x-admin-pin"];
    if (!process.env.ADMIN_PIN || adminPin !== process.env.ADMIN_PIN) {
      reply.code(401);
      return { error: "PIN non valido" };
    }

    await resetLeaderboard();
    return { ok: true };
  });

  io.on("connection", (socket) => {
    socket.on("auth:set_nickname", async (payload: { playerId?: string; nickname: string }) => {
      const { playerId, nickname } = payload;
      const trimmed = (nickname || "").trim();
      if (!trimmed || trimmed.length > 24) {
        socket.emit("match:notification", {
          message: "Nickname non valido",
          level: "error",
        });
        return;
      }

      const resolvedPlayerId = playerId && playerId.length > 10 ? playerId : randomUUID();
      socket.data.playerId = resolvedPlayerId;
      socket.data.nickname = trimmed;

      await upsertUser(resolvedPlayerId, trimmed);
      socket.emit("auth:ok", { playerId: resolvedPlayerId, nickname: trimmed });

      const match = getMatchForPlayer(resolvedPlayerId);
      if (match) {
        const player = match.p1.playerId === resolvedPlayerId ? match.p1 : match.p2;
        player.socketId = socket.id;
        player.connected = true;
        player.graceEndsAt = null;
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = undefined;
        }

        const opponent = match.p1.playerId === resolvedPlayerId ? match.p2 : match.p1;
        const opponentSocket = io.sockets.sockets.get(opponent.socketId);
        if (opponentSocket) {
          opponentSocket.emit("presence:opponent", { connected: true, graceEndsAt: null });
        }

        emitState(match);
      }
    });

    socket.on("match:quick_match", async () => {
      const playerId = socket.data.playerId as string | undefined;
      const nickname = socket.data.nickname as string | undefined;
      if (!playerId || !nickname) {
        socket.emit("match:notification", { message: "Devi impostare un nickname", level: "error" });
        return;
      }

      if (getMatchForPlayer(playerId)) {
        const match = getMatchForPlayer(playerId);
        if (match) {
          emitState(match);
        }
        return;
      }

      if (waitingQueue.includes(playerId)) {
        socket.emit("match:notification", { message: "Sei già in attesa", level: "info" });
        return;
      }

      const opponentIndex = waitingQueue.findIndex((id) => id !== playerId);
      if (opponentIndex !== -1) {
        const opponentId = waitingQueue.splice(opponentIndex, 1)[0];
        const opponentSocket = Array.from(io.sockets.sockets.values()).find(
          (s) => s.data.playerId === opponentId
        );

        if (!opponentSocket) {
          socket.emit("match:notification", { message: "Avversario non disponibile", level: "warn" });
          return;
        }
        const matchId = randomUUID();
        const p2MaxScore = await getP2MaxScore();
        const roles = Math.random() < 0.5 ? [playerId, opponentId] : [opponentId, playerId];

        const p1PlayerId = roles[0];
        const p2PlayerId = roles[1];

        const p1Socket = p1PlayerId === playerId ? socket : opponentSocket;
        const p2Socket = p2PlayerId === playerId ? socket : opponentSocket;

        const match: ActiveMatch = {
          id: matchId,
          status: "waiting_p1_ph",
          p1: {
            playerId: p1PlayerId,
            nickname: p1Socket.data.nickname as string,
            socketId: p1Socket.id,
            connected: true,
            graceEndsAt: null,
          },
          p2: {
            playerId: p2PlayerId,
            nickname: p2Socket.data.nickname as string,
            socketId: p2Socket.id,
            connected: true,
            graceEndsAt: null,
          },
          p1Ph: null,
          pendingQuestion: null,
          history: [],
          questionsCount: 0,
          p1Penalty: 0,
          p2Penalty: 0,
          p2MaxScore,
          startedAt: Date.now(),
        };

        await createMatchRecord(matchId, p1PlayerId, p2PlayerId);
        await insertMatchEvent(matchId, "match_created", null, { p1PlayerId, p2PlayerId });

        activeMatches.set(matchId, match);
        playerToMatch.set(p1PlayerId, matchId);
        playerToMatch.set(p2PlayerId, matchId);

        p1Socket.emit("match:found", {
          matchId,
          role: "p1",
          opponentNickname: match.p2.nickname,
        });
        p2Socket.emit("match:found", {
          matchId,
          role: "p2",
          opponentNickname: match.p1.nickname,
        });

        emitState(match);
      } else {
        waitingQueue.push(playerId);
        socket.emit("match:notification", { message: "In attesa di un avversario...", level: "info" });
      }
    });

    socket.on("match:resume", () => {
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (match) {
        emitState(match);
      } else {
        socket.emit("match:notification", { message: "Nessuna partita attiva", level: "info" });
      }
    });

    socket.on("match:p1_set_ph", async (payload: { ph: number }) => {
      const { ph } = payload;
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (!match || match.p1.playerId !== playerId) {
        return;
      }
      if (!isIntegerInRange(ph, 0, 14)) {
        emitNotification(match, playerId, "pH non valido", "error");
        return;
      }
      if (match.p1Ph !== null) {
        emitNotification(match, playerId, "pH già impostato", "warn");
        return;
      }

      match.p1Ph = ph;
      match.status = "in_progress";
      await insertMatchEvent(match.id, "p1_set_ph", playerId, { ph });
      await persistMatch(match);
      emitState(match);
    });

    socket.on("match:p2_ask_indicator", async (payload: { indicatorId: number }) => {
      const { indicatorId } = payload;
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (!match || match.p2.playerId !== playerId) {
        return;
      }
      if (match.status !== "in_progress" || match.p1Ph === null) {
        emitNotification(match, playerId, "Partita non pronta", "warn");
        return;
      }
      if (match.pendingQuestion) {
        emitNotification(match, playerId, "Attendi la risposta", "warn");
        return;
      }

      const indicator = indicatorsById.get(indicatorId);
      if (!indicator) {
        emitNotification(match, playerId, "Indicatore non valido", "error");
        return;
      }

      match.pendingQuestion = indicator;
      await insertMatchEvent(match.id, "p2_ask_indicator", playerId, { indicatorId });
      emitState(match);
    });

    socket.on("match:p1_answer", async (payload: { category: IndicatorOutcome }) => {
      const { category } = payload;
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (!match || match.p1.playerId !== playerId) {
        return;
      }
      if (!match.pendingQuestion || match.p1Ph === null) {
        emitNotification(match, playerId, "Nessuna domanda in corso", "warn");
        return;
      }

      if (category !== "ACIDO" && category !== "INTERMEDIO" && category !== "BASICO") {
        emitNotification(match, playerId, "Risposta non valida", "error");
        return;
      }

      const correct = getOutcome(match.p1Ph, match.pendingQuestion);
      if (category !== correct) {
        match.p1Penalty += 2;
        await insertMatchEvent(match.id, "p1_answer_wrong", playerId, {
          indicatorId: match.pendingQuestion.id,
          category,
        });

        emitNotification(match, playerId, "Risposta errata, riprova", "warn");
        emitNotification(match, match.p2.playerId, "P1 ha sbagliato, attesa nuova risposta", "info");
        await persistMatch(match);
        emitState(match);
        return;
      }

      match.history.push({
        indicatorId: match.pendingQuestion.id,
        indicatorName: match.pendingQuestion.name,
        acidColor: match.pendingQuestion.acidColor,
        baseColor: match.pendingQuestion.baseColor,
        low: match.pendingQuestion.low,
        high: match.pendingQuestion.high,
        outcome: correct,
      });
      match.pendingQuestion = null;
      match.questionsCount += 1;

      await insertMatchEvent(match.id, "p1_answer_correct", playerId, {
        category,
        questionsCount: match.questionsCount,
      });
      await persistMatch(match);
      emitState(match);
    });

    socket.on("match:p2_guess_ph", async (payload: { ph: number }) => {
      const { ph } = payload;
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (!match || match.p2.playerId !== playerId) {
        return;
      }
      if (match.status !== "in_progress" || match.p1Ph === null) {
        emitNotification(match, playerId, "Partita non pronta", "warn");
        return;
      }
      if (!isIntegerInRange(ph, 0, 14)) {
        emitNotification(match, playerId, "pH non valido", "error");
        return;
      }
      if (match.pendingQuestion) {
        emitNotification(match, playerId, "Attendi la risposta", "warn");
        return;
      }

      if (ph === match.p1Ph) {
        await insertMatchEvent(match.id, "p2_guess_correct", playerId, { ph });
        await endMatch(match, match.p2.playerId, "p2_guess_correct");
        return;
      }

      match.p2Penalty += 2;
      await insertMatchEvent(match.id, "p2_guess_wrong", playerId, { ph });
      emitNotification(match, playerId, "pH errato, riprova", "warn");
      emitNotification(match, match.p1.playerId, "P2 ha sbagliato il pH", "info");
      await persistMatch(match);
      emitState(match);
    });

    socket.on("match:give_up", async () => {
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }
      const match = getMatchForPlayer(playerId);
      if (!match) {
        return;
      }

      const scores = calculateScores(match);
      const isP1 = match.p1.playerId === playerId;
      const currentScore = isP1 ? scores.p1Score : scores.p2Score;
      if (currentScore > 0) {
        emitNotification(match, playerId, "Puoi arrenderti solo a punteggio 0", "warn");
        return;
      }

      const winner = isP1 ? match.p2.playerId : match.p1.playerId;
      await insertMatchEvent(match.id, "match_give_up", playerId, {});
      await endMatch(match, winner, "give_up");
    });

    socket.on("disconnect", () => {
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        return;
      }

      const queueIndex = waitingQueue.indexOf(playerId);
      if (queueIndex !== -1) {
        waitingQueue.splice(queueIndex, 1);
      }

      const match = getMatchForPlayer(playerId);
      if (!match) {
        return;
      }

      const player = match.p1.playerId === playerId ? match.p1 : match.p2;
      player.connected = false;
      player.graceEndsAt = Date.now() + 30000;

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }

      player.disconnectTimer = setTimeout(async () => {
        const winner = match.p1.playerId === playerId ? match.p2.playerId : match.p1.playerId;
        await insertMatchEvent(match.id, "match_forfeit", playerId, { reason: "disconnect" });
        await endMatch(match, winner, "disconnect_forfeit");
      }, 30000);

      const opponent = match.p1.playerId === playerId ? match.p2 : match.p1;
      const opponentSocket = io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.emit("presence:opponent", { connected: false, graceEndsAt: player.graceEndsAt });
      }

      emitState(match);
    });
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
