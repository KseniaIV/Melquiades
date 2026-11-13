-- Melquíades project management schema (idempotent — safe to re-run).
-- Requires sql/schema.sql first (reuses touch_updated_at()).
--   psql "$DATABASE_URL" -f sql/schema.sql -f sql/schema-pm.sql
--
-- Tables: projects, tasks, task_dependencies, experiments, notes, activity.
-- Every insert/update/delete on the four main tables is recorded in `activity`
-- by trigger, including edits made directly in psql. Writers tag their changes
-- with an actor via:  SELECT set_config('melquiades.actor', 'assistant', true);

CREATE TABLE IF NOT EXISTS projects (
  id           SERIAL       PRIMARY KEY,
  slug         TEXT         NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name         TEXT         NOT NULL CHECK (name <> ''),
  description  TEXT         NOT NULL DEFAULT '',
  status       TEXT         NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'paused', 'done', 'archived')),
  repo_url     TEXT         NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL       PRIMARY KEY,
  project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT         NOT NULL CHECK (title <> ''),
  description   TEXT         NOT NULL DEFAULT '',
  status        TEXT         NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'doing', 'blocked', 'done', 'cancelled')),
  priority      SMALLINT     NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 3),
  -- priority: 0 = urgent, 1 = high, 2 = normal, 3 = low
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_project_status ON tasks (project_id, status);

-- "task_id is blocked by depends_on"
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK (task_id <> depends_on)
);

CREATE TABLE IF NOT EXISTS experiments (
  id           SERIAL       PRIMARY KEY,
  project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code         TEXT         NOT NULL DEFAULT '',   -- short label, e.g. X1; unique per project when set
  title        TEXT         NOT NULL CHECK (title <> ''),
  hypothesis   TEXT         NOT NULL DEFAULT '',
  status       TEXT         NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned', 'running', 'verified', 'failed', 'partial')),
  evidence     TEXT         NOT NULL DEFAULT '',
  next_step    TEXT         NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS experiments_project_code
  ON experiments (project_id, code) WHERE code <> '';

-- A note always belongs to a project and may also hang off a task or experiment.
CREATE TABLE IF NOT EXISTS notes (
  id             SERIAL       PRIMARY KEY,
  project_id     INTEGER      NOT NULL REFERENCES projects(id)    ON DELETE CASCADE,
  task_id        INTEGER               REFERENCES tasks(id)       ON DELETE CASCADE,
  experiment_id  INTEGER               REFERENCES experiments(id) ON DELETE CASCADE,
  body           TEXT         NOT NULL CHECK (body <> ''),   -- markdown
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_project ON notes (project_id);

-- Append-only history. Written only by the trigger below.
CREATE TABLE IF NOT EXISTS activity (
  id           BIGSERIAL    PRIMARY KEY,
  entity_type  TEXT         NOT NULL,   -- table name: projects | tasks | experiments | notes
  entity_id    INTEGER      NOT NULL,
  project_id   INTEGER,                 -- denormalised for "what happened in project X"
  action       TEXT         NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor        TEXT         NOT NULL DEFAULT 'unknown',
  changes      JSONB        NOT NULL DEFAULT '{}',
  -- create/delete: full row; update: {"field": [old, new], ...}
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_entity  ON activity (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_project ON activity (project_id, created_at DESC);

-- SECURITY DEFINER so the application role can be denied direct writes to
-- `activity` while its changes are still recorded.
CREATE OR REPLACE FUNCTION record_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_j   JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  new_j   JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  row_j   JSONB := COALESCE(new_j, old_j);
  diff    JSONB := '{}';
  k       TEXT;
  who     TEXT  := COALESCE(NULLIF(current_setting('melquiades.actor', true), ''), 'unknown');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k <> 'updated_at' AND new_j -> k IS DISTINCT FROM old_j -> k THEN
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      END IF;
    END LOOP;
    IF diff = '{}' THEN RETURN NULL; END IF;   -- nothing actually changed
  END IF;

  INSERT INTO activity (entity_type, entity_id, project_id, action, actor, changes)
  VALUES (
    TG_TABLE_NAME,
    (row_j ->> 'id')::int,
    CASE WHEN TG_TABLE_NAME = 'projects' THEN (row_j ->> 'id')::int
         ELSE (row_j ->> 'project_id')::int END,
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    left(who, 64),
    CASE TG_OP WHEN 'UPDATE' THEN diff ELSE row_j END
  );
  RETURN NULL;
END;
$$;

-- Keep tasks.completed_at in step with status.
CREATE OR REPLACE FUNCTION task_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_completed ON tasks;
CREATE TRIGGER tasks_completed BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION task_completed_at();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'tasks', 'experiments', 'notes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_touch ON %1$s', t);
    EXECUTE format('CREATE TRIGGER %1$s_touch BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_activity ON %1$s', t);
    EXECUTE format('CREATE TRIGGER %1$s_activity AFTER INSERT OR UPDATE OR DELETE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION record_activity()', t);
  END LOOP;
END;
$$;
