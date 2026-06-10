-- 037_article_read_permission.sql
-- 添加公众号文章阅读权限（学生可读，不可管理）

INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('articles.read', '阅读公众号文章', '内容管理');

-- 授予教师组
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'articles.read' FROM permission_groups WHERE group_type = 'teacher'
UNION
SELECT id, 'articles.read' FROM permission_groups WHERE name = '教师';

-- 授予学生组
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'articles.read' FROM permission_groups WHERE group_type = 'student'
UNION
SELECT id, 'articles.read' FROM permission_groups WHERE name = '学生';
