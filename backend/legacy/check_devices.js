const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'smart_apartment_management'
});

db.connect(err => {
  if (err) return console.error('DB connect err', err);
  db.query('SELECT * FROM meter_devices LIMIT 20', (e, rows) => {
    if (e) console.error('Query error', e);
    else console.log('devices rows:', rows);
    db.end();
  });
});
