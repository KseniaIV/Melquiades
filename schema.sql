-- Melquíades schema
-- Run once: psql -U postgres -p 5433 -d melquiades -f schema.sql

CREATE TABLE IF NOT EXISTS snippets (
  id            SERIAL       PRIMARY KEY,
  name          TEXT         NOT NULL UNIQUE,
  language      VARCHAR(50)  NOT NULL DEFAULT 'js',
  -- language: js|css|html|markdown|json|yaml|bash|sql|go|python|dockerfile|kubernetes|prompt
  body          TEXT         NOT NULL DEFAULT '',
  version       INTEGER      NOT NULL DEFAULT 1,
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft',
  -- status: draft | ready | archived
  capabilities  TEXT[]       NOT NULL DEFAULT '{}',
  -- capabilities: exec:browser | exec:system | exec:confirm | render:only
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id    SERIAL PRIMARY KEY,
  name  TEXT   NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS snippet_tags (
  snippet_id  INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (snippet_id, tag_id)
);

CREATE TABLE IF NOT EXISTS snippet_dependencies (
  snippet_id  INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  depends_on  INTEGER NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  PRIMARY KEY (snippet_id, depends_on)
);

-- auto-update updated_at on every write
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS snippets_touch ON snippets;
CREATE TRIGGER snippets_touch
  BEFORE UPDATE ON snippets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
