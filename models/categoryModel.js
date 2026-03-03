// models/categoryModel.js
const {
  dbGet,
  dbAll,
  dbRun,
  normalizePaging,
  escapeLike,
} = require("../helpers/db");
const { randomUUID } = require("crypto");

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normText(s) {
  const t = String(s ?? "").trim();
  return t ? t : null;
}

// =============== CREATE ===============
async function createCategory({ name, is_active = 1 } = {}) {
  const nm = normText(name);
  if (!nm) throw new Error("name is required");

  const id = randomUUID();
  const ts = nowSec();

  try {
    await dbRun(
      `INSERT INTO category (
        id, name, is_active,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, 0)`,
      [id, nm, is_active ? 1 : 0, ts, ts],
    );
    return id;
  } catch (err) {
    if (String(err.code || "").includes("SQLITE_CONSTRAINT")) {
      throw new Error("Category name already exists");
    }
    throw err;
  }
}

// =============== READ ===============
async function getCategoryById(id) {
  return dbGet(
    `SELECT id, name, is_active, created_at, updated_at, deleted_at
       FROM category
      WHERE id = ? AND deleted_at = 0
      LIMIT 1`,
    [String(id)],
  );
}

async function getCategoryByName(name) {
  const nm = normText(name);
  if (!nm) return null;
  return dbGet(
    `SELECT id, name, is_active, created_at, updated_at, deleted_at
       FROM category
      WHERE LOWER(name) = LOWER(?) AND deleted_at = 0
      LIMIT 1`,
    [nm],
  );
}

// =============== LIST (pagination + search + sort) ===============
/**
 * opts: {
 *  page?, pageSize?,
 *  q?, is_active?, includeDeleted? (default false),
 *  sortBy? ('created_at'|'updated_at'|'name'),
 *  sortDir? ('asc'|'desc')
 * }
 */
async function listCategories(opts = {}) {
  const {
    p: page,
    size: pageSize,
    offset,
  } = normalizePaging(opts.page, opts.pageSize);

  const where = [];
  const params = [];

  // default: hide deleted
  const includeDeleted = !!opts.includeDeleted;
  if (!includeDeleted) {
    where.push(`deleted_at = 0`);
  }

  if (typeof opts.is_active === "boolean") {
    where.push(`is_active = ?`);
    params.push(opts.is_active ? 1 : 0);
  }

  if (opts.q && String(opts.q).trim()) {
    const esc = escapeLike(String(opts.q).trim());
    const kw = `%${esc}%`;
    where.push(`(LOWER(name) LIKE LOWER(?) ESCAPE '\\')`);
    params.push(kw);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sortByRaw = String(opts.sortBy || "created_at").toLowerCase();
  const sortDir =
    String(opts.sortDir || "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const sortBy =
    sortByRaw === "name"
      ? "name"
      : sortByRaw === "updated_at"
        ? "updated_at"
        : "created_at";

  const rows = await dbAll(
    `
    SELECT id, name, is_active, created_at, updated_at, deleted_at
      FROM category
      ${whereSql}
     ORDER BY ${sortBy} ${sortDir}, id ${sortDir}
     LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  const countRow = await dbGet(
    `SELECT COUNT(*) AS total FROM category ${whereSql}`,
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

// =============== UPDATE (partial) ===============
/**
 * payload allowed: { name?, is_active? }
 */
async function updateCategory(id, payload = {}) {
  const sets = [];
  const params = [];
  const hasOwn = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  const push = (col, val) => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (hasOwn("name")) {
    const nm = normText(payload.name);
    if (!nm) throw new Error("name cannot be empty");
    push("name", nm);
  }
  if (hasOwn("is_active")) push("is_active", payload.is_active ? 1 : 0);

  push("updated_at", nowSec());
  if (sets.length === 1) return false;

  params.push(String(id));

  try {
    const res = await dbRun(
      `UPDATE category SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
    return res.changes > 0;
  } catch (err) {
    if (String(err.code || "").includes("SQLITE_CONSTRAINT")) {
      throw new Error("Category name already exists");
    }
    throw err;
  }
}

// =============== DELETE (soft/hard) ===============
async function deleteCategory(id) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE category
        SET deleted_at = ?, updated_at = ?
      WHERE id = ?`,
    [ts, ts, String(id)],
  );
  return res.changes > 0;
}

async function restoreCategory(id) {
  const ts = nowSec();
  const res = await dbRun(
    `UPDATE category
        SET deleted_at = 0, updated_at = ?
      WHERE id = ?`,
    [ts, String(id)],
  );
  return res.changes > 0;
}

async function hardDeleteCategory(id) {
  const res = await dbRun(`DELETE FROM category WHERE id = ?`, [String(id)]);
  return res.changes > 0;
}
async function listAllActiveCategories() {
  return dbAll(
    `
    SELECT id, name, is_active, created_at, updated_at
      FROM category
     WHERE deleted_at = 0
       AND is_active = 1
     ORDER BY name ASC, created_at DESC
    `,
    [],
  );
}
module.exports = {
  createCategory,
  getCategoryById,
  getCategoryByName,
  listAllActiveCategories,
  listCategories,
  updateCategory,
  deleteCategory,
  restoreCategory,
  hardDeleteCategory,
};
