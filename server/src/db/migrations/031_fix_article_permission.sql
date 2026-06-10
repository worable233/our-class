-- 031_fix_article_permission.sql
-- 稳健的公众号文章管理权限分配（兼容旧数据库结构）

-- 确保权限已注册（幂等）
INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('articles.manage', '管理公众号文章（提取/查看/删除/刷新）', '内容管理');

-- 方式 1：按 group_type = 'teacher'（新结构）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'articles.manage' FROM permission_groups WHERE group_type = 'teacher';

-- 方式 2：按名称 = '教师'（旧结构 fallback）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'articles.manage' FROM permission_groups WHERE name = '教师';

-- 方式 3：按拥有 roles.manage 权限（自定义教师组）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT DISTINCT gp.group_id, 'articles.manage'
FROM group_permissions gp
WHERE gp.permission_code = 'roles.manage'
  AND NOT EXISTS (
    SELECT 1 FROM group_permissions gp2
    WHERE gp2.group_id = gp.group_id AND gp2.permission_code = 'articles.manage'
  );
