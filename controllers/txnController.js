// controllers/txnController.js
const txnModel = require("../models/txnModel");
const walletAccountModel = require("../models/walletAccountModel");

async function createMyTxn(req, res) {
  try {
    const accountId =
      String(req.user?.account_Id || "").trim() ||
      "acc_d58508a8-a445-480b-8673-e5ab2f32b319";
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const { wallet_kind, type, amount, category_id, description, txn_date } =
      req.body || {};
    const receipt_url = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.receipt_url || null;
    if (!wallet_kind || !type || !amount || !txn_date) {
      return res.status(400).json({
        error: "wallet_kind, type, amount, txn_date are required",
      });
    }

    // đảm bảo wallet tồn tại
    await walletAccountModel.ensureCompanyWallet({ initialBalance: 0 });
    await walletAccountModel.ensurePersonalWallet(accountId, {
      initialBalance: 0,
    });

    const id = await txnModel.createTxn({
      wallet_kind,
      type,
      amount,
      created_by_account_id: accountId,
      category_id,
      description,
      txn_date,
      receipt_url,
    });

    const row = await txnModel.getTxnById(id);
    return res.status(201).json({ message: "Created", data: row });
  } catch (err) {
    console.error("[createMyTxn] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

async function listMyTxns(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim();
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const result = await txnModel.listTxns({
      ...req.query,
      created_by_account_id: accountId,
    });

    return res.json(result);
  } catch (err) {
    console.error("[listMyTxns] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

async function getMyTxnById(req, res) {
  try {
    const accountId =
      String(req.user?.account_Id || "").trim() ||
      "acc_d58508a8-a445-480b-8673-e5ab2f32b319";
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid txn id" });

    const row = await txnModel.getTxnById(id);
    if (!row) return res.status(404).json({ error: "Txn not found" });

    if (String(row.created_by_account_id) !== accountId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ data: row });
  } catch (err) {
    console.error("[getMyTxnById] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

async function updateMyTxn(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim();
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid txn id" });

    // Kiểm tra quyền sở hữu
    const row = await txnModel.getTxnById(id);
    if (!row) return res.status(404).json({ error: "Txn not found" });
    if (String(row.created_by_account_id) !== accountId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const receipt_url = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.receipt_url || null;

    const updateData = {
      ...req.body,
      receipt_url,
    };

    const ok = await txnModel.updateTxn(id, updateData);

    if (!ok) {
      return res.json({ message: "No changes" });
    }
    const after = await txnModel.getTxnById(id);
    return res.json({ message: "Updated", data: after });
  } catch (err) {
    console.error("[updateMyTxn] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

async function deleteMyTxn(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim();
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid txn id" });

    // ensure ownership
    const row = await txnModel.getTxnById(id);
    if (!row) return res.status(404).json({ error: "Txn not found" });
    if (String(row.created_by_account_id) !== accountId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ok = await txnModel.deleteTxn(id);
    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[deleteMyTxn] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = {
  createMyTxn,
  listMyTxns,
  getMyTxnById,
  updateMyTxn,
  deleteMyTxn,
};
