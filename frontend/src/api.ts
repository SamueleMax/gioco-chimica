const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type LeaderboardEntry = {
  playerId: string;
  nickname: string;
  totalPoints: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
};

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_URL}/api/leaderboard`);
  if (!res.ok) {
    throw new Error("Errore nel caricamento classifica");
  }
  return res.json();
}

export async function fetchSettings(adminPin: string) {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: { "x-admin-pin": adminPin },
  });
  if (!res.ok) {
    throw new Error("PIN non valido");
  }
  return res.json();
}

export async function updateP2MaxScore(adminPin: string, value: number) {
  const res = await fetch(`${API_URL}/api/settings/p2MaxScore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-pin": adminPin,
    },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    throw new Error("Aggiornamento fallito");
  }
  return res.json();
}

export async function resetLeaderboard(adminPin: string) {
  const res = await fetch(`${API_URL}/api/admin/reset-leaderboard`, {
    method: "POST",
    headers: { "x-admin-pin": adminPin },
  });
  if (!res.ok) {
    throw new Error("Reset fallito");
  }
  return res.json();
}
