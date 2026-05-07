import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Indicator,
  MatchEndedPayload,
  MatchState,
} from "@shared/types";
import { authenticateSocket, getSocket } from "../socket";

const QUICK_MATCH_KEY = "quickMatchPending";

function ensureAuth() {
  const playerId = localStorage.getItem("playerId");
  const nickname = localStorage.getItem("nickname");
  if (!playerId || !nickname) {
    return null;
  }
  authenticateSocket(playerId, nickname);
  return { playerId, nickname };
}

export default function MatchPage() {
  const navigate = useNavigate();
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [ended, setEnded] = useState<MatchEndedPayload | null>(null);
  const [search, setSearch] = useState("");
  const [guess, setGuess] = useState("");
  const [phInput, setPhInput] = useState("");
  const [graceSeconds, setGraceSeconds] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [matchFoundAt, setMatchFoundAt] = useState<number | null>(null);
  const [retryOverlay, setRetryOverlay] = useState<{
    title: string;
    subtitle: string;
    role: "p1" | "p2";
  } | null>(null);
  const [toasts, setToasts] = useState<
    { id: string; message: string; level: "info" | "warn" | "error" }[]
  >([]);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const debugEnabled = import.meta.env.VITE_DEBUG === "true";

  const { pushToast, handleNotification } = createToastHelpers({
    setToasts,
    setRetryOverlay,
    setSearching,
  });

  const logDebug = (message: string) => {
    if (!debugEnabled) {
      return;
    }
    setDebugEvents((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()} ${message}`]);
  };

  const clearQuickMatchRequest = () => {
    sessionStorage.removeItem(QUICK_MATCH_KEY);
  };

  useEffect(() => {
    const auth = ensureAuth();
    const socket = getSocket();

    socket.on("match:state", (state) => {
      setMatchState(state);
      setEnded(null);
      setSearching(false);
      clearQuickMatchRequest();
      logDebug("match:state ricevuto");
    });

    socket.on("auth:ok", (payload) => {
      localStorage.setItem("playerId", payload.playerId);
      localStorage.setItem("nickname", payload.nickname);
      logDebug("auth:ok ricevuto");

      if (sessionStorage.getItem(QUICK_MATCH_KEY) === "1") {
        clearQuickMatchRequest();
        setSearching(true);
        socket.emit("match:quick_match");
        logDebug("match:quick_match emesso dopo auth");
      }
    });

    socket.on("match:found", () => {
      setMatchFoundAt(Date.now());
      setSearching(false);
      clearQuickMatchRequest();
      logDebug("match:found ricevuto");
    });

    socket.on("match:notification", (payload) => {
      handleNotification(payload.message, payload.level);
      logDebug(`match:notification ${payload.message}`);
    });

    socket.on("match:ended", (payload) => {
      setEnded(payload);
      logDebug("match:ended ricevuto");
    });

    socket.on("presence:opponent", (payload) => {
      setMatchState((prev) =>
        prev
          ? {
              ...prev,
              opponent: {
                ...prev.opponent,
                connected: payload.connected,
                graceEndsAt: payload.graceEndsAt,
              },
            }
          : prev
      );
      logDebug("presence:opponent aggiornato");
    });

    socket.on("connect", () => {
      logDebug("socket connesso");
    });

    socket.on("disconnect", () => {
      logDebug("socket disconnesso");
    });

    if (auth) {
      socket.emit("match:resume");
      logDebug("match:resume emesso");
    }

    return () => {
      socket.off("match:state");
      socket.off("auth:ok");
      socket.off("match:notification");
      socket.off("match:found");
      socket.off("match:ended");
      socket.off("presence:opponent");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    const deadline = matchState?.opponent.graceEndsAt;
    if (!deadline) {
      setGraceSeconds(null);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setGraceSeconds(remaining);
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [matchState?.opponent.graceEndsAt]);

  const indicators = matchState?.indicators || [];
  const filteredIndicators = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return indicators;
    }
    return indicators.filter((indicator) =>
      indicator.name.toLowerCase().includes(query)
    );
  }, [indicators, search]);

  const handleQuickMatch = () => {
    const auth = ensureAuth();
    if (!auth) {
      navigate("/");
      return;
    }
    sessionStorage.setItem(QUICK_MATCH_KEY, "1");
    setSearching(true);
    logDebug("quick match richiesto");
    authenticateSocket(auth.playerId, auth.nickname);
  };

  const handleSetPh = () => {
    const value = Number(phInput);
    if (!Number.isInteger(value)) {
      pushToast("Inserisci un numero intero", "warn");
      return;
    }
    getSocket().emit("match:p1_set_ph", { ph: value });
  };

  const handleAskIndicator = (indicator: Indicator) => {
    getSocket().emit("match:p2_ask_indicator", { indicatorId: indicator.id });
  };

  const handleAnswer = (category: "ACIDO" | "INTERMEDIO" | "BASICO") => {
    getSocket().emit("match:p1_answer", { category });
  };

  const handleGuess = () => {
    const value = Number(guess);
    if (!Number.isInteger(value)) {
      pushToast("Inserisci un numero intero", "warn");
      return;
    }
    getSocket().emit("match:p2_guess_ph", { ph: value });
  };

  const handleGiveUp = () => {
    if (!window.confirm("Confermi la resa?")) {
      return;
    }
    getSocket().emit("match:give_up");
  };

  useEffect(() => {
    if (!retryOverlay) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setRetryOverlay(null);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [retryOverlay]);

  useEffect(() => {
    if (!matchFoundAt) {
      return;
    }
    const timeout = window.setTimeout(() => setMatchFoundAt(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [matchFoundAt]);

  const isP1 = matchState?.role === "p1";
  const yourScore = matchState ? (isP1 ? matchState.p1Score : matchState.p2Score) : 0;
  const opponentScore = matchState ? (isP1 ? matchState.p2Score : matchState.p1Score) : 0;
  const canGiveUp = matchState ? yourScore === 0 && matchState.status !== "ended" : false;

  const overlay = deriveOverlay({
    matchState,
    ended,
    isP1,
    searching,
    matchFoundAt,
    retryOverlay,
    graceSeconds,
  });
  const isPaused = Boolean(overlay);

  if (ended && matchState) {
    return (
      <section className="page game-shell">
        <ToastStack toasts={toasts} />
        <EndScreen
          ended={ended}
          isWinner={ended.winnerPlayerId === matchState.you.playerId}
          isDraw={!ended.winnerPlayerId}
          yourScore={yourScore}
          opponentScore={opponentScore}
          onHome={() => navigate("/")}
          onQuickMatch={handleQuickMatch}
          onLeaderboard={() => navigate("/classifica")}
        />
      </section>
    );
  }

  if (!matchState) {
    return (
      <section className="page game-shell">
        <ToastStack toasts={toasts} />
        <div className="game-stage">
          {overlay && <StateOverlay overlay={overlay} onDismiss={() => setRetryOverlay(null)} />}
          <div className={`game-content ${isPaused ? "is-paused" : ""}`}>
            <div className="card empty-card">
              <h2>Nessuna partita attiva</h2>
              <p>Premi per cercare un avversario e iniziare subito.</p>
              <button className="primary" onClick={handleQuickMatch}>
                Cerca partita
              </button>
              <button className="ghost" onClick={() => navigate("/")}>Torna alla home</button>
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="page game-shell">
      <ToastStack toasts={toasts} />
      <div className="game-stage">
        {overlay && <StateOverlay overlay={overlay} onDismiss={() => setRetryOverlay(null)} />}
        <div className={`game-content ${isPaused ? "is-paused" : ""}`}>
          <div className="scoreboard">
            <div className="score-card">
              <div className="score-label">Il tuo punteggio</div>
              <div className="score">{yourScore}</div>
            </div>
            <div className="score-card">
              <div className="score-label">Punteggio avversario</div>
              <div className="score">{opponentScore}</div>
            </div>
          </div>

          <div className="match-grid">
            <div className="card game-panel">
              <div className="panel-header">
                <h2>Ruolo: {isP1 ? "P1" : "P2"}</h2>
                <span className="pill">{matchState.status === "in_progress" ? "In partita" : "Preparazione"}</span>
              </div>
              {isP1 ? (
                <>
                  <div className="section">
                    <h3>Il tuo pH segreto</h3>
                    {matchState.p1Ph === null ? (
                      <div className="inline-form">
                        <input
                          type="number"
                          min={0}
                          max={14}
                          value={phInput}
                          onChange={(event) => setPhInput(event.target.value)}
                          placeholder="0 - 14"
                        />
                        <button onClick={handleSetPh} className="primary">
                          Conferma pH
                        </button>
                      </div>
                    ) : (
                      <div className="pill highlight">pH scelto: {matchState.p1Ph}</div>
                    )}
                  </div>
                  <div className="section">
                    <h3>Domanda attiva</h3>
                    {matchState.pendingQuestion ? (
                      <>
                        <IndicatorCard indicator={matchState.pendingQuestion} />
                        <div className="button-row large">
                          <button className="secondary" onClick={() => handleAnswer("ACIDO")}>ACIDO</button>
                          <button className="secondary" onClick={() => handleAnswer("INTERMEDIO")}>INTERMEDIO</button>
                          <button className="secondary" onClick={() => handleAnswer("BASICO")}>BASICO</button>
                        </div>
                      </>
                    ) : (
                      <p>In attesa della prossima domanda.</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="section">
                    <h3>Elenco indicatori</h3>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cerca indicatore"
                    />
                    <div className="indicator-list">
                      {filteredIndicators.map((indicator) => (
                        <div key={indicator.id} className="indicator-item">
                          <IndicatorCard indicator={indicator} compact />
                          <button
                            className="primary"
                            onClick={() => handleAskIndicator(indicator)}
                            disabled={Boolean(matchState.pendingQuestion) || matchState.status !== "in_progress"}
                          >
                            Chiedi
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="section">
                    <h3>Indovina il pH</h3>
                    <div className="inline-form">
                      <input
                        type="number"
                        min={0}
                        max={14}
                        value={guess}
                        onChange={(event) => setGuess(event.target.value)}
                        placeholder="0 - 14"
                      />
                      <button
                        className="secondary"
                        onClick={handleGuess}
                        disabled={matchState.status !== "in_progress" || Boolean(matchState.pendingQuestion)}
                      >
                        Indovina
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="card game-panel">
              <div className="panel-header">
                <h2>Storico risposte validate</h2>
              </div>
              {matchState.history.length === 0 ? (
                <p>Nessuna risposta valida ancora.</p>
              ) : (
                <ul className="history">
                  {matchState.history.map((item, index) => (
                    <li key={`${item.indicatorId}-${index}`}>
                      <div className="history-title">{item.indicatorName}</div>
                      <div className={`tag ${item.outcome.toLowerCase()}`}>{item.outcome}</div>
                      <div className="history-meta">
                        acido: {item.acidColor} | basico: {item.baseColor} | {item.low} - {item.high}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canGiveUp && (
                <button className="danger" onClick={handleGiveUp}>
                  Arrenditi
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IndicatorCard({ indicator, compact }: { indicator: Indicator; compact?: boolean }) {
  const acidColor = colorForName(indicator.acidColor);
  const baseColor = colorForName(indicator.baseColor);
  const acidIsClear = indicator.acidColor.toLowerCase() === "incolore";
  const baseIsClear = indicator.baseColor.toLowerCase() === "incolore";

  return (
    <div className={compact ? "indicator-card compact" : "indicator-card"}>
      <div className="indicator-name">{indicator.name}</div>
      <div className="indicator-swatches">
        <div className="swatch">
          <span
            className={`swatch-color ${acidIsClear ? "is-clear" : ""}`}
            style={{ backgroundColor: acidColor }}
          />
          <span>Acida: {indicator.acidColor}</span>
        </div>
        <div className="swatch">
          <span
            className={`swatch-color ${baseIsClear ? "is-clear" : ""}`}
            style={{ backgroundColor: baseColor }}
          />
          <span>Basica: {indicator.baseColor}</span>
        </div>
      </div>
      <div className="indicator-meta">Intervallo di viraggio: {indicator.low} - {indicator.high}</div>
    </div>
  );
}

function colorForName(name: string) {
  const key = name.trim().toLowerCase();
  const palette: Record<string, string> = {
    rosso: "#d44a2c",
    blu: "#2f64d6",
    giallo: "#f4c400",
    verde: "#2c9b5f",
    fucsia: "#d6357c",
    viola: "#7a4ccf",
    arancione: "#f47a2f",
    incolore: "#f8f8f8",
  };
  return palette[key] || "#c9c9c9";
}

function deriveOverlay(params: {
  matchState: MatchState | null;
  ended: MatchEndedPayload | null;
  isP1: boolean | null;
  searching: boolean;
  matchFoundAt: number | null;
  retryOverlay: { title: string; subtitle: string; role: "p1" | "p2" } | null;
  graceSeconds: number | null;
}) {
  const {
    matchState,
    ended,
    isP1,
    searching,
    matchFoundAt,
    retryOverlay,
    graceSeconds,
  } = params;

  if (ended) {
    return null;
  }

  if (retryOverlay) {
    return {
      kind: retryOverlay.role === "p1" ? "retry_p1" : "retry_p2",
      title: retryOverlay.title,
      subtitle: retryOverlay.subtitle,
      actionLabel: "Riprova",
    } as const;
  }

  if (matchFoundAt) {
    return {
      kind: "found",
      title: "Match trovato!",
      subtitle: "Preparati, la partita sta iniziando.",
    } as const;
  }

  if (!matchState) {
    if (searching) {
      return {
        kind: "searching",
        title: "Cerco un avversario",
        subtitle: "Restate connessi, stiamo abbinando la partita.",
      } as const;
    }
    return null;
  }

  if (matchState.opponent.graceEndsAt && !matchState.opponent.connected) {
    return {
      kind: "opponent_disconnect",
      title: "Avversario disconnesso",
      subtitle: `Rientro entro ${graceSeconds ?? 0}s`,
    } as const;
  }

  if (matchState.status === "waiting_p1_ph" && !isP1) {
    return {
      kind: "waiting_p1_ph",
      title: "Attendi P1",
      subtitle: "P1 sta scegliendo il pH segreto.",
    } as const;
  }

  if (matchState.status === "in_progress" && isP1 && !matchState.pendingQuestion) {
    return {
      kind: "waiting_p2_question",
      title: "Attendi la domanda",
      subtitle: "P2 sta scegliendo l indicatore.",
    } as const;
  }

  if (matchState.status === "in_progress" && !isP1 && matchState.pendingQuestion) {
    return {
      kind: "waiting_p1_answer",
      title: "P1 sta rispondendo",
      subtitle: "Risposta in arrivo.",
    } as const;
  }

  return null;
}

function StateOverlay({
  overlay,
  onDismiss,
}: {
  overlay: {
    kind:
      | "searching"
      | "found"
      | "waiting_p1_ph"
      | "waiting_p2_question"
      | "waiting_p1_answer"
      | "opponent_disconnect"
      | "retry_p1"
      | "retry_p2";
    title: string;
    subtitle: string;
    actionLabel?: string;
  };
  onDismiss: () => void;
}) {
  return (
    <div className="game-overlay">
      <div className="overlay-card">
        <div className="spinner" />
        <h3>{overlay.title}</h3>
        <p>{overlay.subtitle}</p>
        {overlay.actionLabel && (
          <button className="secondary" onClick={onDismiss}>
            {overlay.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function EndScreen({
  ended,
  isWinner,
  isDraw,
  yourScore,
  opponentScore,
  onHome,
  onQuickMatch,
  onLeaderboard,
}: {
  ended: MatchEndedPayload;
  isWinner: boolean;
  isDraw: boolean;
  yourScore: number;
  opponentScore: number;
  onHome: () => void;
  onQuickMatch: () => void;
  onLeaderboard: () => void;
}) {
  const title = isDraw ? "PAREGGIO" : isWinner ? "VITTORIA" : "SCONFITTA";
  const reason = formatEndReason(ended.reason);

  return (
    <div className="end-screen">
      <div className="end-card">
        <div className="end-title">{title}</div>
        <div className="end-reason">{reason}</div>
        <div className="end-scores">
          <div>
            <div className="score-label">Il tuo punteggio</div>
            <div className="score">{yourScore}</div>
          </div>
          <div>
            <div className="score-label">Punteggio avversario</div>
            <div className="score">{opponentScore}</div>
          </div>
        </div>
        <div className="end-actions">
          <button className="primary" onClick={onQuickMatch}>
            Gioca ancora
          </button>
          <button className="secondary" onClick={onHome}>
            Torna alla home
          </button>
          <button className="ghost" onClick={onLeaderboard}>
            Classifica
          </button>
        </div>
      </div>
    </div>
  );
}

function formatEndReason(reason: string) {
  switch (reason) {
    case "p2_guess_correct":
      return "Indovinato il pH";
    case "give_up":
      return "Arrendersi";
    case "disconnect_forfeit":
      return "Disconnessione";
    default:
      return "Partita terminata";
  }
}

function ToastStack({
  toasts,
}: {
  toasts: { id: string; message: string; level: "info" | "warn" | "error" }[];
}) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.level}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function DebugPanel({ events }: { events: string[] }) {
  return (
    <div className="debug-panel">
      <div className="debug-title">Debug Match</div>
      {events.length === 0 ? (
        <div className="debug-line">Nessun evento</div>
      ) : (
        events.map((event, index) => (
          <div key={`${event}-${index}`} className="debug-line">
            {event}
          </div>
        ))
      )}
    </div>
  );
}

function createToastHandler(setToasts: Dispatch<SetStateAction<
  { id: string; message: string; level: "info" | "warn" | "error" }[]
>>) {
  return (message: string, level: "info" | "warn" | "error") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, level }].slice(-3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  };
}

function createNotificationHandler(
  pushToast: (message: string, level: "info" | "warn" | "error") => void,
  setRetryOverlay: Dispatch<SetStateAction<{
    title: string;
    subtitle: string;
    role: "p1" | "p2";
  } | null>>,
  setSearching: Dispatch<SetStateAction<boolean>>
) {
  return (message: string, level: "info" | "warn" | "error") => {
    const normalized = message.toLowerCase();

    if (normalized.includes("in attesa di un avversario")) {
      setSearching(true);
      return;
    }

    if (normalized.includes("risposta errata")) {
      setRetryOverlay({
        title: "Risposta errata",
        subtitle: "Riprova con la categoria corretta.",
        role: "p1",
      });
      pushToast("Penalita -2 applicata", "warn");
      return;
    }

    if (normalized.includes("ph errato")) {
      setRetryOverlay({
        title: "pH errato",
        subtitle: "Riprova con un altro valore.",
        role: "p2",
      });
      pushToast("Penalita -2 applicata", "warn");
      return;
    }

    if (normalized.includes("ha sbagliato")) {
      pushToast(message, "info");
      return;
    }

    pushToast(message, level);
  };
}

function createToastHelpers({
  setToasts,
  setRetryOverlay,
  setSearching,
}: {
  setToasts: Dispatch<SetStateAction<
    { id: string; message: string; level: "info" | "warn" | "error" }[]
  >>;
  setRetryOverlay: Dispatch<SetStateAction<{
    title: string;
    subtitle: string;
    role: "p1" | "p2";
  } | null>>;
  setSearching: Dispatch<SetStateAction<boolean>>;
}) {
  const pushToast = createToastHandler(setToasts);
  const handleNotification = createNotificationHandler(pushToast, setRetryOverlay, setSearching);

  return { pushToast, handleNotification };
}
