-- 032_article_tool_permission.sql
-- 添加公众号文章搜索 AI 工具权限

-- 注册权限
INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('tool.article', '搜索公众号文章', 'AI 工具');

-- 授权给教师组（三种方式兼容新旧数据库结构）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.article' FROM permission_groups WHERE group_type = 'teacher';

INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.article' FROM permission_groups WHERE name = '教师';

INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT DISTINCT gp.group_id, 'tool.article'
FROM group_permissions gp WHERE gp.permission_code = 'roles.manage'
  AND NOT EXISTS (
    SELECT 1 FROM group_permissions gp2
    WHERE gp2.group_id = gp.group_id AND gp2.permission_code = 'tool.article'
  );

-- tool_configs 默认值由 chat-settings.ts 的 DEFAULT_TOOLS 提供，无需在此插入
