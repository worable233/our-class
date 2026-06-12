-- Add password_changed_at to invalidate old tokens on password change
ALTER TABLE users ADD COLUMN password_changed_at DATETIME DEFAULT NULL;
