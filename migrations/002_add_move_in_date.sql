-- Migration: add move_in_date to tenants table
ALTER TABLE `tenants` 
  ADD COLUMN `move_in_date` DATE DEFAULT NULL;

-- Optional: backfill move_in_date for existing tenants using created_at if available
-- UPDATE tenants SET move_in_date = DATE(created_at) WHERE move_in_date IS NULL AND created_at IS NOT NULL;
