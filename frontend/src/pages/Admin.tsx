import { useState } from "react";
import { fetchSettings, resetLeaderboard, updateP2MaxScore } from "../api";

export default function AdminPage() {
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
    <section className="page">
      <div className="card">
        <div className="panel-header">
          <h2>Admin</h2>
          <span className="pill">Controlli partita</span>
        </div>
        {!authed ? (
          <>
            <label className="field">
              PIN admin
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="PIN"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" onClick={handleLogin}>
              Entra
            </button>
          </>
        ) : (
          <>
            <label className="field">
              Punteggio massimo P2
              <input
                type="number"
                min={1}
                max={20}
                value={p2MaxScore}
                onChange={(event) => setP2MaxScore(Number(event.target.value))}
              />
            </label>
            <button className="secondary" onClick={handleSave}>
              Salva
            </button>
            <div className="divider" />
            <button className="danger" onClick={handleReset}>
              Reset classifica
            </button>
            {status && <div className="info">{status}</div>}
          </>
        )}
      </div>
    </section>
  );
}
