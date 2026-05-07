import { Pool } from "pg";
import { Indicator } from "../../shared/types";

type LeaderboardRow = {
  player_id: string;
  nickname: string;
  total_points: number;
  games_played: number;
  wins: number;
  losses: number;
};

type IndicatorRow = {
  id: number;
  name: string;
  acid_color: string;
  base_color: string;
  low: number | string;
  high: number | string;
};

type MatchRecordUpdate = {
  id: string;
  status: string;
  p1Ph: number | null;
  questionsCount: number;
  p1Penalty: number;
  p2Penalty: number;
  p1Score: number;
  p2Score: number;
};

type MatchEndUpdate = MatchRecordUpdate & {
  winnerPlayerId: string | null;
  endedReason: string;
  endedAt: Date;
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function upsertUser(playerId: string, nickname: string) {
  await pool.query(
    "INSERT INTO users (player_id, nickname, created_at, last_seen_at) VALUES ($1, $2, now(), now()) ON CONFLICT (player_id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = now()",
    [playerId, nickname]
  );
}

export async function getIndicators(): Promise<Indicator[]> {
  const { rows } = await pool.query<IndicatorRow>(
    "SELECT id, name, acid_color, base_color, low, high FROM indicators ORDER BY id ASC"
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    acidColor: row.acid_color,
    baseColor: row.base_color,
    low: Number(row.low),
    high: Number(row.high),
  }));
}

export async function getP2MaxScore(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT value FROM settings WHERE key = 'p2MaxScore'"
  );
  const value = rows[0]?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 6;
}

export async function setP2MaxScore(value: number) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('p2MaxScore', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [String(value)]
  );
}

export async function getLeaderboard() {
  const { rows } = await pool.query<LeaderboardRow>(
    "SELECT player_id, nickname, total_points, games_played, wins, losses FROM leaderboard ORDER BY total_points DESC, games_played DESC"
  );

  return rows.map((row) => ({
    playerId: row.player_id,
    nickname: row.nickname,
    totalPoints: Number(row.total_points),
    gamesPlayed: Number(row.games_played),
    wins: Number(row.wins),
    losses: Number(row.losses),
  }));
}

export async function resetLeaderboard() {
  await pool.query("TRUNCATE leaderboard");
}

export async function createMatchRecord(matchId: string, p1PlayerId: string, p2PlayerId: string) {
  await pool.query(
    "INSERT INTO matches (id, p1_player_id, p2_player_id, status) VALUES ($1, $2, $3, $4)",
    [matchId, p1PlayerId, p2PlayerId, "waiting_p1_ph"]
  );
}

export async function updateMatchProgress(update: MatchRecordUpdate) {
  await pool.query(
    "UPDATE matches SET status = $2, p1_ph = $3, questions_count = $4, p1_penalty = $5, p2_penalty = $6, p1_score = $7, p2_score = $8 WHERE id = $1",
    [
      update.id,
      update.status,
      update.p1Ph,
      update.questionsCount,
      update.p1Penalty,
      update.p2Penalty,
      update.p1Score,
      update.p2Score,
    ]
  );
}

export async function endMatchRecord(update: MatchEndUpdate) {
  await pool.query(
    "UPDATE matches SET status = $2, p1_ph = $3, questions_count = $4, p1_penalty = $5, p2_penalty = $6, p1_score = $7, p2_score = $8, winner_player_id = $9, ended_reason = $10, ended_at = $11 WHERE id = $1",
    [
      update.id,
      update.status,
      update.p1Ph,
      update.questionsCount,
      update.p1Penalty,
      update.p2Penalty,
      update.p1Score,
      update.p2Score,
      update.winnerPlayerId,
      update.endedReason,
      update.endedAt,
    ]
  );
}

export async function insertMatchEvent(
  matchId: string,
  type: string,
  actorPlayerId: string | null,
  payload: Record<string, unknown>
) {
  await pool.query(
    "INSERT INTO match_events (match_id, type, actor_player_id, payload) VALUES ($1, $2, $3, $4)",
    [matchId, type, actorPlayerId, payload]
  );
}

export async function updateLeaderboardForMatch(params: {
  p1PlayerId: string;
  p2PlayerId: string;
  p1Nickname: string;
  p2Nickname: string;
  p1Score: number;
  p2Score: number;
  winnerPlayerId: string | null;
}) {
  if (!params.winnerPlayerId) {
    return;
  }

  await pool.query("BEGIN");
  try {
    await upsertLeaderboardRow({
      playerId: params.p1PlayerId,
      nickname: params.p1Nickname,
      totalPoints: params.p1Score,
      wins: params.winnerPlayerId === params.p1PlayerId ? 1 : 0,
      losses: params.winnerPlayerId === params.p1PlayerId ? 0 : 1,
    });

    await upsertLeaderboardRow({
      playerId: params.p2PlayerId,
      nickname: params.p2Nickname,
      totalPoints: params.p2Score,
      wins: params.winnerPlayerId === params.p2PlayerId ? 1 : 0,
      losses: params.winnerPlayerId === params.p2PlayerId ? 0 : 1,
    });

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function upsertLeaderboardRow(params: {
  playerId: string;
  nickname: string;
  totalPoints: number;
  wins: number;
  losses: number;
}) {
  await pool.query(
    "INSERT INTO leaderboard (player_id, nickname, total_points, games_played, wins, losses, updated_at) VALUES ($1, $2, $3, 1, $4, $5, now()) ON CONFLICT (player_id) DO UPDATE SET nickname = EXCLUDED.nickname, total_points = leaderboard.total_points + EXCLUDED.total_points, games_played = leaderboard.games_played + 1, wins = leaderboard.wins + EXCLUDED.wins, losses = leaderboard.losses + EXCLUDED.losses, updated_at = now()",
    [
      params.playerId,
      params.nickname,
      params.totalPoints,
      params.wins,
      params.losses,
    ]
  );
}
