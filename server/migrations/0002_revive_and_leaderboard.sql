ALTER TABLE pending ADD COLUMN revives INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS leaderboard (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  best_depth INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_depth ON leaderboard(best_depth DESC, best_score DESC);
