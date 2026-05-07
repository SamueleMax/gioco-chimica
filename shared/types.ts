export type Role = "p1" | "p2";

export type Indicator = {
  id: number;
  name: string;
  acidColor: string;
  baseColor: string;
  low: number;
  high: number;
};

export type IndicatorOutcome = "ACIDO" | "INTERMEDIO" | "BASICO";

export type HistoryItem = {
  indicatorId: number;
  indicatorName: string;
  acidColor: string;
  baseColor: string;
  low: number;
  high: number;
  outcome: IndicatorOutcome;
};

export type MatchStatus = "waiting_p1_ph" | "in_progress" | "ended";

export type MatchState = {
  matchId: string;
  role: Role;
  status: MatchStatus;
  p1Ph: number | null;
  pendingQuestion: Indicator | null;
  indicators: Indicator[];
  history: HistoryItem[];
  questionsCount: number;
  p1Score: number;
  p2Score: number;
  p1Penalty: number;
  p2Penalty: number;
  p2MaxScore: number;
  you: {
    playerId: string;
    nickname: string;
  };
  opponent: {
    playerId: string;
    nickname: string;
    connected: boolean;
    graceEndsAt: number | null;
  };
};

export type MatchFoundPayload = {
  matchId: string;
  role: Role;
  opponentNickname: string;
};

export type MatchEndedPayload = {
  matchId: string;
  winnerPlayerId: string | null;
  reason: string;
  p1Score: number;
  p2Score: number;
};

export type MatchNotification = {
  message: string;
  level: "info" | "warn" | "error";
};

export type PresencePayload = {
  connected: boolean;
  graceEndsAt: number | null;
};

export type SocketServerToClientEvents = {
  "auth:ok": (payload: { playerId: string; nickname: string }) => void;
  "match:found": (payload: MatchFoundPayload) => void;
  "match:state": (payload: MatchState) => void;
  "match:notification": (payload: MatchNotification) => void;
  "match:ended": (payload: MatchEndedPayload) => void;
  "presence:opponent": (payload: PresencePayload) => void;
};

export type SocketClientToServerEvents = {
  "auth:set_nickname": (payload: { playerId: string; nickname: string }) => void;
  "match:quick_match": () => void;
  "match:p1_set_ph": (payload: { ph: number }) => void;
  "match:p2_ask_indicator": (payload: { indicatorId: number }) => void;
  "match:p1_answer": (payload: { category: IndicatorOutcome }) => void;
  "match:p2_guess_ph": (payload: { ph: number }) => void;
  "match:give_up": () => void;
  "match:resume": () => void;
};
