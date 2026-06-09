-- 019_classes_view_all.sql
-- 为教师组添加"查看全部班级"权限

INSERT OR IGNORE INTO group_permissions (group_id, permission_code)
SELECT id, 'classes.view_all' FROM permission_groups WHERE name = '教师';
