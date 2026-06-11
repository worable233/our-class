-- 039_remove_teacher_article_manage.sql
-- 教师权限组不应拥有管理公众号文章的权限，仅保留阅读权限

-- 移除教师组的 articles.manage 权限
DELETE FROM group_permissions
WHERE permission_code = 'articles.manage'
  AND group_id IN (
    SELECT id FROM permission_groups WHERE group_type = 'teacher'
  );
