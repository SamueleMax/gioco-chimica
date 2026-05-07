import { useEffect, useState } from "react";
import { fetchLeaderboard, LeaderboardEntry } from "../api";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLeaderboard()
      .then((data) => setEntries(data))
      .catch(() => setError("Impossibile caricare la classifica"));
  }, []);

  return (
    <section className="page">
      <div className="card leaderboard-card">
        <div className="panel-header">
          <h2>Classifica</h2>
          <span className="pill">Gloria di laboratorio</span>
        </div>
        {error && <div className="error">{error}</div>}
        {entries.length === 0 ? (
          <p>Nessun risultato disponibile.</p>
        ) : (
          <div className="table">
            <div className="table-row table-header">
              <div>Nickname</div>
              <div>Punti totali</div>
              <div>Partite</div>
              <div>Vittorie</div>
              <div>Sconfitte</div>
            </div>
            {entries.map((entry) => (
              <div key={entry.playerId} className="table-row">
                <div>{entry.nickname}</div>
                <div>{entry.totalPoints}</div>
                <div>{entry.gamesPlayed}</div>
                <div>{entry.wins}</div>
                <div>{entry.losses}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
