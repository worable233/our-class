-- Extend traffic_logs with WAF-style columns
ALTER TABLE traffic_logs ADD COLUMN method TEXT DEFAULT 'GET';
ALTER TABLE traffic_logs ADD COLUMN path TEXT DEFAULT '/';
ALTER TABLE traffic_logs ADD COLUMN status_code INTEGER DEFAULT 200;
ALTER TABLE traffic_logs ADD COLUMN user_agent TEXT DEFAULT '';
ALTER TABLE traffic_logs ADD COLUMN referer TEXT DEFAULT '';
ALTER TABLE traffic_logs ADD COLUMN is_attack INTEGER DEFAULT 0;
ALTER TABLE traffic_logs ADD COLUMN is_intercepted INTEGER DEFAULT 0;
