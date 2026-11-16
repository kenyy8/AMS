const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const environment = require('./environment');

const databasePath = environment.databasePath();
if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const connection = new DatabaseSync(databasePath, { timeout: 5000, enableForeignKeyConstraints: true });
connection.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
if (databasePath !== ':memory:') connection.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

function transaction(fn) {
  if (connection.isTransaction) return fn();
  connection.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error('SQLite transaction callbacks must be synchronous.');
    connection.exec('COMMIT');
    return result;
  } catch (error) { connection.exec('ROLLBACK'); throw error; }
}

function migrate() {
  const directory = path.join(__dirname, '../database');
  transaction(() => {
    connection.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    for (const file of fs.readdirSync(directory).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = connection.prepare('SELECT checksum FROM schema_migrations WHERE version = ?').get(file);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration ${file} has changed. Restore it and add a new numbered migration.`);
        continue;
      }
      connection.exec(sql);
      connection.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)').run(file, checksum);
    }
    if (connection.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database foreign-key integrity check failed.');
  });
}

function values(params) { return params.map(v => v === undefined ? null : v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? Number(v) : v); }
function all(sql, params = []) { return connection.prepare(sql).all(...values(params)); }
function get(sql, params = []) { return connection.prepare(sql).get(...values(params)); }
function run(sql, params = []) {
  const result = connection.prepare(sql).run(...values(params));
  return { insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes), changes: Number(result.changes) };
}

migrate();
module.exports = { all, get, run, transaction, migrate, connection, databasePath, close: () => connection.close() };
