const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
try {
  for (const file of ['node_modules/concurrently/package.json', 'backend/node_modules/express/package.json', 'frontend/node_modules/react-scripts/package.json', 'frontend/public/index.html', 'backend/.env', 'frontend/.env']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}. Run npm install, then npm run setup.`);
  }
  const { requireSecrets } = require('../backend/config/environment');
  requireSecrets();
  require('../backend/config/sqlite').close();
  console.log('[launcher] SQLite initialized. Starting frontend and backend; each service reports readiness. Press Ctrl+C to stop both.');
} catch (error) {
  console.error(`[launcher] ${error.message}`);
  process.exit(1);
}
