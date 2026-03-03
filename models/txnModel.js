// models/txnModel.js
const {
  dbGet,
  dbAll,
  dbRun,
  normalizePaging,
  escapeLike,
} = require("../helpers/db");
const { randomUUID } = require("crypto");
const { makeFileUrl } = require("../utils/url");

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normType(t) {
  const v = String(t || "")
    .trim()
    .toUpperCase();
  if (v === "TOPUP" || v === "EXPENSE") return v;
  return null;
}

function normDateYYYYMMDD(s) {
  const v = String(s ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function signedAmount(type, amount) {
  // amount is positive integer
  return type === "TOPUP" ? amount : -amount;
}

async function withTx(fn) {
  await dbRun("BEGIN");
  try {
    const res = await fn();
    await dbRun("COMMIT");
    return res;
  } catch (e) {
    await dbRun("ROLLBACK");
    throw e;
  }
}

async function applyBalanceDelta(walletAccountId, delta) {
  // delta can be +/- integer
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE wallet_account
        SET balance = balance + ?,
            updated_at = ?
      WHERE id = ? AND deleted_at = 0`,
    [delta, ts, String(walletAccountId)],
  );
  if (res.changes === 0) throw new Error("wallet_account not found");
}

async function getTxnRowForUpdate(txnId) {
  const row = await dbGet(
    `SELECT *
       FROM txn
      WHERE id = ?
      LIMIT 1`,
    [String(txnId)],
  );
  return row || null;
}

// =================== CREATE ===================
/**
 * payload:
 * { wallet_account_id, type ('TOPUP'|'EXPENSE'), amount (>0),
 *   created_by_account_id, category_id?, description?, txn_date ('YYYY-MM-DD'), receipt_url?
 * }
 */
async function resolveWalletAccountId(wallet_kind, created_by_account_id) {
  const kind = String(wallet_kind || "")
    .trim()
    .toUpperCase();
  const accId = String(created_by_account_id || "").trim();
  if (!accId) throw new Error("created_by_account_id is required");
  if (kind !== "COMPANY" && kind !== "PERSONAL") {
    throw new Error("wallet_kind must be COMPANY or PERSONAL");
  }

  if (kind === "COMPANY") {
    const row = await dbGet(
      `SELECT id
         FROM wallet_account
        WHERE type = 'COMPANY' AND deleted_at = 0
        LIMIT 1`,
    );
    if (!row) throw new Error("Company wallet not found");
    return row.id;
  }

  // PERSONAL
  const row = await dbGet(
    `SELECT id
       FROM wallet_account
      WHERE type = 'PERSONAL'
        AND owner_account_id = ?
        AND deleted_at = 0
      LIMIT 1`,
    [accId],
  );
  if (!row) throw new Error("Personal wallet not found");
  return row.id;
}
async function createTxn(payload = {}) {
  const created_by_account_id = String(
    payload.created_by_account_id || "",
  ).trim();
  const wallet_kind = String(payload.wallet_kind || "").trim(); // NEW
  const type = normType(payload.type);
  const amount = Number(payload.amount);
  const txn_date = normDateYYYYMMDD(payload.txn_date);

  if (!created_by_account_id)
    throw new Error("created_by_account_id is required");
  if (!wallet_kind) throw new Error("wallet_kind is required");
  if (!type) throw new Error("type must be TOPUP or EXPENSE");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("amount must be > 0");
  if (!txn_date) throw new Error("txn_date must be YYYY-MM-DD");

  // resolve wallet_account_id from user's choice
  const wallet_account_id = await resolveWalletAccountId(
    wallet_kind,
    created_by_account_id,
  );

  const id = randomUUID();
  const ts = nowSec();
  const amt = Math.trunc(amount);
  const delta = signedAmount(type, amt);

  return withTx(async () => {
    await dbRun(
      `INSERT INTO txn (
        id, wallet_account_id, type, amount,
        created_by_account_id, category_id,
        description, txn_date, receipt_url,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        wallet_account_id,
        type,
        amt,
        created_by_account_id,
        payload.category_id ? String(payload.category_id) : null,
        payload.description != null ? String(payload.description) : null,
        txn_date,
        payload.receipt_url != null ? String(payload.receipt_url) : null,
        ts,
        ts,
      ],
    );

    await applyBalanceDelta(wallet_account_id, delta);
    return id;
  });
}

// =================== READ ===================
async function getTxnById(txnId) {
  return dbGet(
    `SELECT
       t.*,
       CASE WHEN t.type='TOPUP' THEN t.amount ELSE -t.amount END AS signed_amount,
       CASE WHEN t.type='TOPUP' THEN 'CREDIT' ELSE 'DEBIT' END AS direction,
       a.id AS actor_id, a.email AS actor_email, a.full_name AS actor_full_name, a.avatar_url AS actor_avatar_url
     FROM txn t
     JOIN account a ON a.id = t.created_by_account_id
    WHERE t.id = ? AND t.deleted_at = 0
    LIMIT 1`,
    [String(txnId)],
  );
}

