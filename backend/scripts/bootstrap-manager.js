const readline = require('readline');
const { bootstrapManager } = require('../services/managerBootstrap');
const db = require('../config/sqlite');

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run npm run db:bootstrap in an interactive terminal. Passwords are entered privately.');
  const connection = { query: async (sql, params=[]) => /^SELECT/i.test(sql) ? [[db.get(sql,params)]] : [db.run(sql,params)], end: async () => db.close() };
  let rl;
  try {
    const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM property_managers');
    if (row.total) throw new Error('Bootstrap refused: a manager already exists. Existing accounts were preserved.');
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const ask = prompt => new Promise(resolve => rl.question(prompt, resolve));
    const name = (await ask('Manager name: ')).trim();
    const email = (await ask('Manager email: ')).trim();
    process.stdout.write('Choose password (hidden, 12+ characters): ');
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = () => {};
    const password = await ask('');
    process.stdout.write('\nConfirm password (hidden): ');
    const confirm = await ask('');
    rl._writeToOutput = write;
    process.stdout.write('\n');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || Buffer.byteLength(password) > 72 || password !== confirm) throw new Error('Invalid name/email, password length, or confirmation. Nothing was created.');
    bootstrapManager(db, { name, email, password });
    console.log('Initial manager created. No password was logged.');
  } finally { if (rl) rl.close(); await connection.end(); }
}
main().catch(error => { console.error(error.code ? `Bootstrap failed (${error.code}). Check database setup.` : error.message); process.exitCode = 1; });
