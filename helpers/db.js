const { db } = require("../database");

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

function normalizePaging(page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (p - 1) * size;
  return { p, size, offset };
}

function escapeLike(s) {
  return String(s).replace(/[%_\\]/g, (m) => "\\" + m);
}

module.exports = {
  dbRun,
  dbGet,
  dbAll,
  normalizePaging,
  escapeLike,
};
