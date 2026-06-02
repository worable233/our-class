-- Permission groups table
CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Group-permission mappings
CREATE TABLE IF NOT EXISTS group_permissions (
  group_id INTEGER NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (group_id, permission_code),
  FOREIGN KEY (group_id) REFERENCES permission_groups(id) ON DELETE CASCADE
);

-- Add group_id to users table (nullable for migration, will be populated by seed)
ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES permission_groups(id);
