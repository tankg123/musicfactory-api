// models/adminModel.js
// Updated for current schema: account table is minimal, TEXT id (UUID), epoch seconds timestamps
const {
  dbAll,
  dbGet,
  dbRun,
  normalizePaging,
  escapeLike,
} = require("../helpers/db");
const { randomUUID } = require("crypto");
const { makeFileUrl } = require("../utils/url");

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function lc(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function normRole(role) {
  if (!role) return "user";
  const r = String(role).trim().toLowerCase();
  return r === "admin" ? "admin" : "user";
}

// =============== CREATE ===============
/**
 * payload:
 * { email, password (hashed), full_name?, avatar_url?, description?, role? }
 */
async function createAccount(payload = {}) {
  const {
    email,
    password,
    full_name = null,
    avatar_url = null,
    description = null,
    role = "user",
  } = payload;
  if (!email || !password) throw new Error("email and password are required");

  const id = randomUUID();
  const ts = nowSec();
  console.log(role);
  try {
    await dbRun(
      `INSERT INTO account (
        id, email, password, full_name, avatar_url, description,
        role, refresh_token, is_deleted,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 0)`,
      [
        id,
        lc(email),
        password,
        full_name != null ? String(full_name).trim() : null,
        avatar_url != null ? String(avatar_url) : null,
        description != null ? String(description) : null,
        normRole(role),
        ts,
        ts,
      ],
    );
    return id;
  } catch (err) {
    if (String(err.code || "").includes("SQLITE_CONSTRAINT")) {
      throw new Error("Email already exists");
    }
    throw err;
  }
}

// =============== READ ===============
async function readAccountById(accountId) {
  const row = await dbGet(
    `SELECT
       id, email, full_name, avatar_url, description,
       role, refresh_token, is_deleted,
       created_at, updated_at, deleted_at
     FROM account
     WHERE id = ?`,
    [String(accountId)],
  );
  return row || null;
}

/**
 * List accounts with filters & pagination.
 * opts: {
 *   excludeAccountId?, page=1, pageSize=20,
 *   q?, role?, deleted?
 * }
 */
async function listAccounts(opts = {}) {
  const {
    p: page,
    size: pageSize,
    offset,
  } = normalizePaging(opts.page, opts.pageSize);

  const where = [];
  const params = [];

  if (opts.excludeAccountId) {
    where.push(`a.id <> ?`);
    params.push(String(opts.excludeAccountId));
  }

  if (typeof opts.role === "string" && opts.role.trim()) {
    where.push(`a.role = ?`);
    params.push(normRole(opts.role));
  }

  if (typeof opts.deleted === "boolean") {
    where.push(`a.is_deleted = ?`);
    params.push(opts.deleted ? 1 : 0);
  }

  // search
  if (opts.q && String(opts.q).trim()) {
    const esc = escapeLike(String(opts.q).trim());
    const kw = `%${esc}%`;
    where.push(`
      (
        LOWER(a.email)       LIKE LOWER(?) ESCAPE '\\' OR
        LOWER(COALESCE(a.full_name,'')) LIKE LOWER(?) ESCAPE '\\' OR
        LOWER(a.role)        LIKE LOWER(?) ESCAPE '\\' OR
        LOWER(COALESCE(a.description,'')) LIKE LOWER(?) ESCAPE '\\'
      )
    `);
    params.push(kw, kw, kw, kw);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await dbAll(
    `
    SELECT
      a.id, a.email, a.full_name, a.avatar_url, a.description,
      a.role, a.is_deleted,
      a.created_at, a.updated_at, a.deleted_at,

      -- personal wallet mapping
      w.id      AS personal_wallet_id,
      w.balance AS personal_balance

    FROM account a
    LEFT JOIN wallet_account w
      ON w.owner_account_id = a.id
     AND w.type = 'PERSONAL'
     AND w.deleted_at = 0

    ${whereSql}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  const processedRows = rows.map((row) => ({
    ...row,
    avatar_url: row.avatar_url ? makeFileUrl(row.avatar_url) : null,
    personal_balance:
      row.personal_balance === null || row.personal_balance === undefined
        ? 0
        : Number(row.personal_balance),
  }));

  const countRow = await dbGet(
    `
    SELECT COUNT(*) AS total
    FROM account a
    ${whereSql}
    `,
    params,
  );

  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data: processedRows,
    meta: {
      total,
      page,
      pageSize,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
  };
}
// =============== UPDATE (partial) ===============
/**
 * payload fields allowed:
 * email, password (hashed), full_name, avatar_url, description, role, refresh_token, is_deleted
 */
async function updateAccount(accountId, payload = {}) {
  const id = String(accountId || "");
  if (!id) throw new Error("Invalid accountId");

  const sets = [];
  const params = [];
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  const push = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (hasOwn("email")) push("email", payload.email ? lc(payload.email) : null);
  if (hasOwn("full_name"))
    push(
      "full_name",
      payload.full_name != null ? String(payload.full_name).trim() : null,
    );
  if (hasOwn("avatar_url"))
    push(
      "avatar_url",
      payload.avatar_url != null ? String(payload.avatar_url) : null,
    );
  if (hasOwn("description"))
    push(
      "description",
      payload.description != null ? String(payload.description) : null,
    );
  if (hasOwn("role")) push("role", normRole(payload.role));

  if (hasOwn("password") && payload.password != null) {
    push("password", payload.password); // hashed
  }

  if (hasOwn("refresh_token")) {
    push("refresh_token", payload.refresh_token || null);
  }

  if (hasOwn("is_deleted")) {
    const del = payload.is_deleted ? 1 : 0;
    push("is_deleted", del);
    push("deleted_at", del ? nowSec() : 0);
  }

  // always updated_at
  push("updated_at", nowSec());

  if (sets.length === 1) return false; // only updated_at

  params.push(id);

  try {
    const res = await dbRun(
      `UPDATE account SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
    return res.changes > 0;
  } catch (err) {
    if (String(err.code || "").includes("SQLITE_CONSTRAINT")) {
      throw new Error("Email already exists");
    }
    throw err;
  }
}

// =============== STATE HELPERS ===============
async function setRole(accountId, role) {
  const res = await dbRun(
    `UPDATE account SET role = ?, updated_at = ? WHERE id = ?`,
    [normRole(role), nowSec(), String(accountId)],
  );
  return res.changes > 0;
}

async function deleteAccount(accountId) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE account SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, String(accountId)],
  );
  return res.changes > 0;
}

async function restoreAccount(accountId) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE account SET is_deleted = 0, deleted_at = 0, updated_at = ? WHERE id = ?`,
    [ts, String(accountId)],
  );
  return res.changes > 0;
}

async function hardDeleteAccount(accountId) {
  const res = await dbRun(`DELETE FROM account WHERE id = ?`, [
    String(accountId),
  ]);
  return res.changes > 0;
}

// =============== EXPORTS ===============
module.exports = {
  // create
  createAccount,

  // read/list
  readAccountById,
  listAccounts,

  // update
  updateAccount,
  setRole,

  // delete
  deleteAccount,
  restoreAccount,
  hardDeleteAccount,
};
