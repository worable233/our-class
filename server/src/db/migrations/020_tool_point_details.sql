-- 020_tool_point_details.sql
-- 为已有权限组添加积分明细查询工具权限

-- 教师组
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_point_details' FROM permission_groups WHERE name = '教师';

-- 学生组
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_point_details' FROM permission_groups WHERE name = '学生';
