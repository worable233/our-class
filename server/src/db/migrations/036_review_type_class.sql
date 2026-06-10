-- 036_review_type_class.sql
-- 点评类型按班级隔离

ALTER TABLE review_types ADD COLUMN class TEXT NOT NULL DEFAULT '';

-- 已有数据默认归属到全部班级时用空字符串表示全局
