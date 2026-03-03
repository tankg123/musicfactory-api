const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.join(__dirname, "../../data/database_expense.db");
const createAccountsTable = require("./tables/createAccountsTable");
const createCategoriesTable = require("./tables/createCategoriesTable");
const createTransactionsTable = require("./tables/createTransactionsTable");
const createWalletAccountsTable = require("./tables/createWalletAccountsTable");

const insertDefaultAdminAccount = require("./insertDefaultAdmin");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      (async () => {
        try {
          // 2) Tạo bảng cho môi trường mới/thiếu bảng
          createAccountsTable(db);

          createCategoriesTable(db);
          createTransactionsTable(db);
          createWalletAccountsTable(db);
          // insert default data to db
          insertDefaultAdminAccount(db);
          resolve();
        } catch (e) {
          reject(e);
        }
      })();
    });
  });
}

module.exports = { db, initializeDatabase };
