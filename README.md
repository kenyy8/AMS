# AMS ? local apartment management

AMS is a React frontend and Express backend for apartment/tenant management, rent and utility bills, payment records, reports, Smart ID QR codes, and meter readings.

## Requirements

- Node.js 24 or newer (verified with Node 24.22.0).
- npm (verified with npm 11.19.1).
- A browser. Chrome is used by the optional browser verification command.
- Internet is needed for initial dependency installation. No database server, XAMPP, Docker, MySQL credentials, or PostgreSQL installation is required.

## Windows setup

Open D:\a Dev\AMS as the VS Code workspace. This project selects **Command Prompt** for new integrated terminals, so the command is simply **npm**, without changing PowerShell execution policy. Close an old PowerShell terminal and open a new terminal if npm.ps1 is blocked. Alternatively choose Terminal: Select Default Profile -> Command Prompt.

From the project root:

```bat
cd /d "D:\a Dev\AMS"
npm run setup
npm run dev
```

The setup script installs launcher, backend, and frontend dependencies and creates missing .env files without overwriting existing ones. It generates distinct random authentication/QR secrets. Lockfiles are tracked. For an exact dependency reinstall, run npm ci separately in the root, backend, and frontend directories.

- Frontend: http://localhost:3000
- Backend: http://localhost:5001
- API check: http://localhost:5001/api/test
- SQLite health: http://localhost:5001/api/health

Open **Manager Login** on the home page. An empty database displays first-run manager registration. Choose your own name, email, and a password of at least 12 characters. Registration closes permanently once a manager exists. No default password or sample tenant is installed.

Double-click AMS.bat to invoke the same launcher. It uses its own directory and supports spaces in paths. Press Ctrl+C to stop both services. The launcher only terminates its own child process trees, never all Node processes. Keep the terminal open while using AMS.

## Commands

| Command | Purpose |
| --- | --- |
| npm run setup | Install all three dependency sets and create missing local environment files |
| npm run dev | Apply pending versioned SQLite migrations and start both services |
| npm run dev:backend | Start the backend and initialize SQLite |
| npm run dev:frontend | Start the React development server |
| npm run check | Parse source, resolve imports, and check migrations in an isolated in-memory database |
| npm run build | Build the frontend for production |
| npm test | Run isolated API/security tests and frontend unit tests |
| npm run test:browser | Start an isolated copy on ports 3000/5001 and test with installed Chrome; stop normal AMS first |
| npm run db:check | Initialize if needed and inspect schema, integrity, foreign keys, and record counts |
| npm run db:init | Apply pending migrations; safe to rerun, never resets records |
| npm run db:bootstrap | Optional interactive first-manager creation with hidden password input |
| npm run db:backup | Create a consistent SQLite backup under backend/data/backups |

## Configuration and storage

backend/.env uses HOST=127.0.0.1, PORT=5001, SQLITE_PATH=data/ams.db, JWT_SECRET, and QR_SECRET. The database path is relative to backend unless absolute. Keep secrets private; examples are in backend/.env.example. Do not change secrets casually: doing so invalidates existing sessions or Smart IDs.

frontend/.env uses REACT_APP_API_URL=http://localhost:5001, HOST=127.0.0.1, PORT=3000, BROWSER=none. Frontend environment values are public; never put secrets there. The combined launcher fixes service ports to 3000 and 5001 and isolates their environment variables.

Data persists in backend/data/ams.db. Local database files, WAL/journal files, backups, dependency directories, and .env files are ignored by Git. See DATABASE_SETUP_GUIDE.md for migration and backup details. No inaccessible MySQL data was imported; this is a fresh local SQLite setup.

## Implementation

- frontend/src/index.js -> App.js -> routes.js -> existing pages.
- frontend/src/axiosConfig.js supplies the API URL and attaches the session token.
- backend/server.js starts HTTP and authenticated Socket.IO.
- backend/app.js implements authentication, tenant/apartment/billing/payment APIs.
- backend/routes/sqlite*Routes.js implement meter, QR, and reporting endpoints.
- backend/config/sqlite.js centralizes node:sqlite access and migrations.
- backend/database contains immutable numbered SQLite migrations.

Passwords are hashed on creation/change. A compatibility comparison can authenticate retained plaintext credentials without silently changing their data; the fresh setup contains no such records. API responses redact password/secret fields. Managers have administrative access, and tenants are limited to their own bills, payments, QR data, and meters. Signed Smart IDs expire after 12 hours and act as login credentials: protect them like passwords and regenerate expired codes. Camera decoding is local through jsQR and does not download a decoder from a CDN.

