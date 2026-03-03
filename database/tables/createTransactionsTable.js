// createTransactionsTable.js
module.exports = function createTransactionsTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS txn (
      id TEXT PRIMARY KEY,

      wallet_account_id TEXT NOT NULL,       
      type TEXT NOT NULL CHECK (type IN ('TOPUP','EXPENSE')),
      amount INTEGER NOT NULL CHECK (amount > 0),

      created_by_account_id TEXT NOT NULL,
      category_id TEXT,

      description TEXT,
      txn_date TEXT NOT NULL,
      receipt_url TEXT,

      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      deleted_at INTEGER NOT NULL DEFAULT 0,

      FOREIGN KEY (wallet_account_id) REFERENCES wallet_account(id),
      FOREIGN KEY (created_by_account_id) REFERENCES account(id),
      FOREIGN KEY (category_id) REFERENCES category(id)
    )`,
    (err) => {
      if (err) console.error("Error creating txn table:", err.message);
      else console.log("txn table created or already exists.");
    },
  );

  db.run(`CREATE INDEX IF NOT EXISTS idx_txn_date ON txn(txn_date)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_txn_wallet_date ON txn(wallet_account_id, txn_date)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_txn_creator_date ON txn(created_by_account_id, txn_date)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_txn_category_date ON txn(category_id, txn_date)`,
  );
};
