const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "../../data/database_revenue.db");
const db = new sqlite3.Database(dbPath);

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function hasColumn(table, col) {
  const rows = await all(`PRAGMA table_info(${table});`);
  return rows.some((r) => r.name === col);
}
async function sqliteVersion() {
  const row = await get(`SELECT sqlite_version() AS v;`);
  return row?.v || "3.0.0";
}
function verGte(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

async function main() {
  console.log("[migrate] DB =", dbPath);
  const table = "fetch_state";
  const oldCol = "last_channel_daily_fetched";
  const newCol = "last_fetched_day_utc";

  const tableInfo = await all(`PRAGMA table_info(${table});`);
  if (!tableInfo.length) {
    console.log(`[migrate] table "${table}" not found. Skip.`);
    return;
  }

  const hasNew = await hasColumn(table, newCol);
  const hasOld = await hasColumn(table, oldCol);

  if (hasNew && !hasOld) {
    console.log(
      `[migrate] already OK: column "${newCol}" exists, "${oldCol}" not found.`
    );
    return;
  }

  // Nếu đã có cả 2 cột: chỉ cần backfill nếu null
  if (hasNew && hasOld) {
    console.log(
      `[migrate] both columns exist → backfill & keep only new col in code.`
    );
    await run(
      `UPDATE ${table} SET ${newCol} = ${oldCol} WHERE ${newCol} IS NULL;`
    );
    console.log(
      `[migrate] backfill done. You can later rebuild table to drop "${oldCol}" if muốn sạch schema.`
    );
    return;
  }

  const v = await sqliteVersion();
  console.log("[migrate] sqlite_version =", v);

  // Nếu có support RENAME COLUMN (>=3.25.0) → rename thẳng
  if (!hasNew && hasOld && verGte(v, "3.25.0")) {
    console.log(
      `[migrate] trying ALTER TABLE RENAME COLUMN ${oldCol} TO ${newCol} ...`
    );
    try {
      await run(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol};`);
      console.log("[migrate] rename column OK.");
      return;
    } catch (err) {
      console.warn("[migrate] rename failed, will fallback:", err.message);
    }
  }

  // Fallback: ADD COLUMN + backfill (không drop cột cũ)
  if (!hasNew) {
    console.log(
      `[migrate] fallback: ADD COLUMN ${newCol} & backfill from ${oldCol}`
    );
    await run(`ALTER TABLE ${table} ADD COLUMN ${newCol} INTEGER;`);
  }
  if (hasOld) {
    await run(
      `UPDATE ${table} SET ${newCol} = ${oldCol} WHERE ${newCol} IS NULL;`
    );
  }
  console.log(
    "[migrate] fallback completed. Code will only use new column; old column có thể bỏ qua."
  );
}

main()
  .then(() => {
    console.log("[migrate] done.");
    db.close();
  })
  .catch((e) => {
    console.error("[migrate] error:", e);
    db.close();
    process.exit(1);
  });