## Verified locally

- Dependency installation and lockfile generation.
- Source/import validation, SQLite initialization and migration rerun, foreign-key/integrity checks, and consistent SQLite backup creation.
- 12 Node test results covering setup/login, hashing, authorization, apartment/tenant CRUD, occupancy uniqueness, billing rollback, payment rollback/reversal/duplicate prevention, reports, meters/history, signed QR login, and persistence. Tests use temporary databases.
- Two frontend tests and a successful production build.
- Chrome tests: actual first-run registration, frontend/API communication, manager pages, tenant login/dashboard, PDF export, and authenticated Socket.IO meter updates.
- One-command development startup and HTTP 200 responses from frontend, API test, and SQLite health.
- Ctrl+C closes both service ports and leaves an unrelated Node test process running.

## Limits and troubleshooting

- Physical meter hardware, physical-camera scanning, printer output, external mail, locks/cameras, and production hosting were not verified.
- Scheduled automatic bill creation is not configured; the original scheduler was incomplete. Use existing billing actions. The retained scheduler explicitly refuses to invent a schedule. Notification email delivery is not configured.
- Original MySQL server/scripts are retained under backend/legacy for reference and are not part of the startup path. Other retained legacy modules are not newly exposed as API features.
- Dependency audit after repair: launcher/backend have zero advisories; the retained frontend toolchain has 34 advisories (13 high, 5 moderate, 16 low), with no critical advisories. jsPDF was upgraded and its PDF export tested. A separate frontend toolchain modernization is still needed before production use. No force-based audit fix was applied.
- If a port is occupied, stop the existing AMS terminal or identify that specific process. Do not kill all Node processes. The launcher stops its other child when an essential child exits.
- If dependencies are missing, run npm run setup. Do not run npm install in the wrong directory; the root setup command handles all packages.
- If a migration checksum differs, restore that applied migration and add a new numbered migration; do not edit the database or delete data to bypass the check.
- Local binding is deliberate. Phone/LAN access requires a separately reviewed host/CORS/HTTPS configuration.
- Git metadata was recovered from a separate clone without replacing working files. No commits, pushes, or remote changes were made.

## Fictional demonstration dataset

Run this explicitly from the root; it is never part of normal startup:

```bat
npm run seed:demo
npm run verify:demo
npm run test:demo
```

The seed command makes a consistent backup before applying migrations or inserting records. It creates **DEMO Amihan Courtyard**, a fictional property on a fictional Sample Lane in Quezon City, Metro Manila. All people, contacts, accounts, readings, bills, and payments are synthetic demonstration records, not actual business data. Illustrative rental prices are not verified market rates.

The seeded six-month period is June-November 2026, with a reference date of November 16, 2026. There are 20 units (15 occupied, five available), 15 active tenant accounts, one separate demo manager, 90 rent bills, 180 utility bills, 30 meters, 180 historical reading snapshots, and 224 full-payment transactions. There are no partial payments: the current application treats a payment row as full settlement and does not correctly model partial balances.

- Demo manager: ams.demo.manager@example.com at http://localhost:3000/property-manager-login.
- Tenants: tenant01@example.com through tenant15@example.com at http://localhost:3000/tenant-login.
- Every account has its own generated temporary password in **demo-accounts.local.csv** at the project root. Open that local CSV in VS Code or Excel. No temporary password is hardcoded into source or stored as plaintext in SQLite.
- The CSV is ignored by Git. Windows permissions grant only the workspace owner, the creating process account, and SYSTEM. Keep it private: it intentionally contains usable demo credentials.
- Private QR PNGs are under backend/data/demo/qr. These use the same signed-token issuer as the API and expire after 12 hours. Rerun npm run seed:demo to refresh them; the UI also generates current codes when opened.
- The full unit/account inventory and reconciled totals are in backend/data/demo/summary.local.json. Latest live verification results are in backend/data/demo/verification.local.json. Both are local and ignored.

The first successful run fixes its six-month reference period. Repeat runs verify the tracked dataset and preserve credentials and business records without duplicates. They do not reset modified passwords or recreate deleted demo records. A missing credential manifest must be restored from a private copy, not recovered from password hashes. Identifier collisions with existing records abort the seed transaction instead of overwriting or adopting those records. Existing managers and other non-demo records are preserved; the empty-database case uses the shared first-manager bootstrap flow.

