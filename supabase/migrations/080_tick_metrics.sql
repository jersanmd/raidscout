-- tick_metrics: persist cron tick performance for historical analysis
CREATE TABLE IF NOT EXISTS tick_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  duration_ms int NOT NULL,
  servers_checked int NOT NULL DEFAULT 0,
  bosses_checked int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS tick_metrics_created_at_idx ON tick_metrics(created_at DESC);
