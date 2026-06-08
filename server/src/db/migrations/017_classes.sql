-- 017_classes.sql
-- 独立班级表，支持班级管理 CRUD

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 从现有学生数据中导入已有的班级名称
INSERT OR IGNORE INTO classes (name)
SELECT DISTINCT class FROM users WHERE role = 'student' AND class != '';
