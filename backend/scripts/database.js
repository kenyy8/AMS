const db=require('../config/sqlite');
try {
  db.migrate();
  const integrity=db.get('PRAGMA integrity_check');
  const foreign=db.all('PRAGMA foreign_key_check');
  if(integrity.integrity_check!=='ok'||foreign.length)throw new Error('Integrity check failed');
  console.log('[database] SQLite schema migrations, integrity, and foreign keys verified.');
  for(const table of ['property_managers','apartments','tenants','bills','payment_history','meter_devices','meter_history','settings']) console.log(table+': '+db.get('SELECT COUNT(*) AS n FROM '+table).n);
} catch(error) { console.error(error.message); process.exitCode=1; } finally { db.close(); }
