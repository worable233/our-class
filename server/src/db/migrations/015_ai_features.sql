-- 015_ai_features.sql
-- AI 功能增强：全局设置、工具配置、Skill 管理、上传文件

-- 1. 全局 AI 功能设置（每用户一行）
CREATE TABLE IF NOT EXISTS chat_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  enable_deep_think INTEGER DEFAULT 0,
  enable_file_upload INTEGER DEFAULT 0,
  allowed_file_types TEXT DEFAULT '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv,.md',
  max_file_size INTEGER DEFAULT 10485760,
  max_files_per_conversation INTEGER DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 2. AI 工具独立配置
CREATE TABLE IF NOT EXISTS tool_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  max_result_length INTEGER DEFAULT 500,
  enabled INTEGER DEFAULT 1,
  UNIQUE(user_id, tool_name),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. Skill 参考数据
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 4. 上传文件记录
CREATE TABLE IF NOT EXISTS uploaded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  message_id INTEGER,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_conv ON uploaded_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user ON uploaded_files(user_id);
