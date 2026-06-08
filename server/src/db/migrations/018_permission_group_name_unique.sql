-- 018_permission_group_name_unique.sql
-- 权限组名称唯一约束

-- 先清理可能的重复名称（保留创建时间最早的那个）
DELETE FROM permission_groups WHERE id NOT IN (
  SELECT MIN(id) FROM permission_groups GROUP BY name
);

-- 添加唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_groups_name ON permission_groups(name);
