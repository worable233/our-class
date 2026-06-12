-- 042_assignments_read_permission.sql
-- 将"查看作业"从 assignments.write 中拆分出来，创建独立的 assignments.read 权限
-- 同时为学生组补充缺失的 tool.utility、tool.article 权限

-- 注册新权限
INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('assignments.read', '查看作业列表', '作业管理');

-- 更新 assignments.write 的标签（不再包含"含查看"）
UPDATE permissions SET label = '管理作业（布置/批改）' WHERE code = 'assignments.write';

-- 为所有身份组添加 assignments.read（admin 已有 assignments.write，但补上更规范）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'assignments.read' FROM permission_groups WHERE group_type IN ('admin', 'teacher', 'student');

-- 为学生组补充 tool.utility 和 tool.article
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.utility' FROM permission_groups WHERE group_type = 'student';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.article' FROM permission_groups WHERE group_type = 'student';
