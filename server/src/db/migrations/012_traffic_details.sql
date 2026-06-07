-- Extend traffic_logs with WAF-style columns
ALTER TABLE traffic_logs ADD COLUMN method TEXT DEFAULT 'GET';
ALTER TABLE traffic_logs ADD COLUMN path TEXT DEFAULT '/';
ALTER TABLE traffic_logs ADD COLUMN status_code INTEGER DEFAULT 200;
ALTER TABLE traffic_logs ADD COLUMN user_agent TEXT DEFAULT '';
ALTER TABLE traffic_logs ADD COLUMN referer TEXT DEFAULT '';
ALTER TABLE traffic_logs ADD COLUMN is_attack INTEGER DEFAULT 0;
ALTER TABLE traffic_logs ADD COLUMN is_intercepted INTEGER DEFAULT 0;

-- Seed demo data (only if table is empty, or has only geo data)
INSERT INTO traffic_logs (city, lat, lng, upload_bytes, download_bytes, method, path, status_code, user_agent, referer, is_attack, is_intercepted)
SELECT * FROM (
  VALUES
    ('北京', 39.9042, 116.4074, 1024, 51200, 'GET', '/', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', '', 0, 0),
    ('北京', 39.9042, 116.4074, 2048, 102400, 'POST', '/api/login', 200, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'https://www.google.com/', 0, 0),
    ('上海', 31.2304, 121.4737, 512, 25600, 'GET', '/images/logo.png', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'https://cn.bing.com/', 0, 0),
    ('上海', 31.2304, 121.4737, 8192, 1048576, 'GET', '/image.tar.gz', 206, 'Go-http-client/2.0', 'https://help.waf-ce.chaitin.cn/', 0, 0),
    ('广州', 23.1291, 113.2644, 256, 12800, 'GET', '/', 200, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '', 0, 0),
    ('深圳', 22.5431, 114.0579, 512, 25600, 'GET', '/bootstrap.min.css', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'https://demo.waf-ce.chaitin.cn/', 0, 0),
    ('新加坡', 1.3521, 103.8198, 4096, 204800, 'POST', '/api/data', 403, 'python-requests/2.31.0', '', 1, 1),
    ('新加坡', 1.3521, 103.8198, 2048, 102400, 'GET', '/admin', 403, 'curl/8.0.1', '', 1, 1),
    ('新加坡', 1.3521, 103.8198, 1024, 51200, 'GET', '/wp-admin', 404, 'Mozilla/5.0 (compatible; Bot)', '', 1, 1),
    ('纽约', 40.7128, -74.0060, 512, 25600, 'GET', '/', 200, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0', 'https://www.google.com/', 0, 0),
    ('纽约', 40.7128, -74.0060, 256, 12800, 'GET', '/api/health', 200, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0', '', 0, 0),
    ('纽约', 40.7128, -74.0060, 8192, 409600, 'GET', '/backup.sql', 404, 'python-requests/2.31.0', '', 1, 1),
    ('伦敦', 51.5074, -0.1278, 128, 6400, 'GET', '/', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'https://www.google.com/', 0, 0),
    ('伦敦', 51.5074, -0.1278, 64, 3200, 'GET', '/favicon.ico', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', '', 0, 0),
    ('东京', 35.6762, 139.6503, 2048, 102400, 'GET', '/', 200, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', '', 0, 0),
    ('东京', 35.6762, 139.6503, 1024, 51200, 'POST', '/api/login', 429, 'python-requests/2.31.0', '', 1, 1),
    ('东京', 35.6762, 139.6503, 512, 25600, 'GET', '/api/admin', 403, 'curl/8.0.1', '', 1, 1),
    ('首尔', 37.5665, 126.9780, 256, 12800, 'GET', '/', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'https://search.naver.com/', 0, 0),
    ('莫斯科', 55.7558, 37.6173, 4096, 204800, 'GET', '/api/config', 403, 'python-requests/2.31.0', '', 1, 1),
    ('莫斯科', 55.7558, 37.6173, 2048, 102400, 'GET', '/.env', 404, 'curl/8.0.1', '', 1, 1),
    ('悉尼', -33.8688, 151.2093, 128, 6400, 'GET', '/', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'https://www.google.com/', 0, 0)
) WHERE (SELECT COUNT(*) FROM traffic_logs WHERE city != '') < 5;
