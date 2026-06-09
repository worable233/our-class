ALTER TABLE permission_groups ADD COLUMN parent_id INTEGER REFERENCES permission_groups(id);
ALTER TABLE permission_groups ADD COLUMN class TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES permission_groups(id);
