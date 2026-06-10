-- 038_backfill_courses.sql
-- 为已有作业和成绩创建对应的课程记录

-- 从 assignments 表中提取所有不重复的课程名，创建对应的 courses 记录
INSERT OR IGNORE INTO courses (name, description, class, created_by)
SELECT DISTINCT a.course, a.course, '', 1
FROM assignments a
WHERE a.course IS NOT NULL AND a.course != ''
  AND a.course NOT IN (SELECT name FROM courses);

-- 把新建的 course_id 关联回 assignments
UPDATE assignments SET course_id = (
  SELECT c.id FROM courses c WHERE c.name = assignments.course LIMIT 1
) WHERE course_id IS NULL AND course IS NOT NULL AND course != '';

-- 从 scores 表中也提取课程名
INSERT OR IGNORE INTO courses (name, description, class, created_by)
SELECT DISTINCT s.course, s.course, '', 1
FROM scores s
WHERE s.course IS NOT NULL AND s.course != ''
  AND s.course NOT IN (SELECT name FROM courses);
