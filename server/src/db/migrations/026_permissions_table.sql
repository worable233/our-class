-- 026_permissions_table.sql
-- 中央权限注册中心：将权限 code 定义从后端硬编码迁移到数据库
-- 配合 group_type 替代基于 group_name 匹配的角色推导

-- ── 1. 中央权限注册表 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT ''
);

-- 写入所有权限定义（单⼀数据源，后端不再硬编码）
INSERT OR IGNORE INTO permissions (code, label, category) VALUES
  ('students.write', '管理学生（添加/编辑/删除，含查看）', '学生管理'),
  ('points.read', '查看积分', '积分管理'),
  ('points.write', '加减积分', '积分管理'),
  ('scores.write', '管理成绩（录入/修改/删除，含查看）', '成绩管理'),
  ('assignments.write', '管理作业（布置/批改，含查看）', '作业管理'),
  ('assignments.submit', '提交作业', '作业管理'),
  ('chat.access', '使用AI助手', 'AI助手'),
  ('chat.config', '配置AI（含Skill管理）', 'AI助手'),
  ('chat.unlimited', '不受调用限制', 'AI助手'),
  ('tool.student.read', '查询学生信息', 'AI 工具'),
  ('tool.student.write', '管理学生账号（创建/修改/删除）', 'AI 工具'),
  ('tool.score.read', '查询成绩积分', 'AI 工具'),
  ('tool.score.write', '加减积分操作', 'AI 工具'),
  ('tool.assignment', '查看作业提交情况', 'AI 工具'),
  ('tool.utility', '通用工具（天气/搜索/抽人/文件等）', 'AI 工具'),
  ('roles.manage', '管理权限组', '系统设置'),
  ('audit_logs.read', '查看操作日志', '系统设置'),
  ('classes.view_all', '查看全部班级', '系统设置');

-- ── 2. 权限组类型字段 ──────────────────────────────────────────────

ALTER TABLE permission_groups ADD COLUMN group_type TEXT NOT NULL DEFAULT 'custom';

-- 迁移已有数据
UPDATE permission_groups SET group_type = 'teacher' WHERE name = '教师';
UPDATE permission_groups SET group_type = 'student' WHERE name = '学生';
