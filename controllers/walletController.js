// controllers/walletController.js
const walletAccountModel = require("../models/walletAccountModel");

async function getMyWallets(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim();
    if (!accountId) return res.status(401).json({ error: "Unauthorized" });

    const company = await walletAccountModel.ensureCompanyWallet({
      initialBalance: 0,
    });
    const personal = await walletAccountModel.ensurePersonalWallet(accountId, {
      initialBalance: 0,
    });

    return res.json({
      company_wallet: company, // for display: company balance
      personal_wallet: personal, // user balance
    });
  } catch (err) {
    console.error("[getMyWallets] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = { getMyWallets };
