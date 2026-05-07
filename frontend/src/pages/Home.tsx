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
    <section className="page">
      <div className="hero">
        <div>
          <h1>Missione pH!</h1>
          <p>Duello a due con indicatori, strategia e penalita. Pronti a giocare?</p>
          <div className="hero-badges">
            <span>2 giocatori</span>
            <span>Tempo reale</span>
            <span>Classe-friendly</span>
          </div>
        </div>
        <div className="card hero-card">
          <label className="field">
            Nickname
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Il tuo nome"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="button-row large">
            <button className="primary" onClick={handleQuickMatch}>
              Gioca ora
            </button>
            <button className="ghost" onClick={() => navigate("/classifica")}>Classifica</button>
            <button className="ghost" onClick={() => navigate("/admin")}>Admin</button>
          </div>
        </div>
      </div>
    </section>
  );
}
