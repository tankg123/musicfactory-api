// controllers/adminController.js
const bcrypt = require("bcrypt");

const adminModel = require("../models/adminModel");
const walletAccountModel = require("../models/walletAccountModel");
const txnModel = require("../models/txnModel");
const categoryModel = require("../models/categoryModel");

function normEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}
function normRole(role) {
  if (!role) return "user";
  const r = String(role).trim().toLowerCase();
  return r === "admin" ? "admin" : "user";
}
/**
 * GET /admin/accounts
 * Query: page,pageSize,q,role,deleted
 */
async function listAccounts(req, res) {
  try {
    const { page, pageSize, q, role, deleted } = req.query || {};
    const opts = {
      page,
      pageSize,
      q,
      role,
      deleted:
        deleted === undefined
          ? undefined
          : ["1", "true", "yes"].includes(String(deleted).toLowerCase()),
    };
    const result = await adminModel.listAccounts(opts);
    return res.json(result);
  } catch (err) {
    console.error("[admin:listAccounts] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * GET /admin/accounts/:id
 */
async function getAccount(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const row = await adminModel.readAccountById(id);
    if (!row) return res.status(404).json({ error: "Account not found" });

    // never return password even if table had it (it doesn't in readAccountById anyway)
    return res.json({ data: row });
  } catch (err) {
    console.error("[admin:getAccount] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * POST /admin/accounts
 * Body: { email, password, full_name?, avatar_url?, description?, role? }
 * - Creates account (hashed password)
 * - Ensures company wallet + personal wallet for that account
 */
async function createAccount(req, res) {
  try {
    const { email, password, full_name, description, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    // hash password
    const hashed = await bcrypt.hash(String(password), 10);
    const avatar_url = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.avatar_url || null;
    const accountId = await adminModel.createAccount({
      email: normEmail(email),
      password: hashed,
      full_name: full_name ?? null,
      avatar_url: avatar_url ?? null,
      description: description ?? null,
      role: normRole(role),
    });

    // ensure wallets
    await walletAccountModel.ensureCompanyWallet({ initialBalance: 0 });
    await walletAccountModel.ensurePersonalWallet(accountId, {
      initialBalance: 0,
    });

    return res.status(201).json({ message: "Account created", accountId });
  } catch (err) {
    console.error("[admin:createAccount] error:", err);
    const msg = err?.message || "Server error";
    const code = msg.includes("exists") ? 409 : 500;
    return res.status(code).json({ error: msg });
  }
}

/**
 * PATCH /admin/accounts/:id
 * Body allowed: email?, password?, full_name?, avatar_url?, description?, role?, refresh_token?, is_deleted?
 */
async function updateAccount(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const payload = { ...req.body };

    // normalize
    if (payload.email !== undefined) payload.email = normEmail(payload.email);
    if (payload.role !== undefined) payload.role = normRole(payload.role);
    if (payload.is_deleted !== undefined)
      payload.is_deleted = !!payload.is_deleted;

    // hash if password provided
    if (payload.password !== undefined && payload.password) {
      payload.password = await bcrypt.hash(String(payload.password), 10);
    } else if (payload.password !== undefined) {
      // if they send empty string, ignore it
      delete payload.password;
    }

    const ok = await adminModel.updateAccount(id, payload);
    if (!ok) return res.json({ message: "No changes" });

    // ensure personal wallet still exists (safe)
    await walletAccountModel.ensurePersonalWallet(id, { initialBalance: 0 });

    return res.json({ message: "Updated" });
  } catch (err) {
    console.error("[admin:updateAccount] error:", err);
    const msg = err?.message || "Server error";
    const code = msg.includes("exists") ? 409 : 500;
    return res.status(code).json({ error: msg });
  }
}

/**
 * POST /admin/accounts/:id/delete (soft delete)
 */
async function deleteAccount(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await adminModel.deleteAccount(id);
    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[admin:deleteAccount] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * POST /admin/accounts/:id/restore
 */
async function restoreAccount(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await adminModel.restoreAccount(id);
    // ensure wallet back
    await walletAccountModel.ensurePersonalWallet(id, { initialBalance: 0 });

    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[admin:restoreAccount] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * DELETE /admin/accounts/:id (hard delete)
 */
async function hardDeleteAccount(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await adminModel.hardDeleteAccount(id);
    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[admin:hardDeleteAccount] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * GET /admin/wallets
 * Query: page,pageSize,type,owner_account_id,sortBy,sortDir
 */
async function listWallets(req, res) {
  try {
    const result = await walletAccountModel.listWalletAccounts(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error("[admin:listWallets] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * GET /admin/dashboard
 * Return:
 * - company wallet balance
 * - personal balances per user (wallet list)
 */
async function dashboard(req, res) {
  try {
    const company = await walletAccountModel.ensureCompanyWallet({
      initialBalance: 0,
    });

    // list personal wallets (no pagination here, system small)
    const personals = await walletAccountModel.listWalletAccounts({
      type: "PERSONAL",
      page: 1,
      pageSize: 100,
      sortBy: "balance",
      sortDir: "desc",
    });

    return res.json({
      company_wallet: company,
      personal_wallets: personals.data,
    });
  } catch (err) {
    console.error("[admin:dashboard] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * GET /admin/txns
 * Query uses txnModel.listTxns:
 * page,pageSize,q,type,wallet_account_id,created_by_account_id,category_id,fromDate,toDate,sortBy,sortDir
 */
async function listTxns(req, res) {
  try {
    const result = await txnModel.listTxns(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error("[admin:listTxns] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/**
 * GET /admin/categories
 */
async function listCategories(req, res) {
  try {
    const result = await categoryModel.listCategories(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error("[admin:listCategories] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = {
  // accounts
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  restoreAccount,
  hardDeleteAccount,

  // wallets
  listWallets,
  dashboard,

  // txns + categories (admin views)
  listTxns,
  listCategories,
};
