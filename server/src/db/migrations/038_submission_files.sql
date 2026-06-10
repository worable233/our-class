-- 038_submission_files.sql
-- 作业提交附件：存储文件路径等元信息

ALTER TABLE submissions ADD COLUMN files TEXT DEFAULT '[]';
