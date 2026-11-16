const fs = require('fs');
const path = require('path');
const { backup } = require('node:sqlite');
const db = require('../config/sqlite');
async function main() {
  const directory = path.join(__dirname, '../data/backups');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'ams-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
  if (fs.existsSync(file)) throw new Error('Backup destination already exists.');
  await backup(db.connection, file);
  console.log('SQLite backup created under backend/data/backups.');
}
main().catch(error => { console.error('Backup failed: ' + error.message); process.exitCode = 1; }).finally(() => db.close());
