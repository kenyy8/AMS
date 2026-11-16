const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-seed-test-'));
  return { directory, env: { ...process.env, SQLITE_PATH: path.join(directory,'test.db'), DEMO_MANIFEST_PATH: path.join(directory,'accounts.local.csv'), JWT_SECRET: crypto.randomBytes(48).toString('hex'), QR_SECRET: crypto.randomBytes(48).toString('hex') } };
}
function seed(env) { return spawnSync(process.execPath,['backend/scripts/seed-demo.js','--as-of=2026-11-16'],{cwd:root,env,encoding:'utf8',timeout:60000}); }
function fingerprint(database) {
  const tables=['property_managers','apartments','tenants','bills','payment_history','meter_devices','meter_history','settings','notifications'];
  return crypto.createHash('sha256').update(JSON.stringify(tables.map(table=>database.prepare('SELECT * FROM '+table+' ORDER BY id').all()))).digest('hex');
}
test('demo bootstrap, credentials, and repeat run preserve the complete dataset', () => {
  const { env } = fixture();
  const first=seed(env);assert.equal(first.status,0,first.stderr);
  const database=new DatabaseSync(env.SQLITE_PATH,{readOnly:true});
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM property_managers').get().n,1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tenants').get().n,15);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM apartments').get().n,20);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bills').get().n,270);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM payment_history').get().n,224);
  assert.ok(database.prepare('SELECT password FROM property_managers').get().password.startsWith('$2'));
  const before=fingerprint(database),manifestBefore=fs.readFileSync(env.DEMO_MANIFEST_PATH);
  const second=seed(env);assert.equal(second.status,0,second.stderr);
  assert.equal(fingerprint(database),before);
  assert.ok(fs.readFileSync(env.DEMO_MANIFEST_PATH).equals(manifestBefore),'Passwords must not rotate on repeat');
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  database.close();
});
test('identifier collision aborts without overwriting or adopting an existing apartment', () => {
  const { env } = fixture();
  const initialize=spawnSync(process.execPath,['-e',"const db=require('./backend/config/sqlite');db.run(\"INSERT INTO apartments(apartment_number,building,rent_amount,status) VALUES ('DEMO-101 (Studio)','Existing synthetic test fixture',1234,'available')\");db.close();"],{cwd:root,env,encoding:'utf8'});
  assert.equal(initialize.status,0,initialize.stderr);
  const database=new DatabaseSync(env.SQLITE_PATH,{readOnly:true}),before=fingerprint(database);
  const result=seed(env);assert.notEqual(result.status,0);
  assert.ok(result.stderr.includes('collides'));
  assert.equal(fingerprint(database),before);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM demo_seed_runs').get().n,0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM demo_seed_records').get().n,0);
  database.close();
});
