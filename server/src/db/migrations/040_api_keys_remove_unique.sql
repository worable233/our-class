-- Remove UNIQUE(user_id, provider) to allow multiple models per provider
CREATE TABLE api_keys_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  api_url TEXT DEFAULT '',
  search_api_url TEXT DEFAULT '',
  search_api_key TEXT DEFAULT '',
  city TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO api_keys_new SELECT * FROM api_keys;
DROP TABLE api_keys;
ALTER TABLE api_keys_new RENAME TO api_keys;
