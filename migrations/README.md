Migration helper files for AMS

001_add_payment_type.sql
- Adds `payment_type` VARCHAR(10) NOT NULL DEFAULT 'RENT' to `payment_history` table.

How to run (PowerShell):

# run the migration using mysql CLI (replace user/password/host/db credentials)
mysql -u root -p -D smart_apartment_management < migrations/001_add_payment_type.sql

If your MySQL version rejects `ADD COLUMN IF NOT EXISTS`, use the safe block commented in the SQL file.
