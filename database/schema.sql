-- Drop and recreate database
DROP DATABASE IF EXISTS smart_apartment_management;
CREATE DATABASE smart_apartment_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_apartment_management;

-- Tables
CREATE TABLE property_managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(50),
  role VARCHAR(50) DEFAULT 'manager',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

CREATE TABLE apartments (
CREATE TABLE apartments (
  floor INT,
  apartment_number VARCHAR(50) NOT NULL,
  floor INT,
  building VARCHAR(100),
  rent_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'vacant',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL UNIQUE,
CREATE TABLE tenants (
  email VARCHAR(150) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',

    id INT AUTO_INCREMENT PRIMARY KEY,
  bill_type ENUM('rent','water','electricity') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
CREATE TABLE bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  bill_type ENUM('rent','water','electricity') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS meter_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  meter_type ENUM('water_meter','electricity_meter') DEFAULT NULL,
  type VARCHAR(100) DEFAULT NULL,
  apartment_id INT DEFAULT NULL,
  previous_reading DECIMAL(12,3) DEFAULT 0,
  present_reading DECIMAL(12,3) DEFAULT 0,
  consumption DECIMAL(12,3) DEFAULT 0,
  rate DECIMAL(12,3) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  current_reading DECIMAL(12,3) DEFAULT 0,
  last_reading_date DATETIME DEFAULT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active'
);
  device_name VARCHAR(150) NOT NULL,
  device_type ENUM('water_meter','electricity_meter','smart_lock','security_camera') NOT NULL,
    id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  current_reading DECIMAL(12,3) DEFAULT 0,
  last_reading_date DATETIME,
  paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL
);

CREATE TABLE payment_history (
    tenant_id INT NOT NULL,
  description TEXT,
  bill_id INT,
  status VARCHAR(50) DEFAULT 'open',
  method VARCHAR(50),
  paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL
    property_manager_id INT,
  type VARCHAR(50),
CREATE TABLE maintenance_requests (
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
('A-102', 1, 'North', 1100.00, 'vacant');
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE

INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES
CREATE TABLE notifications (
(1, 'electricity', 78.25, DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'pending');

  type VARCHAR(50),
  title VARCHAR(150),
  message TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY (property_manager_id) REFERENCES property_managers(id) ON DELETE SET NULL
-- Seed data (plaintext passwords)
INSERT INTO property_managers (username, password, name, email, phone, role) VALUES
('manager1', 'password123', 'John Manager', 'manager@email.com', '123-456-7890', 'manager');

('A-101', 1, 'North', 1200.00, 'occupied'),
('A-102', 1, 'North', 1100.00, 'vacant');

INSERT INTO tenants (tenant_id, password, name, email, phone, apartment_id, status, move_in_date) VALUES
('APT-2024-0001', 'tenant123', 'Jane Smith', 'jane.smith@email.com', '987-654-3210', 1, 'active', '2024-01-15');

INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES
(1, 'rent', 1200.00, DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'pending'),
(1, 'water', 45.50, DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'pending'),
(1, 'electricity', 78.25, DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'pending');

-- Billing history stores snapshot of readings when they are updated (archival/audit)
CREATE TABLE IF NOT EXISTS billing_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_name VARCHAR(150),
  apartment_number VARCHAR(50),
  device_id VARCHAR(100),
  meter_type ENUM('water_meter','electricity_meter') NOT NULL,
  previous_reading DECIMAL(12,3) DEFAULT 0,
  present_reading DECIMAL(12,3) DEFAULT 0,
  consumption DECIMAL(12,3) DEFAULT 0,
  rate DECIMAL(12,3) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Global settings for rates (used to compute costs server-side)
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  electricity_rate DECIMAL(12,3) DEFAULT 0,
  water_rate DECIMAL(12,3) DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings row if table empty
INSERT INTO settings (electricity_rate, water_rate) SELECT 14.66, 60.00 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM settings);