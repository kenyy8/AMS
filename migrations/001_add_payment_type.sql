-- Idempotent migration: add payment_type column to payment_history if missing
ALTER TABLE `payment_history` ADD COLUMN IF NOT EXISTS `payment_type` VARCHAR(10) NOT NULL DEFAULT 'RENT';
-- Note: some MySQL versions don't support IF NOT EXISTS on ADD COLUMN; if your MySQL rejects this,
-- run the following safe check manually:
-- SELECT COUNT(*) INTO @c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_history' AND COLUMN_NAME = 'payment_type';
-- SET @s = IF(@c = 0, 'ALTER TABLE `payment_history` ADD COLUMN `payment_type` VARCHAR(10) NOT NULL DEFAULT \'RENT\';', 'SELECT "column exists";');
-- PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
