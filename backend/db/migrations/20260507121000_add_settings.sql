-- migrate:up
BEGIN;

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('p2MaxScore', '6')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- migrate:down
BEGIN;

DROP TABLE IF EXISTS settings;

COMMIT;
