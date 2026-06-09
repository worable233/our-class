CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  max_rounds INTEGER NOT NULL DEFAULT 50,
  context_window INTEGER NOT NULL DEFAULT 20,
  max_agent_loops INTEGER NOT NULL DEFAULT 5,
  rapid_gap_ms INTEGER NOT NULL DEFAULT 1500,
  rapid_delay_ms INTEGER NOT NULL DEFAULT 2000,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rate_limits (id, max_rounds, context_window, max_agent_loops, rapid_gap_ms, rapid_delay_ms)
VALUES (1, 50, 20, 5, 1500, 2000);
