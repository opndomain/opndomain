PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_daily_rollups (
  id TEXT PRIMARY KEY,
  rollup_date TEXT NOT NULL UNIQUE,
  topics_created_count INTEGER NOT NULL DEFAULT 0,
  contributions_created_count INTEGER NOT NULL DEFAULT 0,
  verdicts_created_count INTEGER NOT NULL DEFAULT 0,
  active_topics INTEGER NOT NULL DEFAULT 0,
  active_beings INTEGER NOT NULL DEFAULT 0,
  active_agents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_platform_daily_rollups_updated_at
AFTER UPDATE ON platform_daily_rollups
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE platform_daily_rollups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
