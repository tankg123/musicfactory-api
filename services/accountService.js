// services/accountService.js
const bcrypt = require("bcrypt");
const { dbRun } = require("../helpers/db");

const accountModel = require("../models/accountModel");
const walletAccountModel = require("../models/walletAccountModel");

/**
 * Transaction wrapper (atomic)
 */
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

/**
 * Call on app startup:
 * ensure system has exactly 1 company wallet.
 */
async function initSystemWallets() {
  return walletAccountModel.ensureCompanyWallet({ initialBalance: 0 });
}

/**
 * Create account + create personal wallet automatically.
 * - role: 'admin' | 'user'
 */
async function createAccountWithPersonalWallet({
  email,
  plainPassword,
  full_name = null,
  avatar_url = null,
  description = null,
  role = "user",
  initialPersonalBalance = 0,
} = {}) {
  if (!email || !plainPassword)
    throw new Error("email and plainPassword are required");

  return withTx(async () => {
    // 1) ensure company wallet exists (safe)
    const companyWallet = await walletAccountModel.ensureCompanyWallet({
      initialBalance: 0,
    });

    // 2) create account
    const hashedPassword = await bcrypt.hash(String(plainPassword), 10);
    const accountId = await accountModel.createUser({
      fullName: full_name,
      email,
      hashedPassword,
      role,
      avatarUrl: avatar_url,
      description,
    });

    // 3) ensure personal wallet
    const personalWallet = await walletAccountModel.ensurePersonalWallet(
      accountId,
      {
        initialBalance: initialPersonalBalance,
      },
    );

    return {
      accountId,
      companyWallet, // for admin dashboard if needed
      personalWallet,
    };
  });
}

/**
 * Ensure personal wallet exists for an existing account (safe).
 */
async function ensurePersonalWalletForAccount(
  accountId,
  { initialBalance = 0 } = {},
) {
  return walletAccountModel.ensurePersonalWallet(accountId, { initialBalance });
}

module.exports = {
  initSystemWallets,
  createAccountWithPersonalWallet,
  ensurePersonalWalletForAccount,
};
