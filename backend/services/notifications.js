const db = require('../config/sqlite');
async function createNotification({tenant_id,property_manager_id=null,type,title,message}) {
  return db.run('INSERT INTO notifications(tenant_id,property_manager_id,type,title,message) VALUES (?,?,?,?,?)',[tenant_id,property_manager_id,type,title,message]);
}
// No mail transport or recurring jobs are configured by default.
module.exports = { createNotification };
