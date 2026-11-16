-- SQLite initial schema, derived from application queries. No MySQL data is imported.
CREATE TABLE property_managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE apartments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_number TEXT NOT NULL UNIQUE,
  floor TEXT,
  building TEXT,
  rent_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  password TEXT NOT NULL,
  apartment_id INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'active',
  move_in_date TEXT NULL,
  qr_code TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE payment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_type TEXT NOT NULL DEFAULT 'RENT',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bill_id),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

CREATE TABLE meter_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  meter_type TEXT,
  type TEXT,
  apartment_id INTEGER NULL,
  previous_reading REAL DEFAULT 0,
  present_reading REAL DEFAULT 0,
  consumption REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  current_reading REAL DEFAULT 0,
  last_reading_date TEXT NULL,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
);

CREATE TABLE meter_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_name TEXT,
  apartment_number TEXT,
  device_id TEXT,
  meter_type TEXT,
  previous_reading REAL DEFAULT 0,
  present_reading REAL DEFAULT 0,
  consumption REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  electricity_rate REAL DEFAULT 0,
  water_rate REAL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO settings (id, electricity_rate, water_rate) VALUES (1, 0, 0);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  property_manager_id INTEGER NULL,
  type TEXT,
  title TEXT,
  message TEXT,
  is_read INTEGER NOT NULL DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  FOREIGN KEY (property_manager_id) REFERENCES property_managers(id) ON DELETE RESTRICT
);


CREATE UNIQUE INDEX one_active_tenant_per_apartment ON tenants(apartment_id) WHERE status = 'active' AND apartment_id IS NOT NULL;
CREATE INDEX bill_tenant_due ON bills(tenant_id, due_date);
CREATE INDEX payment_date_type ON payment_history(paid_at, payment_type);
CREATE INDEX meter_history_device_date ON meter_history(device_id, recorded_at);
