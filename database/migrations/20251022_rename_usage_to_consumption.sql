-- Migration: rename column `usage` -> `consumption` for meter_devices
ALTER TABLE `meter_devices` ADD COLUMN IF NOT EXISTS `consumption` DECIMAL(12,3) DEFAULT 0;

-- If usage exists, copy values to consumption
SET @has_usage = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meter_devices' AND COLUMN_NAME = 'usage');

-- The following statement uses dynamic SQL to copy values only if `usage` exists
DROP PROCEDURE IF EXISTS copy_usage_to_consumption;
DELIMITER $$
CREATE PROCEDURE copy_usage_to_consumption()
BEGIN
  IF @has_usage > 0 THEN
  UPDATE `meter_devices` SET `consumption` = COALESCE(`consumption`, 0) + COALESCE(`usage`, 0);
  -- Optionally drop the old column (commented out to be safe). Uncomment to remove the `usage` column.
  -- ALTER TABLE `meter_devices` DROP COLUMN `usage`;
  END IF;
END$$
DELIMITER ;

CALL copy_usage_to_consumption();
DROP PROCEDURE IF EXISTS copy_usage_to_consumption;

-- Ensure an index on device_id and consumption exists
ALTER TABLE `meter_devices` ADD INDEX IF NOT EXISTS (`device_id`(50));
ALTER TABLE `meter_devices` ADD INDEX IF NOT EXISTS (`consumption`);

-- End of migration
