-- 028_storage.sql
-- 网盘系统：用户存储空间管理 + 权限组配额

-- 用户存储用量表（每人一条）
CREATE TABLE IF NOT EXISTS user_storage (
  user_id INTEGER PRIMARY KEY,
  storage_limit INTEGER NOT NULL DEFAULT 104857600, -- 100MB (bytes)
  storage_used INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 权限组存储配额表（仅父权限组可设置）
CREATE TABLE IF NOT EXISTS group_storage_quota (
  group_id INTEGER PRIMARY KEY,
  storage_limit INTEGER NOT NULL DEFAULT 104857600, -- 100MB (bytes)
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES permission_groups(id) ON DELETE CASCADE
);

-- 为新用户自动创建存储记录
CREATE TRIGGER IF NOT EXISTS trg_user_storage_insert
AFTER INSERT ON users
BEGIN
  INSERT OR IGNORE INTO user_storage (user_id, storage_limit)
  VALUES (
    NEW.id,
    COALESCE(
      (SELECT gsq.storage_limit FROM group_storage_quota gsq
       JOIN users u ON u.group_id = gsq.group_id WHERE u.id = NEW.id),
      104857600
    )
  );
END;

-- 为已有用户补齐存储记录
INSERT OR IGNORE INTO user_storage (user_id)
SELECT id FROM users;

-- 默认权限组配额
INSERT OR IGNORE INTO group_storage_quota (group_id, storage_limit)
SELECT id, 104857600 FROM permission_groups WHERE parent_id IS NULL;
