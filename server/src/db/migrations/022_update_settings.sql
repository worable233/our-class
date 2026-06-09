CREATE TABLE IF NOT EXISTS update_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auto_check_interval INTEGER NOT NULL DEFAULT 3600,
  ping_timeout INTEGER NOT NULL DEFAULT 3,
  last_check_time TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO update_settings (id, auto_check_interval, ping_timeout) VALUES (1, 3600, 3);
