const mysql = require('mysql2');
const db = mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'smart_apartment_management' });

async function run() {
  db.connect(err => { if (err) { console.error('DB connect error', err); process.exit(1); } });
  // find paid bills that have no payment_history
  const query = `SELECT b.id, b.amount, b.paid_at, b.created_at FROM bills b WHERE b.status = 'paid' AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_id = b.id)`;
  db.query(query, (err, rows) => {
    if (err) { console.error('Query failed', err); process.exit(1); }
    if (!rows || rows.length === 0) {
      console.log('No paid bills to migrate');
      process.exit(0);
    }
    console.log(`Migrating ${rows.length} paid bills to payment_history...`);
    let completed = 0;
    rows.forEach(r => {
      const paidAt = r.paid_at || r.created_at || new Date();
      db.query('INSERT INTO payment_history (bill_id, amount_paid, paid_at) VALUES (?, ?, ?)', [r.id, r.amount || 0, paidAt], (iErr) => {
        if (iErr) console.error('Insert failed for bill', r.id, iErr);
        completed++;
        if (completed === rows.length) {
          console.log('Migration complete');
          process.exit(0);
        }
      });
    });
  });
}

run();
