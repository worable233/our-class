-- 014_student_fields.sql
-- Add student_no and nickname columns to users table

ALTER TABLE users ADD COLUMN student_no TEXT;
ALTER TABLE users ADD COLUMN nickname TEXT;

CREATE INDEX idx_users_student_no ON users(student_no) WHERE student_no IS NOT NULL;

-- Set default student_no for existing student accounts
UPDATE users SET student_no = 'S' || printf('%04d', id) WHERE role = 'student' AND student_no IS NULL;
