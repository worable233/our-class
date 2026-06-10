-- 035_link_course_to_assignments.sql
-- 将作业与课程关联

ALTER TABLE assignments ADD COLUMN course_id INTEGER REFERENCES courses(id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