Unit types are shown in unit labels because there is no unit-type column. Contracts, deposits, property addresses, notifications UI, and hardware connectivity are not invented. Per-meter fictional rates are PHP 12.50/kWh and PHP 45.00/m3, and each bill equals measured consumption times that device's configured rate. Existing global rate settings remain unchanged. Meter snapshots are synthetic history, not reported physical IoT events. Dashboards and reports calculate their values from bills, payment history, apartments, and tenants; no statistics are fabricated in separate summary tables.

As of the seed reference date: PHP 1,245,222.50 billed, PHP 975,297.50 paid, PHP 269,925.00 outstanding. Of the 46 outstanding bills, 20 are overdue (PHP 178,735.00) and 26 are not yet due (PHP 91,190.00). These age naturally as time passes. The test and verification commands do not create demonstration business records in the real database; test:demo uses separate temporary databases.

## One FREE Render service for a class demonstration

**Prepared and tested locally. No Render service or public URL has been created or verified.** This configuration serves the compiled React application, Express API, authenticated Socket.IO, and an embedded fictional SQLite dataset from one web service. It does not use another frontend host, a paid disk, a database service, Docker, or a billing upgrade.

### Production commands

```text
Build command: npm run render:build
Start command: npm start
Health check: /api/health
```

For a local compiled frontend build alone, use npm run build:production. Local development remains npm run dev (ports 3000 and 5001). The production build disables source maps and inline runtime scripts and uses relative /api calls and same-origin sockets. The interface has no demo banner or reserved banner spacing. Hosted data is still fictional and temporary. The compiler runs with a 384 MiB JavaScript heap cap; the single runtime Node process uses a 256 MiB heap cap. These are heap caps, not guarantees of total RAM usage.

The Render build command installs only backend and frontend dependencies from lockfiles, then compiles React. It does not require root development packages or install Playwright browsers. The deployment source check refuses tracked database, credential, private environment, or key files. Neither the build nor startup copies the local database or local .env files.

### Prepare private hosted credentials on this computer

Already generated locally for this project; the following command safely reuses existing values:

```bat
npm run render:secrets
```

Open backend/data/render-secrets.local.json locally in VS Code. It contains three distinct random values named JWT_SECRET, QR_SECRET, and DEMO_PASSWORD_SEED. Copy values directly into Render's private Environment panel; do not paste them into chat, commit them, show them in a class recording, or put them in a frontend environment variable.

Open **render-demo-accounts.local.csv** at the project root to obtain all hosted demo logins. This is separate from demo-accounts.local.csv, whose passwords belong only to your existing local database. The two preferred hosted passwords come exactly from HOSTED_MANAGER_PASSWORD and HOSTED_TENANT_PASSWORD. The other 14 tenant passwords remain deterministically derived using HMAC from the unchanged private DEMO_PASSWORD_SEED and each account identity. Password hashes alone are written to hosted SQLite. A secret kept in Render's environment makes regenerated accounts use the same passwords across cold starts.

The hosted manager is **admin@ams.test** at `/property-manager-login`; the primary hosted tenant is **tenant@ams.test** at `/tenant-login`, assigned to apartment 101 (Studio). Other hosted tenants remain tenant02@example.com through tenant15@example.com. The two preferred accounts use the exact private environment values selected by the operator; no generated-password fallback exists for these accounts. Run `npm run render:accounts` to refresh the ignored manifest. Existing local accounts, including any manager created locally, belong to backend/data/ams.db and are never uploaded to Render. A local login cannot be assumed to exist online.

On hosted startup, earlier seeded manager/primary tenant identities are updated in place, preserving account IDs, apartment assignments, bills, and payment history. Existing preferred accounts have their password hashes reconciled with the configured hosted credentials. This repair runs only against a database with hosted fictional-data provenance and never touches the local database. Keeping the two password environment values unchanged keeps these credentials stable across restarts. The seed still controls only the other 14 tenant passwords. Startup deliberately restores these two hosted passwords if they were changed in the temporary database.

If you used a different DEMO_PASSWORD_SEED on Render, run npm run render:accounts -- --prompt and supply that secret through the hidden prompt (or privately update the local hosted secrets file). No web endpoint or log reveals the credential list. The manifest command privately backs up a matching older-format hosted manifest before upgrading the two preferred identities; unrelated credentials are never overwritten. Free Render instances do not provide shell/SSH access, so credential retrieval does not depend on a server shell.

