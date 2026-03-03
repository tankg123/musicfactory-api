// models/walletAccountModel.js
const { dbGet, dbAll, dbRun, normalizePaging } = require("../helpers/db");
const { randomUUID } = require("crypto");

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normType(t) {
  const v = String(t || "")
    .trim()
    .toUpperCase();
  if (v === "COMPANY" || v === "PERSONAL") return v;
  return null;
}

// =============== CREATE (rarely used directly) ===============
async function createWalletAccount({
  type,
  owner_account_id = null,
  balance = 0,
} = {}) {
  const tp = normType(type);
  if (!tp) throw new Error("type must be COMPANY or PERSONAL");

  const id = randomUUID();
  const ts = nowSec();

  await dbRun(
    `INSERT INTO wallet_account (
      id, type, owner_account_id, balance,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      tp,
      owner_account_id ? String(owner_account_id) : null,
      Math.trunc(Number(balance) || 0),
      ts,
      ts,
    ],
  );

  return id;
}

// =============== READ ===============
async function getWalletById(id) {
  return dbGet(
    `SELECT id, type, owner_account_id, balance, created_at, updated_at, deleted_at
       FROM wallet_account
      WHERE id = ? AND deleted_at = 0
      LIMIT 1`,
    [String(id)],
  );
}

async function getCompanyWallet() {
  return dbGet(
    `SELECT id, type, owner_account_id, balance, created_at, updated_at
       FROM wallet_account
      WHERE type = 'COMPANY' AND deleted_at = 0
      LIMIT 1`,
  );
}

async function getPersonalWalletByAccountId(accountId) {
  return dbGet(
    `SELECT id, type, owner_account_id, balance, created_at, updated_at
       FROM wallet_account
      WHERE type = 'PERSONAL'
        AND owner_account_id = ?
        AND deleted_at = 0
      LIMIT 1`,
    [String(accountId)],
  );
}

// =============== ENSURE ===============
/**
 * Ensure the single COMPANY wallet exists, return wallet row.
 * Safe to call multiple times.
 */
async function ensureCompanyWallet({ initialBalance = 0 } = {}) {
  const existing = await getCompanyWallet();
  if (existing) return existing;

  const id = randomUUID();
  const ts = nowSec();

  // if you already created partial unique index for COMPANY, this still safe
  await dbRun(
    `INSERT INTO wallet_account (
      id, type, owner_account_id, balance, created_at, updated_at, deleted_at
    ) VALUES (?, 'COMPANY', NULL, ?, ?, ?, 0)`,
    [id, Math.trunc(Number(initialBalance) || 0), ts, ts],
  );

  return getCompanyWallet();
}

/**
 * Ensure the PERSONAL wallet for a given account exists, return wallet row.
 * Safe to call multiple times.
 */
async function ensurePersonalWallet(accountId, { initialBalance = 0 } = {}) {
  const accId = String(accountId || "").trim();
  if (!accId) throw new Error("accountId is required");

  const existing = await getPersonalWalletByAccountId(accId);
  if (existing) return existing;

  const id = randomUUID();
  const ts = nowSec();

  await dbRun(
    `INSERT INTO wallet_account (
      id, type, owner_account_id, balance, created_at, updated_at, deleted_at
    ) VALUES (?, 'PERSONAL', ?, ?, ?, ?, 0)`,
    [id, accId, Math.trunc(Number(initialBalance) || 0), ts, ts],
  );

  return getPersonalWalletByAccountId(accId);
}

// =============== LIST (pagination) ===============
/**
 * opts:
 *  page,pageSize
 *  type? ('COMPANY'|'PERSONAL')
 *  owner_account_id?
 *  includeDeleted? (default false)
 *  sortBy? ('created_at'|'updated_at'|'balance')
 *  sortDir? ('asc'|'desc')
 */
async function listWalletAccounts(opts = {}) {
  const {
    p: page,
    size: pageSize,
    offset,
  } = normalizePaging(opts.page, opts.pageSize);

  const where = [];
  const params = [];

  if (!opts.includeDeleted) {
    where.push(`w.deleted_at = 0`);
  }

  if (opts.type) {
    const tp = normType(opts.type);
    if (!tp) throw new Error("type filter must be COMPANY or PERSONAL");
    where.push(`w.type = ?`);
    params.push(tp);
  }

  if (opts.owner_account_id) {
    where.push(`w.owner_account_id = ?`);
    params.push(String(opts.owner_account_id));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sortByRaw = String(opts.sortBy || "created_at").toLowerCase();
  const sortDir =
    String(opts.sortDir || "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const sortBy =
    sortByRaw === "balance"
      ? "w.balance"
      : sortByRaw === "updated_at"
        ? "w.updated_at"
        : "w.created_at";

  // Join account for admin display convenience (optional but handy)
  const rows = await dbAll(
    `
    SELECT
      w.id, w.type, w.owner_account_id, w.balance, w.created_at, w.updated_at, w.deleted_at,
      a.email AS owner_email,
      a.full_name AS owner_full_name,
      a.avatar_url AS owner_avatar_url
    FROM wallet_account w
    LEFT JOIN account a ON a.id = w.owner_account_id
    ${whereSql}
    ORDER BY ${sortBy} ${sortDir}, w.id ${sortDir}
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  const countRow = await dbGet(
    `SELECT COUNT(*) AS total FROM wallet_account w ${whereSql}`,
    params,
  );

  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data: rows,
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

// =============== UPDATE ===============
/**
 * Update display/ownership (rare).
 * allowed: owner_account_id, deleted_at (soft), type (avoid changing normally), balance (admin override)
 */
async function updateWalletAccount(walletId, payload = {}) {
  const id = String(walletId || "").trim();
  if (!id) throw new Error("Invalid walletId");

  const sets = [];
  const params = [];
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  const push = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (hasOwn("type")) {
    const tp = normType(payload.type);
    if (!tp) throw new Error("type must be COMPANY or PERSONAL");
    push("type", tp);
  }
  if (hasOwn("owner_account_id")) {
    push(
      "owner_account_id",
      payload.owner_account_id ? String(payload.owner_account_id) : null,
    );
  }
  if (hasOwn("balance")) {
    const b = Number(payload.balance);
    if (!Number.isFinite(b)) throw new Error("balance must be a number");
    push("balance", Math.trunc(b));
  }
  if (hasOwn("deleted_at")) {
    const v = Number(payload.deleted_at) || 0;
    push("deleted_at", v);
  }

  push("updated_at", nowSec());
  if (sets.length === 1) return false;

  params.push(id);

  const res = await dbRun(
    `UPDATE wallet_account SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return res.changes > 0;
}

// =============== SOFT DELETE / RESTORE ===============
async function deleteWalletAccount(walletId) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE wallet_account SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, String(walletId)],
  );
  return res.changes > 0;
}

async function restoreWalletAccount(walletId) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE wallet_account SET deleted_at = 0, updated_at = ? WHERE id = ?`,
    [ts, String(walletId)],
  );
  return res.changes > 0;
}

module.exports = {
  // create/read
  createWalletAccount,
  getWalletById,
  getCompanyWallet,
  getPersonalWalletByAccountId,

  // ensure
  ensureCompanyWallet,
  ensurePersonalWallet,

  // list/update/delete
  listWalletAccounts,
  updateWalletAccount,
  deleteWalletAccount,
  restoreWalletAccount,
};
