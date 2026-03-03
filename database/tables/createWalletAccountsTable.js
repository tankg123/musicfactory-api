// createWalletAccountsTable.js
module.exports = function createWalletAccountsTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS wallet_account (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('COMPANY','PERSONAL')),
      owner_account_id TEXT, -- null if COMPANY, else FK -> account.id

      balance INTEGER NOT NULL DEFAULT 0, -- can be negative

      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      deleted_at INTEGER NOT NULL DEFAULT 0,

      FOREIGN KEY (owner_account_id) REFERENCES account(id)
    )`,
    (err) => {
      if (err)
        console.error("Error creating wallet_account table:", err.message);
      else console.log("wallet_account table created or already exists.");
    },
  );

  // Only 1 COMPANY wallet account
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_account_one_company
     ON wallet_account(type)
     WHERE type = 'COMPANY'`,
  );

  // Each user(account) has only 1 PERSONAL wallet
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_account_one_personal_per_user
     ON wallet_account(owner_account_id)
     WHERE type = 'PERSONAL'`,
  );

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_wallet_account_owner
     ON wallet_account(owner_account_id)`,
  );

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_wallet_account_type
     ON wallet_account(type)`,
  );
};