Create or update ignored, access-restricted `backend/data/hosted-accounts.local.json` with keys `HOSTED_MANAGER_PASSWORD` and `HOSTED_TENANT_PASSWORD`. These are required Render Environment secrets, with values selected by the operator; both must contain at least 12 characters and at most 72 UTF-8 bytes. The manifest command reads this private file, preserves the other 14 accounts, backs up the previous manifest, and synchronizes only the two preferred credentials. Explicit process environment values take precedence over the private file. Copy these exact two values into Render Dashboard -> ams-qjjx -> Environment, then Save, rebuild, and deploy after pushing compatible source. Do not change JWT_SECRET, QR_SECRET, or DEMO_PASSWORD_SEED. Missing password secrets stop production startup instead of generating replacements. Never put passwords into Git, frontend variables, deployment logs, or public files.

For an existing service, open Render Dashboard -> **ams-qjjx** -> Settings -> Build & Deploy and inspect Auto-Deploy. The repository Blueprint specifies manual deploys; the Dashboard setting determines actual behavior. After the source commit is pushed, use **Manual Deploy -> Deploy latest commit** if needed. Preserve existing JWT_SECRET, QR_SECRET and DEMO_PASSWORD_SEED values. Verify the active deployment's commit and test both preferred logins against the actual HTTPS URL; passing local tests alone does not establish live deployment success.

After deployment, `npm run verify:hosted` tests the actual https://ams-qjjx.onrender.com instance using the ignored hosted manifest. It checks both logins, invalid credentials, tenant isolation, apartment/bill/payment access, financial report reconciliation, signed QR authentication, and compiled dashboard rendering without demo labels. It prints no passwords/tokens and writes a private result under backend/data/. It does not restart Render or change business records. Set AMS_VERIFY_ORIGIN to another HTTPS origin only when intentionally testing that service.

### Environment values

| Variable | Value/source |
| --- | --- |
| NODE_ENV | production |
| HOSTED_DEMO | true |
| NODE_VERSION | 24.22.0 (also pinned by .node-version) |
| JWT_SECRET | Random value from the private hosted secrets file, or Blueprint-generated value |
| QR_SECRET | Different random value, or Blueprint-generated value |
| DEMO_PASSWORD_SEED | Private hosted secrets file value; keep stable across restarts |
| HOSTED_MANAGER_PASSWORD | Required exact manager password from backend/data/hosted-accounts.local.json |
| HOSTED_TENANT_PASSWORD | Required exact primary tenant password from the same private file |
| APP_ORIGIN | Usually omit: Render supplies RENDER_EXTERNAL_URL automatically. Set only to the actual public HTTPS origin if you need to override it |
| PORT | Omit: use Render's assigned PORT |
| SQLITE_PATH | Usually omit: defaults to /tmp/ams-render-demo/ams.db on Render |

Do not set REACT_APP_API_URL to localhost on Render. No backend secret belongs in any REACT_APP_* variable. Production ignores the local backend .env file, requires all three secrets to be long and distinct, and refuses database paths outside the OS temporary directory. Public HTTP traffic behind the Render proxy redirects to the configured HTTPS origin; health checks remain minimal and available.

### Commit the code yourself before deploying

The deployment source must be committed to the private repository on the branch selected in Render. For future updates, review and commit the complete source implementation before deploying. Application setup, build, and startup scripts never commit or push automatically.

Review and commit the source/configuration required for the current installation: root package.json/package-lock.json, .gitignore, .node-version, render.yaml, scripts/, backend application/config/middleware/services/scripts/database migrations and backend package manifests/lockfile, frontend source/public template and frontend manifests/lockfile, tests, and the updated documentation. Existing local startup files such as AMS.bat can also be committed. Retained MySQL reference files under backend/legacy are not used by production.

**Never stage backend/data/, any .env with secrets, demo-accounts.local.csv, render-demo-accounts.local.csv, generated QR images, backups, node_modules, or frontend/build.** After staging source, run npm run check:deploy again and inspect git diff --cached --name-only. Commit and push to your private main branch yourself when ready.

### Exact Render Dashboard steps (recommended)

