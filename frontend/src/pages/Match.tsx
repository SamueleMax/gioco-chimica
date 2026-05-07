import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
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
  const [p1Touched, setP1Touched] = useState(false);
  const [p2Touched, setP2Touched] = useState(false);
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
  const [scorePulse, setScorePulse] = useState({ you: false, opponent: false });
  const prevScores = useRef({ you: 0, opponent: 0 });
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
    const validation = getPhValidation(phInput, true);
    if (!validation.isValid) {
      setP1Touched(true);
      return;
    }
    getSocket().emit("match:p1_set_ph", { ph: Number(phInput) });
  };

  const handleAskIndicator = (indicator: Indicator) => {
    getSocket().emit("match:p2_ask_indicator", { indicatorId: indicator.id });
  };

  const handleAnswer = (category: "ACIDO" | "INTERMEDIO" | "BASICO") => {
    getSocket().emit("match:p1_answer", { category });
  };

  const handleGuess = () => {
    const validation = getPhValidation(guess, true);
    if (!validation.isValid) {
      setP2Touched(true);
      return;
    }
    getSocket().emit("match:p2_guess_ph", { ph: Number(guess) });
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

  useEffect(() => {
    if (!matchState) {
      return;
    }
    setPhInput("");
    setGuess("");
    setP1Touched(false);
    setP2Touched(false);
    prevScores.current = {
      you: matchState.role === "p1" ? matchState.p1Score : matchState.p2Score,
      opponent: matchState.role === "p1" ? matchState.p2Score : matchState.p1Score,
    };
  }, [matchState?.matchId]);

  const isP1 = matchState?.role === "p1";
  const yourScore = matchState ? (isP1 ? matchState.p1Score : matchState.p2Score) : 0;
  const opponentScore = matchState ? (isP1 ? matchState.p2Score : matchState.p1Score) : 0;
  const p1Validation = getPhValidation(phInput, p1Touched);
  const p2Validation = getPhValidation(guess, p2Touched);
  const p1CanAct = Boolean(
    isP1 && (matchState?.p1Ph === null || Boolean(matchState?.pendingQuestion))
  );
  const p2CanAct = Boolean(
    !isP1 && matchState?.status === "in_progress" && !matchState?.pendingQuestion
  );
  const canAct = isP1 ? p1CanAct : p2CanAct;

  useEffect(() => {
    if (!matchState) {
      return;
    }
    const previous = prevScores.current;
    if (previous.you !== yourScore) {
      setScorePulse((prev) => ({ ...prev, you: true }));
      window.setTimeout(() => {
        setScorePulse((prev) => ({ ...prev, you: false }));
      }, 320);
    }
    if (previous.opponent !== opponentScore) {
      setScorePulse((prev) => ({ ...prev, opponent: true }));
      window.setTimeout(() => {
        setScorePulse((prev) => ({ ...prev, opponent: false }));
      }, 320);
    }
    prevScores.current = { you: yourScore, opponent: opponentScore };
  }, [yourScore, opponentScore, matchState?.matchId]);

  const canGiveUp = matchState ? yourScore === 0 && matchState.status !== "ended" : false;

  const overlay = getActiveOverlay({
    matchState,
    ended,
    isP1,
    canAct,
    searching,
    matchFoundAt,
    retryOverlay,
    graceSeconds,
  });
  const isPaused = Boolean(overlay);
  const showTurnOverlay = Boolean(
    !overlay && matchState?.status === "in_progress" && !canAct
  );

  if (ended && matchState) {
    return (
      <section className="page game-shell">
        <ToastStack toasts={toasts} />
        {debugEnabled && <DebugPanel events={debugEvents} />}
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
        {debugEnabled && <DebugPanel events={debugEvents} />}
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
      {debugEnabled && <DebugPanel events={debugEvents} />}
      <GameHud
        role={isP1 ? "P1" : "P2"}
        nickname={matchState.you.nickname}
        opponentNickname={matchState.opponent.nickname}
        yourScore={yourScore}
        opponentScore={opponentScore}
        questionsCount={matchState.questionsCount}
        opponentConnected={matchState.opponent.connected}
        graceSeconds={graceSeconds}
        scorePulse={scorePulse}
      />
      <div className="game-stage">
        {overlay && <StateOverlay overlay={overlay} onDismiss={() => setRetryOverlay(null)} />}
        <div className={`game-content ${isPaused ? "is-paused" : ""}`}>
          <div className="match-grid">
            <div
              className={`card game-panel ${
                (isP1 ? !p1CanAct : !p2CanAct) ? "panel-disabled" : ""
              }`}
            >
              <div className="panel-header">
                <h2>Ruolo: {isP1 ? "P1" : "P2"}</h2>
                <span className="pill">{matchState.status === "in_progress" ? "In partita" : "Preparazione"}</span>
              </div>
              {showTurnOverlay && (
                <div className="turn-overlay">E' il turno dell'altro giocatore</div>
              )}
              {isP1 ? (
                <>
                  <div className="section">
                    <h3>Il tuo pH segreto</h3>
                    {matchState.p1Ph === null ? (
                      <>
                        <div className="inline-form">
                          <input
                            type="number"
                            min={0}
                            max={14}
                            value={phInput}
                            onChange={(event) => {
                              setPhInput(event.target.value);
                              setP1Touched(true);
                            }}
                            onBlur={() => setP1Touched(true)}
                            className={p1Validation.showError ? "input-error" : ""}
                            placeholder="0 - 14"
                          />
                          <button
                            onClick={handleSetPh}
                            className="primary"
                            disabled={!p1Validation.isValid}
                          >
                            Conferma pH
                          </button>
                        </div>
                        {p1Validation.showError && (
                          <div className="helper-error">{p1Validation.message}</div>
                        )}
                      </>
                    ) : (
                      <div className="pill highlight">pH scelto: {matchState.p1Ph}</div>
                    )}
                  </div>
                  <div className="section">
                    <h3>Domanda attiva</h3>
                    {matchState.pendingQuestion ? (
                      <>
                        <IndicatorCard indicator={matchState.pendingQuestion} variant="question" />
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
                          <IndicatorCard indicator={indicator} compact variant="list" />
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
                        onChange={(event) => {
                          setGuess(event.target.value);
                          setP2Touched(true);
                        }}
                        onBlur={() => setP2Touched(true)}
                        className={p2Validation.showError ? "input-error" : ""}
                        placeholder="0 - 14"
                      />
                      <button
                        className="secondary"
                        onClick={handleGuess}
                        disabled={
                          !p2Validation.isValid ||
                          matchState.status !== "in_progress" ||
                          Boolean(matchState.pendingQuestion)
                        }
                      >
                        Indovina
                      </button>
                    </div>
                    {p2Validation.showError && (
                      <div className="helper-error">{p2Validation.message}</div>
                    )}
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
                      <IndicatorCard
                        indicator={{
                          id: item.indicatorId,
                          name: item.indicatorName,
                          acidColor: item.acidColor,
                          baseColor: item.baseColor,
                          low: item.low,
                          high: item.high,
                        }}
                        outcome={item.outcome}
                        variant="history"
                      />
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

function IndicatorCard({
  indicator,
  compact,
  outcome,
  variant,
}: {
  indicator: Indicator;
  compact?: boolean;
  outcome?: string;
  variant?: "history" | "question" | "list";
}) {
  const acidColor = colorForName(indicator.acidColor);
  const baseColor = colorForName(indicator.baseColor);
  const acidIsClear = indicator.acidColor.toLowerCase() === "incolore";
  const baseIsClear = indicator.baseColor.toLowerCase() === "incolore";
  const classes = [
    "indicator-card",
    compact ? "compact" : "",
    variant ? `variant-${variant}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="indicator-top">
        <div className="indicator-name">{indicator.name}</div>
        {outcome && (
          <span className={`outcome-badge ${outcome.toLowerCase()}`}>{outcome}</span>
        )}
      </div>
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
      <div className="indicator-footer">
        <span className="range-pill">Viraggio: {indicator.low} - {indicator.high}</span>
      </div>
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

function getActiveOverlay(params: {
  matchState: MatchState | null;
  ended: MatchEndedPayload | null;
  isP1: boolean | null;
  canAct: boolean;
  searching: boolean;
  matchFoundAt: number | null;
  retryOverlay: { title: string; subtitle: string; role: "p1" | "p2" } | null;
  graceSeconds: number | null;
}) {
  const {
    matchState,
    ended,
    isP1,
    canAct,
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
      tone: "alert",
      showSpinner: false,
    } as const;
  }

  if (matchState?.opponent.graceEndsAt && !matchState.opponent.connected) {
    return {
      kind: "opponent_disconnect",
      title: "Avversario disconnesso",
      subtitle: `Rientro entro ${graceSeconds ?? 0}s`,
      tone: "warning",
      showSpinner: true,
    } as const;
  }

  if (matchFoundAt) {
    return {
      kind: "found",
      title: "Match trovato!",
      subtitle: "Preparati, la partita sta iniziando.",
      tone: "success",
      showSpinner: false,
    } as const;
  }

  if (!matchState) {
    if (searching) {
      return {
        kind: "searching",
        title: "Cerco un avversario",
        subtitle: "Restate connessi, stiamo abbinando la partita.",
        tone: "waiting",
        showSpinner: true,
      } as const;
    }
    return null;
  }

  if (!canAct) {
    if (matchState.status === "waiting_p1_ph" && !isP1) {
      return {
        kind: "waiting_p1_ph",
        title: "Attendi P1",
        subtitle: "E' il turno dell'altro giocatore.",
        tone: "waiting",
        showSpinner: true,
      } as const;
    }

    if (matchState.status === "in_progress" && isP1 && !matchState.pendingQuestion) {
      return {
        kind: "waiting_p2_question",
        title: "Attendi la domanda",
        subtitle: "E' il turno dell'altro giocatore.",
        tone: "waiting",
        showSpinner: true,
      } as const;
    }

    if (matchState.status === "in_progress" && !isP1 && matchState.pendingQuestion) {
      return {
        kind: "waiting_p1_answer",
        title: "P1 sta rispondendo",
        subtitle: "E' il turno dell'altro giocatore.",
        tone: "waiting",
        showSpinner: true,
      } as const;
    }
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
    tone: "alert" | "warning" | "waiting" | "success";
    showSpinner: boolean;
  };
  onDismiss: () => void;
}) {
  return (
    <div className="game-overlay">
      <div className={`overlay-card tone-${overlay.tone}`}>
        {overlay.showSpinner ? <div className="spinner" /> : <div className="overlay-icon" />}
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

function GameHud({
  role,
  nickname,
  opponentNickname,
  yourScore,
  opponentScore,
  questionsCount,
  opponentConnected,
  graceSeconds,
  scorePulse,
}: {
  role: "P1" | "P2";
  nickname: string;
  opponentNickname: string;
  yourScore: number;
  opponentScore: number;
  questionsCount: number;
  opponentConnected: boolean;
  graceSeconds: number | null;
  scorePulse: { you: boolean; opponent: boolean };
}) {
  return (
    <div className="game-hud">
      <div className="hud-role">
        <span className="role-badge">{role}</span>
        <div className="hud-name">{nickname}</div>
        <div className="hud-sub">vs {opponentNickname}</div>
      </div>
      <div className="hud-scores">
        <div className={`hud-score ${scorePulse.you ? "pop" : ""}`}>
          <div className="hud-score-label">TU</div>
          <div className="hud-score-value">{yourScore}</div>
        </div>
        <div className={`hud-score ${scorePulse.opponent ? "pop" : ""}`}>
          <div className="hud-score-label">AVV</div>
          <div className="hud-score-value">{opponentScore}</div>
        </div>
      </div>
      <div className="hud-meta">
        <div className="hud-questions">Domande (a): {questionsCount}</div>
        <div className={`hud-connection ${opponentConnected ? "ok" : "down"}`}>
          <span className="status-dot" />
          {opponentConnected
            ? "Avversario connesso"
            : `Disconnesso ${graceSeconds ?? 0}s`}
        </div>
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
      return "Resa";
    case "disconnect_forfeit":
      return "Disconnessione";
    default:
      return "Partita terminata";
  }
}

function getPhValidation(value: string, touched: boolean) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const isValid =
    trimmed.length > 0 && Number.isInteger(parsed) && parsed >= 0 && parsed <= 14;

  return {
    isValid,
    showError: touched && !isValid,
    message: "Inserisci un numero intero tra 0 e 14",
  };
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
