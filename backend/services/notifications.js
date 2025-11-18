const db = require('../config/db');
const nodemailer = require('nodemailer');

async function createNotification({ tenant_id, property_manager_id = null, type, title, message }) {
  await db.query(
    'INSERT INTO notifications (tenant_id, property_manager_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
    [tenant_id, property_manager_id, type, title, message]
  );
}

async function notifyOverdueBills() {
  const [overdues] = await db.query(
    `SELECT b.id as bill_id, b.amount, b.due_date, t.id as tenant_id, t.email, t.name
     FROM bills b
     JOIN tenants t ON b.tenant_id = t.id
     WHERE b.status = 'overdue'`
  );
  if (overdues.length === 0) return;

  const transporter = nodemailer.createTransport({ jsonTransport: true });
    const message = `Dear ${o.name}, your ${o.amount} bill was due on ${new Date(o.due_date).toLocaleDateString()}. Please settle as soon as possible.`;
    await createNotification({ tenant_id: o.tenant_id, type: 'overdue', title, message });

    const message = `Dear ${o.name}, your ${o.amount} bill was due on ${new Date(o.due_date).toLocaleDateString()}. Please settle as soon as possible.`;
  }
}
    await transporter.sendMail({ to: o.email, subject: title, text: message });