1. Sign in to Render and select a free/Hobby workspace. Do not enable a paid workspace or add paid resources for this demo.
2. Choose New -> Web Service -> Git Provider -> GitHub. Authorize the Render GitHub app for the private kenyy8/AMS repository. If it is missing, configure that app's repository access; do not make the repo public.
3. Select kenyy8/AMS and the main branch containing the reviewed source changes. Choose a service name; its eventual onrender.com URL is assigned by Render, not known in advance.
4. Runtime: Node. Root Directory: leave blank (repository root). Build Command: npm run render:build. Start Command: npm start.
5. Instance Type: **Free**. Add no persistent disk, Postgres, worker, cron job, or other service. Disable automatic deploys if you want to control class-demo rebuilds.
6. Add NODE_ENV=production, HOSTED_DEMO=true, NODE_VERSION=24.22.0 and the three private secret values from the local hosted secrets file, plus HOSTED_MANAGER_PASSWORD and HOSTED_TENANT_PASSWORD from backend/data/hosted-accounts.local.json. Leave PORT, SQLITE_PATH, and APP_ORIGIN unset for the standard onrender.com URL.
7. Under Advanced, set Health Check Path to /api/health. Confirm the service is Free and has no paid add-ons, then create the web service. If the selected account/workspace cannot create a free service, stop instead of accepting a paid upgrade.
8. Inspect Build and Deploy logs. Only the fictional hosted seed should initialize. When Render reports ready, open the actual HTTPS URL, reload /property-manager-login, log in with the hosted manager CSV, and check /api/health. Then test a tenant, a deep-link refresh such as /reports, QR login, and a meter page before class.
9. Keep that verified URL for the class. The local preparation tests are not proof that a live Render deployment or its TLS/proxy configuration works.

Alternatively, after committing the same source, create a Blueprint from render.yaml. It declares exactly one Node web service with plan: free, no disks/databases, and manual deploys. It generates JWT_SECRET and QR_SECRET privately and prompts for DEMO_PASSWORD_SEED, HOSTED_MANAGER_PASSWORD, and HOSTED_TENANT_PASSWORD (sync: false); supply the values from your two private local configuration files. Using Blueprint-generated JWT/QR keys does not change the two explicit passwords or the remaining passwords derived from DEMO_PASSWORD_SEED. Review the proposed resources before applying the Blueprint.

### Free-tier behavior and safety

Render Free currently provides 512 MB RAM and 0.1 CPU. It can spin down after 15 idle minutes and lose filesystem changes on spin-down, restart, or redeploy. A cold request can take about a minute to wake the service, with additional time possible for demo initialization. Open it before class; do not add keep-awake jobs. Monthly workspace usage limits apply; monitor the dashboard and do not enable billing/paid upgrades to avoid a suspension. This project provisions no paid resources.

Every new empty hosted filesystem receives a fresh fictional property with 20 units, 15 tenants, one manager, six months of bills/utility history, and payments. Repeated initialization does not duplicate business records; it reconciles the two preferred hosted credentials and normalizes seeded display labels. A new filesystem discards class edits and rebuilds the fictional dataset; credentials stay stable while the seed and the two required password secrets stay unchanged. Never enter real tenant/business information. Your existing local database, original manager, local credentials, and local persistent edits remain separate.

Production disables anonymous manager bootstrap and /api/test, validates authenticated account existence, restricts tenants to their own records, protects manager-only operations, blocks foreign browser origins, uses a Content Security Policy and security headers, and never exposes a server credential-download endpoint or backend/private filesystem directory. Authentication retains bearer tokens in browser localStorage (no auth cookies); this preserves the existing frontend and depends on XSS prevention and private handling of the manager account. Only hashed-password login is accepted in production.

This remains a class demo, not durable production hosting. The retained CRA toolchain has known dependency advisories; a separate modernization is still advisable before production use. Physical cameras/meters, external email, scheduled billing, and real-world payment processing are not verified or fabricated.

### Local production verification

```bat
npm run build:production
npm run test:production
npm run check:deploy
```

The production test creates isolated temporary SQLite instances. It verifies fresh seeding, preferred manager/tenant login, invalid credentials, role restrictions, tenant billing/payment scoping, SPA fallback, API JSON errors, blocked private files, absence of visible demo labels, same-origin browser requests, PDF export, QR login, authenticated Socket.IO, safe repeat initialization, legacy hosted account repair, stable credentials after a fresh-filesystem restart, rejected local database targets/missing secrets, and Render HTTPS-proxy handling in simulation. It never changes backend/data/ams.db or either local credential manifest.

The exact Render build command also passed in a clean source copy containing no local database, local/hosted credential CSV, private .env, or root node_modules. npm start served its compiled frontend and initialized only a new temporary demo database. Live Render creation, Linux runtime behavior on Render, assigned public URL, managed TLS, and provider acceptance remain unverified until you deploy and check them.

Official references: [free-tier behavior](https://render.com/docs/free), [web service setup and binding](https://render.com/docs/web-services), [private Git provider access](https://render.com/docs/git-provider), [Blueprint configuration](https://render.com/docs/blueprint-spec), [compute plans](https://render.com/docs/compute-plans), [Node version selection](https://render.com/docs/node-version).
