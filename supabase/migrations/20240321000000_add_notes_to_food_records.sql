-- Update food_records table to support supplementary notes
ALTER TABLE food_records ADD COLUMN IF NOT EXISTS notes TEXT;