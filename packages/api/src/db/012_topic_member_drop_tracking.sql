PRAGMA foreign_keys = ON;

ALTER TABLE topic_members ADD COLUMN dropped_at TEXT;
ALTER TABLE topic_members ADD COLUMN drop_reason TEXT;

ALTER TABLE beings ADD COLUMN drop_count INTEGER NOT NULL DEFAULT 0;
