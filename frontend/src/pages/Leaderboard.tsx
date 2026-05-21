import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLeaderboard, LeaderboardEntry } from "../api";

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLeaderboard()
      .then((data) => setEntries(data))
      .catch(() => setError("Impossibile caricare la classifica"));
  }, []);

  return (
    <section className="page page-leaderboard">
      <div className="page-header">
        <div className="page-title">Classifica</div>
        <p>La gloria di laboratorio, aggiornata in tempo reale.</p>
      </div>

      {error && <div className="inline-alert error">{error}</div>}

      {entries.length === 0 ? (
        <div className="card empty-card">
          <h3>Nessun risultato disponibile</h3>
          <p>La classifica si riempirà con le prime partite.</p>
        </div>
      ) : (
        <div className="leaderboard-list">
          {entries.map((entry, index) => {
            const isTop = index < 3;
            return (
              <div key={entry.playerId} className={`card leaderboard-item ${isTop ? "top" : ""}`}>
                <div className="rank-badge">#{index + 1}</div>
                <div className="leaderboard-main">
                  <div className="leaderboard-name">{entry.nickname}</div>
                  <div className="leaderboard-meta">
                    <span>Punti: {entry.totalPoints}</span>
                    <span>Partite: {entry.gamesPlayed}</span>
                    <span>Vittorie: {entry.wins}</span>
                    <span>Sconfitte: {entry.losses}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Torna alla home</button>
      </div>
    </section>
  );
}