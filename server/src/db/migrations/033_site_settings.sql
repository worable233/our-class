-- 033_site_settings.sql
-- 站点基础设置表

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_title TEXT NOT NULL DEFAULT 'OurClass',
  site_icon TEXT DEFAULT '',
  site_description TEXT DEFAULT '',
  footer_text TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (id, site_title) VALUES (1, 'OurClass');
