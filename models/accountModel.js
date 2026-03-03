// models/accountModel.js
const { dbGet, dbRun } = require("../helpers/db");
const { randomUUID } = require("crypto");

// --- helpers ---
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normText(s) {
  const t = String(s || "").trim();
  return t ? t : null;
}

function normRole(role) {
  if (!role) return "user";
  const r = String(role).trim().toLowerCase();
  return r === "admin" ? "admin" : "user";
}

// ====================== Queries ======================
async function getUserByEmail(email) {
  const em = normEmail(email);
  if (!em) return null;
  return dbGet(
    `SELECT *
       FROM account
      WHERE LOWER(email) = LOWER(?)
        AND is_deleted = 0
      LIMIT 1`,
    [em],
  );
}

/**
 * Tìm theo "username" logic mới (DB chỉ còn full_name):
 * - ưu tiên email
 * - hoặc khớp full_name
 */
async function findAccountByUsername(usernameOrEmail) {
  const q = String(usernameOrEmail || "")
    .trim()
    .toLowerCase();
  if (!q) return null;

  return dbGet(
    `SELECT *
       FROM account
      WHERE is_deleted = 0
        AND (
              LOWER(email) = ?
           OR LOWER(COALESCE(full_name, '')) = ?
        )
      LIMIT 1`,
    [q, q],
  );
}

async function getAccountById(accountId) {
  const accId = String(accountId || "").trim();
  if (!accId) return null;

  // 1) account
  const account = await dbGet(
    `SELECT *
       FROM account
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1`,
    [accId],
  );
  if (!account) return null;

  // 2) personal wallet (of this user)
  const personal_wallet = await dbGet(
    `SELECT id, type, owner_account_id, balance, created_at, updated_at
       FROM wallet_account
      WHERE type = 'PERSONAL'
        AND owner_account_id = ?
        AND deleted_at = 0
      LIMIT 1`,
    [accId],
  );

  // 3) company wallet (single)
  const company_wallet = await dbGet(
    `SELECT id, type, owner_account_id, balance, created_at, updated_at
       FROM wallet_account
      WHERE type = 'COMPANY'
        AND deleted_at = 0
      LIMIT 1`,
  );

  return {
    ...account,
    personal_wallet: personal_wallet.balance || null,
    company_wallet: company_wallet.balance || null,
  };
}

async function getEmailByAccountId(accountId) {
  const row = await dbGet(
    `SELECT email
       FROM account
      WHERE id = ?
        AND is_deleted = 0
      LIMIT 1`,
    [String(accountId)],
  );
  return row ? row.email : null;
}

// =================== Creates / Updates ===================
/**
 * Đăng ký nhanh (minimal).
 * Nhận: full_name, email, password_hash
 */
