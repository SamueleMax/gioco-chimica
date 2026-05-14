import {
  CSSProperties,
  Dispatch,
  ReactNode,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Indicator,
  MatchEndedPayload,
  MatchNotification,
  MatchState,
  PresencePayload,
} from "@shared/types";
import { authenticateSocket, getSocket } from "../socket";

const QUICK_MATCH_KEY = "quickMatchPending";
const PH_VALUES = Array.from({ length: 15 }, (_, index) => index);

type Toast = { id: string; message: string; level: "info" | "warn" | "error" };
type RetryOverlay = { title: string; subtitle: string; role: "p1" | "p2" };

type SceneState =
  | { id: "idle" }
  | { id: "matchmaking" }
  | { id: "match_found" }
  | { id: "p1_choose_ph" }
  | { id: "p2_choose_indicator" }
  | { id: "p1_answer_indicator" }
  | { id: "waiting"; title: string; subtitle: string };

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
  const [p1Selection, setP1Selection] = useState<number | null>(null);
  const [guessSelection, setGuessSelection] = useState<number | null>(null);
  const [p1Touched, setP1Touched] = useState(false);
  const [p2Touched, setP2Touched] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [matchFoundAt, setMatchFoundAt] = useState<number | null>(null);
  const [retryOverlay, setRetryOverlay] = useState<RetryOverlay | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scorePulse, setScorePulse] = useState({ you: false, opponent: false });
  const [guessOpen, setGuessOpen] = useState(false);
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
    setDebugEvents((prev) => [
      ...prev.slice(-8),
      `${new Date().toLocaleTimeString()} ${message}`,
    ]);
  };

  const clearQuickMatchRequest = () => {
    sessionStorage.removeItem(QUICK_MATCH_KEY);
  };

  useEffect(() => {
    const auth = ensureAuth();
    const socket = getSocket();

    socket.on("match:state", (state: MatchState) => {
      setMatchState(state);
      setEnded(null);
      setSearching(false);
      clearQuickMatchRequest();
      logDebug("match:state ricevuto");
    });

    socket.on("auth:ok", (payload: { playerId: string; nickname: string }) => {
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

    socket.on("match:notification", (payload: MatchNotification) => {
      handleNotification(payload.message, payload.level);
      logDebug(`match:notification ${payload.message}`);
    });

    socket.on("match:ended", (payload: MatchEndedPayload) => {
      setEnded(payload);
      logDebug("match:ended ricevuto");
    });

    socket.on("presence:opponent", (payload: PresencePayload) => {
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

  useEffect(() => {
    if (!matchFoundAt) {
      return;
    }
    const timeout = window.setTimeout(() => setMatchFoundAt(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [matchFoundAt]);

  useEffect(() => {
    if (!matchState) {
      return;
    }
    setP1Selection(null);
    setGuessSelection(null);
    setP1Touched(false);
    setP2Touched(false);
    setGuessOpen(false);
    setRetryOverlay(null);
    prevScores.current = {
      you: matchState.role === "p1" ? matchState.p1Score : matchState.p2Score,
      opponent: matchState.role === "p1" ? matchState.p2Score : matchState.p1Score,
    };
  }, [matchState?.matchId]);

  useEffect(() => {
    if (retryOverlay) {
      setGuessOpen(false);
    }
  }, [retryOverlay]);

  useEffect(() => {
    if (matchState?.opponent.graceEndsAt && !matchState.opponent.connected) {
      setGuessOpen(false);
    }
  }, [matchState?.opponent.graceEndsAt, matchState?.opponent.connected]);

  const indicators = matchState?.indicators || [];
  const filteredIndicators = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return indicators;
    }
    return indicators.filter((indicator) => indicator.name.toLowerCase().includes(query));
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
    if (p1Selection === null) {
      setP1Touched(true);
      return;
    }
    getSocket().emit("match:p1_set_ph", { ph: p1Selection });
  };

  const handleAskIndicator = (indicator: Indicator) => {
    getSocket().emit("match:p2_ask_indicator", { indicatorId: indicator.id });
  };

  const handleAnswer = (category: "ACIDO" | "INTERMEDIO" | "BASICO") => {
    getSocket().emit("match:p1_answer", { category });
  };

  const handleGuess = () => {
    if (guessSelection === null) {
      setP2Touched(true);
      return;
    }
    getSocket().emit("match:p2_guess_ph", { ph: guessSelection });
    setGuessOpen(false);
    setGuessSelection(null);
    setP2Touched(false);
  };

  const handleGiveUp = () => {
    if (!window.confirm("Confermi la resa?")) {
      return;
    }
    getSocket().emit("match:give_up");
  };

  const isP1 = matchState?.role === "p1";
  const yourScore = matchState ? (isP1 ? matchState.p1Score : matchState.p2Score) : 0;
  const opponentScore = matchState ? (isP1 ? matchState.p2Score : matchState.p1Score) : 0;
  const yourPenalty = matchState ? (isP1 ? matchState.p1Penalty : matchState.p2Penalty) : 0;
  const canGiveUp = matchState ? yourScore === 0 && matchState.status !== "ended" : false;
  const isDisconnected = Boolean(
    matchState?.opponent.graceEndsAt && !matchState.opponent.connected
  );

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

  if (ended && matchState) {
    return (
      <section className="page page-game">
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

  const scene = resolveScene({ matchState, searching, matchFoundAt, isP1: isP1 ?? null });
  const sceneKey = `${scene.id}-${matchState?.matchId ?? "idle"}-${matchFoundAt ?? 0}`;

  return (
    <section className="page page-game">
      <ToastStack toasts={toasts} />
      {debugEnabled && <DebugPanel events={debugEvents} />}

      {matchState && (
        <MatchHud
          role={isP1 ? "P1" : "P2"}
          nickname={matchState.you.nickname}
          opponentNickname={matchState.opponent.nickname}
          yourScore={yourScore}
          opponentScore={opponentScore}
          questionsCount={matchState.questionsCount}
          opponentConnected={matchState.opponent.connected}
          graceSeconds={graceSeconds}
          scorePulse={scorePulse}
          yourPenalty={yourPenalty}
          canGiveUp={canGiveUp}
          onGiveUp={handleGiveUp}
        />
      )}

      <div className="scene-layer">
        <SceneFrame id={scene.id} key={sceneKey}>
          {scene.id === "idle" && (
            <IdleScene onQuickMatch={handleQuickMatch} onHome={() => navigate("/")} />
          )}
          {scene.id === "matchmaking" && (
            <MatchmakingScene onCancel={() => navigate("/")} />
          )}
          {scene.id === "match_found" && <MatchFoundScene />}
          {scene.id === "p1_choose_ph" && (
            <P1ChoosePhScene
              selection={p1Selection}
              onSelect={setP1Selection}
              onConfirm={handleSetPh}
              showError={p1Touched && p1Selection === null}
              onTouched={() => setP1Touched(true)}
            />
          )}
          {scene.id === "p1_answer_indicator" && matchState?.pendingQuestion && (
            <P1AnswerScene
              indicator={matchState.pendingQuestion}
              onAnswer={handleAnswer}
              history={matchState.history}
            />
          )}
          {scene.id === "p2_choose_indicator" && matchState && (
            <P2IndicatorScene
              search={search}
              onSearch={setSearch}
              indicators={filteredIndicators}
              onAsk={handleAskIndicator}
              onGuess={() => setGuessOpen(true)}
              history={matchState.history}
            />
          )}
          {scene.id === "waiting" && (
            <WaitingScene title={scene.title} subtitle={scene.subtitle} />
          )}
        </SceneFrame>
      </div>

      {isDisconnected && (
        <OverlayNotice
          tone="warning"
          title="Avversario disconnesso"
          subtitle={`Rientro entro ${graceSeconds ?? 0}s`}
          showSpinner
        />
      )}

      {!isDisconnected && retryOverlay && (
        <OverlayNotice
          tone="alert"
          title={retryOverlay.title}
          subtitle={retryOverlay.subtitle}
          actionLabel="Riprova"
          onAction={() => setRetryOverlay(null)}
        />
      )}

      {!isDisconnected && !retryOverlay && guessOpen && (
        <ModalCard title="Indovina il pH" onClose={() => setGuessOpen(false)}>
          <PhSelector
            value={guessSelection}
            onChange={setGuessSelection}
            showError={p2Touched && guessSelection === null}
            helperText="Seleziona un valore tra 0 e 14"
          />
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleGuess}>
              Invia
            </button>
            <button className="btn btn-ghost" onClick={() => setGuessOpen(false)}>
              Annulla
            </button>
          </div>
        </ModalCard>
      )}
    </section>
  );
}

function SceneFrame({ id, children }: { id: SceneState["id"]; children: ReactNode }) {
  return <div className={`scene scene-${id} scene-enter`}>{children}</div>;
}

function IdleScene({ onQuickMatch, onHome }: { onQuickMatch: () => void; onHome: () => void }) {
  return (
    <div className="scene-card">
      <div className="scene-title">Nessuna partita attiva</div>
      <p className="scene-subtitle">Avvia una ricerca rapida per iniziare.</p>
      <div className="button-stack">
        <button className="btn btn-primary btn-large" onClick={onQuickMatch}>
          Cerca partita
        </button>
        <button className="btn btn-ghost" onClick={onHome}>
          Torna alla home
        </button>
      </div>
    </div>
  );
}

function MatchmakingScene({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="scene-card">
      <div className="orbital">
        <div className="orbital-core" />
        <div className="orbital-ring" />
      </div>
      <div className="scene-title">Cerco un avversario</div>
      <p className="scene-subtitle">Sto mescolando le provette. Restate connessi.</p>
      <div className="wait-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <button className="btn btn-ghost" onClick={onCancel}>
        Torna alla home
      </button>
    </div>
  );
}

function MatchFoundScene() {
  return (
    <div className="scene-card">
      <div className="scene-badge success">Match trovato</div>
      <div className="scene-title">Preparati</div>
      <p className="scene-subtitle">Tra un attimo si parte con la missione.</p>
    </div>
  );
}

function P1ChoosePhScene({
  selection,
  onSelect,
  onConfirm,
  showError,
  onTouched,
}: {
  selection: number | null;
  onSelect: (value: number) => void;
  onConfirm: () => void;
  showError: boolean;
  onTouched: () => void;
}) {
  return (
    <div className="scene-card">
      <div className="turn-chip active">Il tuo turno</div>
      <div className="scene-title">Scegli il pH segreto</div>
      <p className="scene-subtitle">Seleziona un valore tra 0 e 14.</p>
      <PhSelector
        value={selection}
        onChange={onSelect}
        showError={showError}
        helperText="Seleziona un valore tra 0 e 14"
      />
      <div className="button-row">
        <button
          className="btn btn-primary btn-large"
          onClick={() => {
            onTouched();
            onConfirm();
          }}
        >
          Conferma pH
        </button>
      </div>
    </div>
  );
}

function P1AnswerScene({
  indicator,
  onAnswer,
  history,
}: {
  indicator: Indicator;
  onAnswer: (category: "ACIDO" | "INTERMEDIO" | "BASICO") => void;
  history: MatchState["history"];
}) {
  return (
    <div className="scene-card">
      <div className="turn-chip active">Il tuo turno</div>
      <div className="scene-title">Rispondi all'indicatore</div>
      <IndicatorCard indicator={indicator} variant="question" />
      <div className="answer-grid">
        <button className="btn btn-secondary" onClick={() => onAnswer("ACIDO")}>
          Acido
        </button>
        <button className="btn btn-secondary" onClick={() => onAnswer("INTERMEDIO")}>
          Intermedio
        </button>
        <button className="btn btn-secondary" onClick={() => onAnswer("BASICO")}>
          Basico
        </button>
      </div>
      <HistoryPanel history={history} />
    </div>
  );
}

function P2IndicatorScene({
  search,
  onSearch,
  indicators,
  onAsk,
  onGuess,
  history,
}: {
  search: string;
  onSearch: (value: string) => void;
  indicators: Indicator[];
  onAsk: (indicator: Indicator) => void;
  onGuess: () => void;
  history: MatchState["history"];
}) {
  return (
    <div className="scene-card">
      <div className="turn-chip active">Il tuo turno</div>
      <div className="scene-title">Scegli un indicatore</div>
      <p className="scene-subtitle">Ogni carta e una domanda.</p>

      <input
        className="input search-input"
        type="search"
        placeholder="Cerca indicatore"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />

      <div className="indicator-grid">
        {indicators.length === 0 ? (
          <div className="empty-state">Nessun indicatore trovato.</div>
        ) : (
          indicators.map((indicator) => (
            <div key={indicator.id} className="indicator-item">
              <IndicatorCard indicator={indicator} />
              <button className="btn btn-primary" onClick={() => onAsk(indicator)}>
                Chiedi
              </button>
            </div>
          ))
        )}
      </div>

      <div className="button-row">
        <button className="btn btn-secondary" onClick={onGuess}>
          Indovina pH
        </button>
      </div>

      <HistoryPanel history={history} />
    </div>
  );
}

function WaitingScene({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="scene-card">
      <div className="scene-badge">In attesa</div>
      <div className="scene-title">{title}</div>
      <p className="scene-subtitle">{subtitle}</p>
      <div className="wait-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function PhSelector({
  value,
  onChange,
  showError,
  helperText,
}: {
  value: number | null;
  onChange: (value: number) => void;
  showError: boolean;
  helperText: string;
}) {
  return (
    <div className={`ph-selector ${showError ? "has-error" : ""}`}>
      <div className="ph-grid">
        {PH_VALUES.map((ph) => (
          <button
            key={ph}
            type="button"
            className={`ph-tile ${value === ph ? "selected" : ""}`}
            onClick={() => onChange(ph)}
            aria-pressed={value === ph}
          >
            {ph}
          </button>
        ))}
      </div>
      {showError && <div className="ph-helper">{helperText}</div>}
    </div>
  );
}

function IndicatorCard({
  indicator,
  outcome,
  variant,
}: {
  indicator: Indicator;
  outcome?: string;
  variant?: "question" | "history";
}) {
  const acidColor = colorForName(indicator.acidColor);
  const baseColor = colorForName(indicator.baseColor);
  const acidIsClear = indicator.acidColor.toLowerCase() === "incolore";
  const baseIsClear = indicator.baseColor.toLowerCase() === "incolore";
  const classes = [
    "indicator-card",
    variant ? `indicator-${variant}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="indicator-header">
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
      <div className="indicator-footer">Viraggio: {indicator.low} - {indicator.high}</div>
    </div>
  );
}

function HistoryPanel({ history }: { history: MatchState["history"] }) {
  return (
    <details className="history-panel">
      <summary>Storico risposte convalidate</summary>
      {history.length === 0 ? (
        <div className="history-empty">Nessuna risposta valida ancora.</div>
      ) : (
        <div className="history-grid">
          {history.map((item, index) => (
            <IndicatorCard
              key={`${item.indicatorId}-${index}`}
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
          ))}
        </div>
      )}
    </details>
  );
}

function OverlayNotice({
  tone,
  title,
  subtitle,
  showSpinner,
  actionLabel,
  onAction,
}: {
  tone: "alert" | "warning" | "success" | "info";
  title: string;
  subtitle: string;
  showSpinner?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className={`modal-card tone-${tone}`} role="dialog" aria-live="polite">
        {showSpinner ? <div className="spinner" /> : <div className="modal-icon" />}
        <div className="modal-title">{title}</div>
        <p className="modal-subtitle">{subtitle}</p>
        {actionLabel && onAction && (
          <button className="btn btn-secondary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function ModalCard({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-live="polite">
        <div className="modal-title">{title}</div>
        {children}
        <button className="modal-close" onClick={onClose} aria-label="Chiudi">
          x
        </button>
      </div>
    </div>
  );
}

function MatchHud({
  role,
  nickname,
  opponentNickname,
  yourScore,
  opponentScore,
  questionsCount,
  opponentConnected,
  graceSeconds,
  scorePulse,
  yourPenalty,
  canGiveUp,
  onGiveUp,
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
  yourPenalty: number;
  canGiveUp: boolean;
  onGiveUp: () => void;
}) {
  return (
    <div className="match-hud">
      <div className="hud-left">
        <div className="role-badge">{role}</div>
        <div className="hud-names">
          <div className="hud-you">{nickname}</div>
          <div className="hud-vs">contro {opponentNickname}</div>
        </div>
      </div>
      <div className="hud-scores">
        <div className={`score-pill ${scorePulse.you ? "pop" : ""}`}>
          <div className="score-label">TU</div>
          <div className="score-value">{yourScore}</div>
        </div>
        <div className={`score-pill ${scorePulse.opponent ? "pop" : ""}`}>
          <div className="score-label">AVV</div>
          <div className="score-value">{opponentScore}</div>
        </div>
      </div>
      <div className="hud-meta">
        <div className="hud-meta-line">Domande: {questionsCount}</div>
        <div className="hud-meta-line">Penalita: -{yourPenalty}</div>
        <div className={`hud-connection ${opponentConnected ? "ok" : "down"}`}>
          <span className="status-dot" />
          {opponentConnected ? "Avversario connesso" : `Disconnesso ${graceSeconds ?? 0}s`}
        </div>
      </div>
      {canGiveUp && (
        <div className="hud-actions">
          <button className="btn btn-danger" onClick={onGiveUp}>
            Arrenditi
          </button>
        </div>
      )}
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
      {isWinner && <ConfettiBurst />}
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
        <div className="button-stack">
          <button className="btn btn-primary" onClick={onQuickMatch}>
            Gioca ancora
          </button>
          <button className="btn btn-secondary" onClick={onHome}>
            Torna alla home
          </button>
          <button className="btn btn-ghost" onClick={onLeaderboard}>
            Classifica
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => ({
        left: `${5 + (index * 9) % 90}%`,
        delay: `${(index % 6) * 0.12}s`,
        duration: `${2.2 + (index % 5) * 0.3}s`,
        hue: `${(index * 32) % 360}`,
      })),
    []
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={
            {
              "--x": piece.left,
              "--delay": piece.delay,
              "--duration": piece.duration,
              "--hue": piece.hue,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
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

function resolveScene({
  matchState,
  searching,
  matchFoundAt,
  isP1,
}: {
  matchState: MatchState | null;
  searching: boolean;
  matchFoundAt: number | null;
  isP1: boolean | null;
}): SceneState {
  if (matchFoundAt) {
    return { id: "match_found" };
  }

  if (!matchState) {
    if (searching) {
      return { id: "matchmaking" };
    }
    return { id: "idle" };
  }

  if (matchState.status === "waiting_p1_ph") {
    if (isP1) {
      return { id: "p1_choose_ph" };
    }
    return {
      id: "waiting",
      title: "P1 sta scegliendo il pH",
      subtitle: "Preparati, il tuo turno sta arrivando.",
    };
  }

  if (matchState.status === "in_progress") {
    if (matchState.pendingQuestion) {
      if (isP1) {
        return { id: "p1_answer_indicator" };
      }
      return {
        id: "waiting",
        title: "P1 sta rispondendo",
        subtitle: "La risposta e in arrivo.",
      };
    }

    if (isP1) {
      return {
        id: "waiting",
        title: "In attesa della domanda",
        subtitle: "P2 sta scegliendo l'indicatore.",
      };
    }

    return { id: "p2_choose_indicator" };
  }

  return { id: "idle" };
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

function createToastHandler(setToasts: Dispatch<SetStateAction<Toast[]>>) {
  return (message: string, level: "info" | "warn" | "error") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, level }].slice(-3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  };
}

function createNotificationHandler(
  pushToast: (message: string, level: "info" | "warn" | "error") => void,
  setRetryOverlay: Dispatch<SetStateAction<RetryOverlay | null>>,
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
  setToasts: Dispatch<SetStateAction<Toast[]>>;
  setRetryOverlay: Dispatch<SetStateAction<RetryOverlay | null>>;
  setSearching: Dispatch<SetStateAction<boolean>>;
}) {
  const pushToast = createToastHandler(setToasts);
  const handleNotification = createNotificationHandler(pushToast, setRetryOverlay, setSearching);

  return { pushToast, handleNotification };
}