// =================== LIST (paging + sort + actor) ===================
/**
 * opts:
 *  page,pageSize
 *  wallet_account_id?, created_by_account_id?, category_id?, type?
 *  fromDate?, toDate? (YYYY-MM-DD)
 *  q?
 *  sortBy: created_at|txn_date|amount|signed_amount|type
 *  sortDir: asc|desc
 */
async function listTxns(opts = {}) {
  const {
    p: page,
    size: pageSize,
    offset,
  } = normalizePaging(opts.page, opts.pageSize);

  const where = [`t.deleted_at = 0`];
  const params = [];

  if (opts.wallet_account_id) {
    where.push(`t.wallet_account_id = ?`);
    params.push(String(opts.wallet_account_id));
  }
  if (opts.created_by_account_id) {
    where.push(`t.created_by_account_id = ?`);
    params.push(String(opts.created_by_account_id));
  }
  if (opts.category_id) {
    where.push(`t.category_id = ?`);
    params.push(String(opts.category_id));
  }
  if (opts.type) {
    const tp = normType(opts.type);
    if (!tp) throw new Error("type filter must be TOPUP or EXPENSE");
    where.push(`t.type = ?`);
    params.push(tp);
  }

  const fromDate = opts.fromDate ? normDateYYYYMMDD(opts.fromDate) : null;
  const toDate = opts.toDate ? normDateYYYYMMDD(opts.toDate) : null;
  if (opts.fromDate && !fromDate)
    throw new Error("fromDate must be YYYY-MM-DD");
  if (opts.toDate && !toDate) throw new Error("toDate must be YYYY-MM-DD");

  if (fromDate && toDate) {
    where.push(`t.txn_date BETWEEN ? AND ?`);
    params.push(fromDate, toDate);
  } else if (fromDate) {
    where.push(`t.txn_date >= ?`);
    params.push(fromDate);
  } else if (toDate) {
    where.push(`t.txn_date <= ?`);
    params.push(toDate);
  }

  if (opts.q && String(opts.q).trim()) {
    const kw = `%${escapeLike(String(opts.q).trim())}%`;
    where.push(`
      (
        LOWER(COALESCE(t.description,'')) LIKE LOWER(?) ESCAPE '\\' OR
        LOWER(COALESCE(t.receipt_url,'')) LIKE LOWER(?) ESCAPE '\\'
      )
    `);
    params.push(kw, kw);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const sortByRaw = String(opts.sortBy || "created_at").toLowerCase();
  const sortDir =
    String(opts.sortDir || "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const sortBy =
    sortByRaw === "txn_date"
      ? "t.txn_date"
      : sortByRaw === "amount"
        ? "t.amount"
        : sortByRaw === "type"
          ? "t.type"
          : sortByRaw === "signed_amount"
            ? `CASE WHEN t.type='TOPUP' THEN t.amount ELSE -t.amount END`
            : "t.created_at";

  const rows = await dbAll(
    `SELECT
       t.*,
       CASE WHEN t.type='TOPUP' THEN t.amount ELSE -t.amount END AS signed_amount,
       CASE WHEN t.type='TOPUP' THEN 'CREDIT' ELSE 'DEBIT' END AS direction,

       a.id AS actor_id,
       a.email AS actor_email,
       a.full_name AS actor_full_name,
       a.avatar_url AS actor_avatar_url,

       c.name AS category_name,

       w.type AS wallet_type

     FROM txn t
     JOIN account a ON a.id = t.created_by_account_id

     LEFT JOIN category c
       ON c.id = t.category_id
      AND c.deleted_at = 0

     LEFT JOIN wallet_account w
       ON w.id = t.wallet_account_id
      AND w.deleted_at = 0

     ${whereSql}
     ORDER BY ${sortBy} ${sortDir}, t.id ${sortDir}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const countRow = await dbGet(
    `SELECT COUNT(*) AS total
       FROM txn t
       JOIN account a ON a.id = t.created_by_account_id
       LEFT JOIN category c
         ON c.id = t.category_id
        AND c.deleted_at = 0
       LEFT JOIN wallet_account w
         ON w.id = t.wallet_account_id
        AND w.deleted_at = 0
      ${whereSql}`,
    params,
  );
  const processedRows = rows.map((row) => ({
    ...row,
    actor_avatar_url: row.actor_avatar_url
      ? makeFileUrl(row.actor_avatar_url)
      : null,
    receipt_url: row.receipt_url ? makeFileUrl(row.receipt_url) : null,
  }));
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

// =================== UPDATE (FULL – reconcile balance) ===================
/**
 * payload allowed: { wallet_account_id?, type?, amount?, category_id?, description?, txn_date?, receipt_url? }
 * - Nếu txn đã deleted (deleted_at != 0) => không cho update (đỡ rối balance).
 */
async function updateTxn(txnId, payload = {}) {
  const id = String(txnId || "").trim();
  if (!id) throw new Error("Invalid txnId");

  return withTx(async () => {
    const old = await getTxnRowForUpdate(id);
    if (!old) throw new Error("txn not found");
    if (Number(old.deleted_at || 0) !== 0)
      throw new Error("Cannot update a deleted txn");

    const newWalletId = Object.prototype.hasOwnProperty.call(
      payload,
      "wallet_account_id",
    )
      ? String(payload.wallet_account_id || "").trim()
      : String(old.wallet_account_id);

    const newType = Object.prototype.hasOwnProperty.call(payload, "type")
      ? normType(payload.type)
      : String(old.type);

    const newAmount = Object.prototype.hasOwnProperty.call(payload, "amount")
      ? Number(payload.amount)
      : Number(old.amount);

    if (!newWalletId) throw new Error("wallet_account_id is required");
    if (!newType) throw new Error("type must be TOPUP or EXPENSE");
    if (!Number.isFinite(newAmount) || newAmount <= 0)
      throw new Error("amount must be > 0");

    const amtInt = Math.trunc(newAmount);

    // txn_date validate if provided
    let newTxnDate = old.txn_date;
    if (Object.prototype.hasOwnProperty.call(payload, "txn_date")) {
      const d = normDateYYYYMMDD(payload.txn_date);
      if (!d) throw new Error("txn_date must be YYYY-MM-DD");
      newTxnDate = d;
    }

    // 1) Reverse old effect
    const oldDelta = signedAmount(String(old.type), Number(old.amount));
    // remove old => apply -oldDelta to old wallet
    await applyBalanceDelta(String(old.wallet_account_id), -oldDelta);

    // 2) Apply new effect
    const newDelta = signedAmount(newType, amtInt);
    await applyBalanceDelta(newWalletId, newDelta);

    // 3) Update txn row
    const ts = nowSec();

    const sets = [];
    const params = [];
    const push = (col, val) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };

    push("wallet_account_id", newWalletId);
    push("type", newType);
    push("amount", amtInt);

    if (Object.prototype.hasOwnProperty.call(payload, "category_id")) {
      push(
        "category_id",
        payload.category_id ? String(payload.category_id) : null,
      );
    }
    if (Object.prototype.hasOwnProperty.call(payload, "description")) {
      push(
        "description",
        payload.description != null ? String(payload.description) : null,
      );
    }
    if (Object.prototype.hasOwnProperty.call(payload, "receipt_url")) {
      push(
        "receipt_url",
        payload.receipt_url != null ? String(payload.receipt_url) : null,
      );
    }
    push("txn_date", newTxnDate);

    push("updated_at", ts);

    params.push(id);

    const res = await dbRun(
      `UPDATE txn SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
    return res.changes > 0;
  });
}

// =================== DELETE / RESTORE ===================
async function deleteTxn(txnId) {
  const id = String(txnId || "").trim();
  if (!id) throw new Error("Invalid txnId");

  return withTx(async () => {
    const row = await getTxnRowForUpdate(id);
    if (!row) throw new Error("txn not found");
    if (Number(row.deleted_at || 0) !== 0) return false; // already deleted

    // reverse its effect
    const delta = signedAmount(String(row.type), Number(row.amount));
    await applyBalanceDelta(String(row.wallet_account_id), -delta);

    const ts = nowSec();
    const res = await dbRun(
      `UPDATE txn SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, id],
    );
    return res.changes > 0;
  });
}

async function restoreTxn(txnId) {
  const id = String(txnId || "").trim();
  if (!id) throw new Error("Invalid txnId");

  return withTx(async () => {
    const row = await getTxnRowForUpdate(id);
    if (!row) throw new Error("txn not found");
    if (Number(row.deleted_at || 0) === 0) return false; // already active

    // apply its effect back
    const delta = signedAmount(String(row.type), Number(row.amount));
    await applyBalanceDelta(String(row.wallet_account_id), delta);

    const ts = nowSec();
    const res = await dbRun(
      `UPDATE txn SET deleted_at = 0, updated_at = ? WHERE id = ?`,
      [ts, id],
    );
    return res.changes > 0;
  });
}

async function hardDeleteTxn(txnId) {
  const id = String(txnId || "").trim();
  if (!id) throw new Error("Invalid txnId");

  return withTx(async () => {
    const row = await getTxnRowForUpdate(id);
    if (!row) return false;

    // If not deleted yet, reverse effect before hard delete
    if (Number(row.deleted_at || 0) === 0) {
      const delta = signedAmount(String(row.type), Number(row.amount));
      await applyBalanceDelta(String(row.wallet_account_id), -delta);
    }

    const res = await dbRun(`DELETE FROM txn WHERE id = ?`, [id]);
    return res.changes > 0;
  });
}

module.exports = {
  createTxn,
  getTxnById,
  listTxns,
  updateTxn,
  deleteTxn,
  restoreTxn,
  hardDeleteTxn,
};
