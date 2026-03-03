// src/models/helpers/id.js
const crypto = require("crypto");

// --- Promise helpers cho sqlite3 callback API ---
const getAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const runAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

// --- Chống SQL injection cho tên bảng/cột ---
const SAFE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name) {
  if (!SAFE_IDENT_RE.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return `"${name}"`; // thêm quote cho an toàn
}

// --- Sinh UUID v4 bằng Node crypto ---
function newUuid() {
  return crypto.randomUUID();
}

/**
 * generateDbUUID:
 *  - Sinh UUID và kiểm tra trước trong table.column.
 *  - Nên dùng insertWithUuid để loại race-condition triệt để (retry khi dính UNIQUE).
 */
async function generateDbUUID(
  db,
  table,
  column = "id",
  { prefix = "", maxTries = 5 } = {}
) {
  const t = ident(table);
  const c = ident(column);

  for (let i = 0; i < maxTries; i++) {
    const raw = newUuid();
    const id = prefix ? `${prefix}${raw}` : raw;
    const row = await getAsync(
      db,
      `SELECT 1 FROM ${t} WHERE ${c} = ? LIMIT 1`,
      [id]
    );
    if (!row) return id;
  }
  throw new Error(
    `Unable to generate unique UUID for ${table}.${column} after ${maxTries} attempts`
  );
}

/**
 * insertWithUuid:
 *  - Tự sinh UUID và INSERT.
 *  - Nếu hi hữu bị trùng PRIMARY KEY/UNIQUE, sẽ tự retry sinh UUID khác.
 *  - Đây là cách an toàn khi có nhiều tiến trình/worker cùng ghi.
 */
async function insertWithUuid(
  db,
  table,
  data,
  { idColumn = "id", prefix = "", maxTries = 5 } = {}
) {
  const t = ident(table);
  const cId = ident(idColumn);

  const cols = Object.keys(data).map(ident);
  const vals = Object.values(data);

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const id = prefix ? `${prefix}${newUuid()}` : newUuid();
    const allCols = [cId, ...cols].join(", ");
    const placeholders = Array(vals.length + 1)
      .fill("?")
      .join(", ");
    const sql = `INSERT INTO ${t} (${allCols}) VALUES (${placeholders})`;

    try {
      await runAsync(db, sql, [id, ...vals]);
      return id; // thành công
    } catch (err) {
      // Retry nếu là lỗi UNIQUE/PRIMARY KEY (trùng id cực hi hữu)
      if (String(err.code).includes("SQLITE_CONSTRAINT")) continue;
      throw err; // lỗi khác thì ném ra luôn
    }
  }

  throw new Error(
    `Failed to insert into ${table} after ${maxTries} UUID attempts`
  );
}

module.exports = {
  newUuid,
  generateDbUUID,
  insertWithUuid,
  getAsync,
  runAsync,
};
