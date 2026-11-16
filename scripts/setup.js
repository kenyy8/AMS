const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run setup.');
for (const folder of ['.', 'backend', 'frontend']) {
  console.log(`[setup] Installing ${folder === '.' ? 'launcher' : folder} dependencies`);
  const result = spawnSync(process.execPath, [npmCli, 'install', '--no-fund', '--no-audit'], { cwd: path.join(root, folder), stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const backendEnv = path.join(root, 'backend', '.env');
if (!fs.existsSync(backendEnv)) {
  fs.writeFileSync(backendEnv, `HOST=127.0.0.1\nPORT=5001\nSQLITE_PATH=data/ams.db\nJWT_SECRET=${crypto.randomBytes(48).toString('hex')}\nQR_SECRET=${crypto.randomBytes(48).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('[setup] Created backend/.env with unique secrets. SQLite initializes automatically; no database credentials are required.');
}
const frontendEnv = path.join(root, 'frontend', '.env');
if (!fs.existsSync(frontendEnv)) fs.writeFileSync(frontendEnv, 'REACT_APP_API_URL=http://localhost:5001\nHOST=127.0.0.1\nPORT=3000\nBROWSER=none\n', { flag: 'wx' });
console.log('[setup] Complete. Run npm run dev. Existing environment files were preserved.');
