// createAccountsTable.js
module.exports = function createAccountsTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT,
      avatar_url TEXT,
      description TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin','user')),
      refresh_token TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      deleted_at INTEGER NOT NULL DEFAULT 0
    )`,
    (err) => {
      if (err) console.error("Error creating account table:", err.message);
      else console.log("account table created or already exists.");
    },
  );

  db.run(`CREATE INDEX IF NOT EXISTS idx_account_email ON account(email)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_account_role_deleted ON account(role, is_deleted)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_account_created ON account(created_at DESC)`,
  );
};
