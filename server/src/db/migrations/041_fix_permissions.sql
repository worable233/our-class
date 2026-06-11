-- 补全权限注册表中缺失的权限码
INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('scores.read', '查看成绩', '成绩管理'),
  ('articles.manage', '管理公众号文章', '文章管理'),
  ('articles.read', '查看公众号文章', '文章管理'),
  ('tool.article', '公众号文章搜索', 'AI 工具');

-- 给所有权限组授予 scores.read
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT pg.id, 'scores.read'
FROM permission_groups pg
WHERE pg.group_type IN ('admin', 'teacher', 'student');
