const db = require('./sqlite');
module.exports = {
  ...db,
  query: async (sql, params = []) => {
    const statement = sql.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP').replace(/CURDATE\(\)/gi, "date('now')").replace(/"([^"\n]*)"/g, "'$1'");
    if (/^\s*(?:CREATE|ALTER|DROP|TRUNCATE)/i.test(statement)) throw new Error('Use versioned SQLite migrations for schema changes.');
    return /^\s*(SELECT|WITH|PRAGMA)/i.test(statement) ? [db.all(statement, params)] : [db.run(statement, params)];
  },
  end: async () => {}
};
