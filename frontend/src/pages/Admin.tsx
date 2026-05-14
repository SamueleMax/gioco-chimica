import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSettings, resetLeaderboard, updateP2MaxScore } from "../api";

function clampScore(value: number) {
  return Math.min(20, Math.max(1, value));
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [p2MaxScore, setP2MaxScore] = useState(6);
  const [status, setStatus] = useState("");

  const handleLogin = async () => {
    setError("");
    try {
      const data = await fetchSettings(pin);
      setP2MaxScore(data.p2MaxScore);
      setAuthed(true);
    } catch (err) {
      setError("PIN non valido");
    }
  };

  const handleSave = async () => {
    setStatus("");
    try {
      await updateP2MaxScore(pin, p2MaxScore);
      setStatus("Impostazione aggiornata");
    } catch (err) {
      setStatus("Aggiornamento fallito");
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Confermi il reset della classifica?")) {
      return;
    }
    setStatus("");
    try {
      await resetLeaderboard(pin);
      setStatus("Classifica azzerata");
    } catch (err) {
      setStatus("Reset fallito");
    }
  };

  return (
    <section className="page page-admin">
      <div className="page-header">
        <div className="page-title">Admin</div>
        <p>Controlli per la partita e la classifica.</p>
      </div>

      <div className="card admin-card">
        {!authed ? (
          <>
            <label className="field">
              PIN admin
              <input
                className="input"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="PIN"
              />
            </label>
            {error && <div className="inline-alert error">{error}</div>}
            <button className="btn btn-primary" onClick={handleLogin}>
              Entra
            </button>
          </>
        ) : (
          <>
            <div className="admin-section">
              <div className="field-label">Punteggio massimo P2</div>
              <div className="stepper">
                <button
                  className="stepper-btn"
                  onClick={() => setP2MaxScore((prev) => clampScore(prev - 1))}
                  aria-label="Riduci punteggio massimo"
                >
                  -
                </button>
                <div className="stepper-value">{p2MaxScore}</div>
                <button
                  className="stepper-btn"
                  onClick={() => setP2MaxScore((prev) => clampScore(prev + 1))}
                  aria-label="Aumenta punteggio massimo"
                >
                  +
                </button>
              </div>
              <button className="btn btn-secondary" onClick={handleSave}>
                Salva
              </button>
            </div>
            <div className="divider" />
            <button className="btn btn-danger" onClick={handleReset}>
              Reset classifica
            </button>
            {status && <div className="inline-alert info">{status}</div>}
          </>
        )}
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Torna alla home</button>
      </div>
    </section>
  );
}