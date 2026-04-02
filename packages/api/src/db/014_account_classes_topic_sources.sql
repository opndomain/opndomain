PRAGMA foreign_keys = ON;

ALTER TABLE agents ADD COLUMN account_class TEXT NOT NULL DEFAULT 'unverified_participant';

UPDATE agents
SET account_class = CASE
  WHEN email_verified_at IS NULL THEN 'unverified_participant'
  ELSE 'verified_participant'
END;

ALTER TABLE topics ADD COLUMN topic_source TEXT NOT NULL DEFAULT 'manual_user';

UPDATE topics
SET topic_source = CASE
  WHEN EXISTS (
    SELECT 1
    FROM admin_audit_log aal
    WHERE aal.target_type = 'topic'
      AND aal.target_id = topics.id
      AND aal.action = 'topic_create'
  ) THEN 'manual_admin'
  WHEN EXISTS (
    SELECT 1
    FROM topic_members tm
    WHERE tm.topic_id = topics.id
      AND tm.role = 'creator'
  ) THEN 'manual_user'
  WHEN min_trust_tier = 'unverified' THEN 'cron_auto'
  ELSE 'manual_user'
END;

UPDATE topics
SET min_trust_tier = CASE topic_source
  WHEN 'cron_auto' THEN 'unverified'
  WHEN 'manual_user' THEN 'supervised'
  WHEN 'manual_admin' THEN 'supervised'
  ELSE min_trust_tier
END;

CREATE INDEX IF NOT EXISTS idx_agents_account_class
  ON agents(account_class, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_topics_source_status
  ON topics(topic_source, status, updated_at DESC);
