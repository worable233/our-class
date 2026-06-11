-- 030_article_permission.sql
-- 添加公众号文章管理权限

INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('articles.manage', '管理公众号文章（提取/查看/删除/刷新）', '内容管理');

INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'articles.manage' FROM permission_groups WHERE group_type = 'admin';