async function createUserMinimal({
  full_name,
  email,
  password_hash,
  role,
} = {}) {
  if (!email || !password_hash) {
    throw new Error("email and password_hash are required");
  }

  const id = randomUUID();
  const ts = nowSec();

  try {
    await dbRun(
      `INSERT INTO account (
        id, email, password, full_name, avatar_url, description,
        role, refresh_token, is_deleted,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normEmail(email),
        password_hash,
        normText(full_name),
        null,
        null,
        normRole(role),
        null,
        0,
        ts,
        ts,
        0,
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

/**
 * Tạo user (giữ signature gần với code cũ).
 * - fullName -> full_name
 * - hashedPassword -> password
 */
async function createUser({
  fullName,
  email,
  hashedPassword,
  role = "user",
  avatarUrl = null,
  description = null,
} = {}) {
  if (!email || !hashedPassword) {
    throw new Error("email and hashedPassword are required");
  }

  const id = randomUUID();
  const ts = nowSec();

  try {
    await dbRun(
      `INSERT INTO account (
        id, email, password, full_name, avatar_url, description,
        role, refresh_token, is_deleted,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        normEmail(email),
        hashedPassword,
        normText(fullName),
        avatarUrl != null ? String(avatarUrl) : null,
        description != null ? String(description) : null,
        normRole(role),
        null,
        0,
        ts,
        ts,
        0,
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

/** Partial update các trường hợp lệ */
async function updateAccountById(
  accountId,
  {
    email = undefined,
    full_name = undefined,
    avatar_url = undefined,
    description = undefined,
    role = undefined,
    is_deleted = undefined,
    refresh_token = undefined,
  } = {},
) {
  const sets = [];
  const params = [];
  const push = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (email !== undefined) push("email", normEmail(email));
  if (full_name !== undefined) push("full_name", normText(full_name));
  if (avatar_url !== undefined)
    push("avatar_url", avatar_url ? String(avatar_url) : null);
  if (description !== undefined)
    push("description", description ? String(description) : null);
  if (role !== undefined) push("role", normRole(role));
  if (refresh_token !== undefined) push("refresh_token", refresh_token || null);
  if (is_deleted !== undefined) {
    const del = is_deleted ? 1 : 0;
    push("is_deleted", del);
    push("deleted_at", del ? nowSec() : 0);
  }

  // luôn cập nhật updated_at (epoch seconds)
  push("updated_at", nowSec());

  if (sets.length === 1) return false; // chỉ có updated_at -> không làm gì

  params.push(String(accountId));

  const res = await dbRun(
    `UPDATE account
        SET ${sets.join(", ")}
      WHERE id = ?`,
    params,
  );
  return res.changes > 0;
}

async function saveRefreshToken(accountId, refreshToken) {
  const res = await dbRun(
    `UPDATE account
        SET refresh_token = ?, updated_at = ?
      WHERE id = ? AND is_deleted = 0`,
    [refreshToken || null, nowSec(), String(accountId)],
  );
  return res.changes > 0;
}

async function getRefreshTokenByUserId(accountId) {
  const row = await dbGet(
    `SELECT refresh_token
       FROM account
      WHERE id = ? AND is_deleted = 0
      LIMIT 1`,
    [String(accountId)],
  );
  return row ? row.refresh_token : null;
}

async function updatePasswordByAccountId(accountId, hashedPassword) {
  const res = await dbRun(
    `UPDATE account
        SET password = ?, updated_at = ?
      WHERE id = ? AND is_deleted = 0`,
    [hashedPassword, nowSec(), String(accountId)],
  );
  return res.changes > 0;
}

async function getPasswordHashByAccountId(accountId) {
  return dbGet(
    `SELECT password
       FROM account
      WHERE id = ? AND is_deleted = 0
      LIMIT 1`,
    [String(accountId)],
  );
}

async function updatePasswordByEmail(email, hashedPassword) {
  const em = normEmail(email);
  const res = await dbRun(
    `UPDATE account
        SET password = ?, updated_at = ?
      WHERE LOWER(email) = LOWER(?) AND is_deleted = 0`,
    [hashedPassword, nowSec(), em],
  );
  return res.changes > 0;
}

// =================== Projections ===================
async function getAccountSummaryById(accountId) {
  return dbGet(
    `SELECT id, email, full_name, avatar_url, role
       FROM account
      WHERE id = ? AND is_deleted = 0`,
    [String(accountId)],
  );
}

async function getAccountDetailsById(accountId) {
  return dbGet(
    `SELECT id, email, full_name, avatar_url, description, role,
            refresh_token, is_deleted,
            created_at, updated_at, deleted_at
       FROM account
      WHERE id = ? AND is_deleted = 0`,
    [String(accountId)],
  );
}

// =================== Exports ===================
module.exports = {
  // reads
  getUserByEmail,
  findAccountByUsername,
  getAccountById,
  getEmailByAccountId,
  getAccountSummaryById,
  getAccountDetailsById,

  // writes
  createUserMinimal,
  createUser,
  updateAccountById,
  saveRefreshToken,
  getRefreshTokenByUserId,
  getPasswordHashByAccountId,
  updatePasswordByAccountId,
  updatePasswordByEmail,
};
