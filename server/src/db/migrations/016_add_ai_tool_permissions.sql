-- 016_add_ai_tool_permissions.sql
-- 为已有权限组添加 AI 工具权限（chat.skills 和 tool.*）
-- 仅当数据库已有权限组（非全新安装）时生效

-- 教师组：chat.skills + 全部 AI 工具权限
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'chat.skills' FROM permission_groups WHERE name = '教师';

INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.list_students' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_student_points' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.add_points' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_score_rankings' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.list_assignments' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_submissions' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_weather' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.web_search' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.random_pick' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_current_time' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_class_list' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.view_file' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.create_student' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.update_student' FROM permission_groups WHERE name = '教师';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.delete_student' FROM permission_groups WHERE name = '教师';

-- 学生组：基础查询工具权限（不含 add_points / create/update/delete / web_search / random_pick / get_weather）
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.list_students' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_student_points' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_score_rankings' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.list_assignments' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_submissions' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_current_time' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.get_class_list' FROM permission_groups WHERE name = '学生';
INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'tool.view_file' FROM permission_groups WHERE name = '学生';
