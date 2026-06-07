-- Add review_type_id foreign key to point_records
ALTER TABLE point_records ADD COLUMN review_type_id INTEGER REFERENCES review_types(id);
CREATE INDEX IF NOT EXISTS idx_points_review_type ON point_records(review_type_id);
