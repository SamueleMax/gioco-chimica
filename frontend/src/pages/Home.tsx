import { useState } from "react";
import { useNavigate } from "react-router-dom";

const QUICK_MATCH_KEY = "quickMatchPending";

function getOrCreatePlayerId() {
  const existing = localStorage.getItem("playerId");
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem("playerId", created);
  return created;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(localStorage.getItem("nickname") || "");
  const [error, setError] = useState("");

  const handleQuickMatch = () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("Inserisci un nickname valido");
      return;
    }
    setError("");
    localStorage.setItem("nickname", trimmed);

    const playerId = getOrCreatePlayerId();
    sessionStorage.setItem(QUICK_MATCH_KEY, "1");
    navigate("/match");
  };

  return (
    <section className="page page-home">
      <div className="home-hero">
        <div className="home-title">Missione pH</div>
        <p className="home-subtitle">
          Duello a due tra indicatori, strategia e penalita. Ogni mossa conta.
        </p>
        <div className="home-badges">
          <span className="badge">2 giocatori</span>
          <span className="badge">Tempo reale</span>
          <span className="badge">Laboratorio arcade</span>
        </div>
      </div>

      <div className="card home-card">
        <label className="field">
          Nickname
          <input
            className="input"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Il tuo nome"
          />
        </label>
        {error && <div className="inline-alert error">{error}</div>}
        <div className="button-stack">
          <button className="btn btn-primary btn-large" onClick={handleQuickMatch}>
            Gioca ora
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/classifica")}>
            Classifica
          </button>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>
            Admin
          </button>
        </div>
      </div>

      <div className="home-steps">
        <div className="card home-step">
          <div className="step-title">1. Trova un avversario</div>
          <p>Avvia la ricerca rapida e preparati al duello chimico.</p>
        </div>
        <div className="card home-step">
          <div className="step-title">2. Gioca il tuo turno</div>
          <p>P1 sceglie il pH, P2 interroga gli indicatori.</p>
        </div>
        <div className="card home-step">
          <div className="step-title">3. Vinci con strategia</div>
          <p>Rispondi bene e riduci le penalita per superare l'avversario.</p>
        </div>
      </div>
    </section>
  );
}