# AMS database setup ? SQLite

No database server or database credentials are needed. Node.js 24 provides the built-in node:sqlite module used by AMS.

## First run

From a new VS Code Command Prompt terminal at D:\a Dev\AMS:

```bat
npm run setup
npm run dev
```

The backend automatically creates backend/data/ams.db if absent and applies pending migrations transactionally. The database is a fresh local setup. No MySQL records have been transferred or removed.

Open http://localhost:3000, choose Manager Login, and register the first property manager. Choose a unique password of at least 12 characters. There is no default account/password. Registration is available only on the loopback-bound local backend and only while the manager table is empty. Alternatively use npm run db:bootstrap for private terminal password entry.

## Schema and migrations

backend/config/sqlite.js is the centralized database module. It enables foreign keys, WAL for disk databases, and a 5000 ms busy timeout. Prepared statements bind values. Payments, bulk bills, occupancy changes, and reading/history updates use synchronous transactions.

- 001_initial.sql creates property_managers, apartments, tenants, bills, payment_history, meter_devices, meter_history, settings, foreign keys, indexes, unique email/identity/device keys, one payment per bill, and at most one active tenant per apartment.
- 002_integrity.sql adds financial-value validation triggers.
- schema_migrations stores the migration filename, SHA-256 checksum, and applied timestamp.

An applied migration is never rerun. Its checksum must match; new schema changes belong in a new numbered migration. Existing records are preserved. If existing records prevent a future constraint, initialization fails and rolls back; it never resets the database.

Settings starts with one row and zero utility rates. Confirm actual water/electricity rates in Meter Device Management before recording readings. Manager, tenant, apartment, bill, and meter records are not seeded.

## Commands

```bat
npm run db:check
npm run db:init
npm run db:backup
```

The check initializes missing schema and checks SQLite integrity, foreign keys, and table counts. The init command applies pending migrations and performs the same checks. Neither command deletes records. A backup uses SQLite's native online backup API and creates a new file under backend/data/backups without overwriting an existing backup.

The SQLITE_PATH variable in backend/.env can select another file; relative paths resolve from backend. Keep this file and JWT/QR secrets private. No DB_HOST, DB_PORT, DB_USER, or DB_PASSWORD setting is required.

## Preservation and tests

Do not delete ams.db to fix an error. Create a backup first. Do not copy only the main file while a live WAL database is writing; use npm run db:backup for a consistent snapshot. To restore a backup, stop AMS, preserve the existing database and its companion WAL/SHM files, and review the exact source/target paths before replacing anything.

API tests and browser tests create separate temporary databases outside the project. They do not create demo records in backend/data/ams.db. Test data is never described as recovered MySQL data. Existing MySQL services and data were left untouched.

Verified locally: migration application/rerun, persistence across connections, foreign-key integrity, duplicate occupancy/payment protection, failed bulk-operation rollback, CRUD, authentication, reports, meter history, signed QR login, and backup creation.

## Optional fictional demo population

Run npm run seed:demo after setup. The seeder backs up the target file before importing the auto-migrating database module, checks schema checksums, and inserts only its own fictional records transactionally. Existing accounts and settings are preserved. Every demo account and record has explicit provenance in the 003_demo_tracking.sql tables (demo_seed_runs and demo_seed_records). Those tables track ownership; they are not new apartment-management features.

The seed never drops, resets, truncates, or deletes the database. A repeat run inserts no duplicate business rows and does not rotate account passwords. Credential and QR files are private and ignored by Git. The root demo-accounts.local.csv is the only plaintext account-password manifest; it grants your workspace-owner account access and must stay local. Back it up privately if desired. Do not commit it, SQLite files, private QR codes, or local state files.

The dataset contains 20 labeled demo units, 15 tenant accounts, one demo manager, six months of rent and utility history, 30 meters, and payments that exactly settle their related bills. The initial reference date and summary are frozen in the seed ledger. Positive device-specific demo rates are used instead of overwriting global settings. No existing MySQL data is imported. No partial payments or unsupported contracts/deposits/notification interfaces are simulated.

Use npm run verify:demo while the app is running for read-only financial, login, API, QR, dashboard, browser, and preservation checks. Use npm run test:demo for isolated bootstrap/idempotence/collision tests. Backups are under backend/data/backups; state and summary files are under backend/data/demo. A normal application restart preserves all demo records. Repeated login testing is subject to the existing local login rate limit; normal server restart starts a new in-memory limit window.

## Separate hosted demo database on Render Free

Production startup is npm start from the repository root after npm run render:build. Set NODE_ENV=production and HOSTED_DEMO=true plus the three private Render secrets documented in README.md. Production does not read backend/.env and defaults to /tmp/ams-render-demo/ams.db. An explicit SQLITE_PATH must be absolute and remain under the OS temporary directory. A copied local dataset or a nonempty unrecognized database is rejected; no local database/export is deployed.

Only source-defined fictional demo data is initialized. Hosted mode writes no account CSV, private QR files, or backup copies. Same-filesystem repeat startup creates no duplicate records. A new ephemeral filesystem rebuilds the fictional dataset and loses edits. Hosted startup reconciles admin@ams.test (manager) and tenant@ams.test (tenant assigned to apartment 101) in place, preserving their IDs and history. Stable HMAC-derived passphrases come from DEMO_PASSWORD_SEED in Render's private environment, with optional HOSTED_MANAGER_PASSWORD / HOSTED_TENANT_PASSWORD private environment overrides. Obtain credentials locally in render-demo-accounts.local.csv with npm run render:accounts; never serve or commit that manifest. The optional password values also appear in ignored backend/data/hosted-accounts.local.json. Local backend/data/ams.db and local login credentials are never used by hosted startup.

Your local backend/data/ams.db, demo-accounts.local.csv, existing account, and persistent demo changes are independent of Render. See README.md for the one-free-service deployment and verification steps. No paid disk or external database is required for this disposable class demonstration.
