// createCategoriesTable.js
module.exports = function createCategoriesTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS category (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),

      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      deleted_at INTEGER NOT NULL DEFAULT 0
    )`,
    (err) => {
      if (err) console.error("Error creating category table:", err.message);
      else console.log("category table created or already exists.");
    },
  );

  db.run(`CREATE INDEX IF NOT EXISTS idx_category_name ON category(name)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_category_active ON category(is_active, deleted_at)`,
  );
};
