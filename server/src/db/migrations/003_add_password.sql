ALTER TABLE users ADD COLUMN password TEXT DEFAULT '';
UPDATE users SET password = '123456' WHERE password IS NULL OR password = '';
