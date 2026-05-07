-- migrate:up
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  player_id text PRIMARY KEY,
  nickname text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE indicators (
  id integer PRIMARY KEY,
  name text NOT NULL,
  acid_color text NOT NULL,
  base_color text NOT NULL,
  low numeric(4,2) NOT NULL,
  high numeric(4,2) NOT NULL
);

CREATE TABLE matches (
  id uuid PRIMARY KEY,
  p1_player_id text NOT NULL REFERENCES users(player_id),
  p2_player_id text NOT NULL REFERENCES users(player_id),
  p1_ph integer,
  status text NOT NULL,
  questions_count integer NOT NULL DEFAULT 0,
  p1_score integer NOT NULL DEFAULT 0,
  p2_score integer NOT NULL DEFAULT 0,
  p1_penalty integer NOT NULL DEFAULT 0,
  p2_penalty integer NOT NULL DEFAULT 0,
  winner_player_id text,
  ended_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE match_events (
  id bigserial PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  actor_player_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE leaderboard (
  player_id text PRIMARY KEY,
  nickname text NOT NULL,
  total_points integer NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- migrate:down
BEGIN;

DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS match_events;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS indicators;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS pgcrypto;

COMMIT;
