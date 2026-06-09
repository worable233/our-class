-- 将旧权限 code 映射到新权限 code
-- 这些只在旧数据库中存在，新数据库不会命中
DELETE FROM group_permissions WHERE permission_code IN (
  'students.read', 'students.delete',
  'scores.read', 'scores.delete',
  'assignments.read', 'assignments.grade',
  'chat.skills', 'classes.read'
);
