// controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  getUserByEmail,
  createUserMinimal,
  saveRefreshToken,
  getRefreshTokenByUserId,
  getAccountById,
} = require("../models/accountModel");

const {
  ensureCompanyWallet,
  ensurePersonalWallet,
} = require("../models/walletAccountModel");

const normEmail = (e) =>
  String(e || "")
    .trim()
    .toLowerCase();

// Register new account (local) + auto create wallets
async function register(req, res) {
  try {
    const { full_name, email, password } = req.body || {};
    if (!full_name || !email || !password) {
      return res
        .status(400)
        .json({ error: "full_name, email, password are required" });
    }

    const em = normEmail(email);
    const existing = await getUserByEmail(em);
    if (existing) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // 1) hash password
    const password_hash = await bcrypt.hash(String(password), 10);

    // 2) create user (DB minimal, no verification)
    const account_Id = await createUserMinimal({
      full_name,
      email: em,
      password_hash,
      role: "user", // default user
    });

    // 3) ensure wallets (safe to call many times)
    await ensureCompanyWallet({ initialBalance: 0 });
    await ensurePersonalWallet(account_Id, { initialBalance: 0 });

    return res.status(201).json({
      message: "Account created.",
      account_Id,
    });
  } catch (err) {
    console.error("[register] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// Local login
async function login(req, res) {
  try {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (user.is_deleted) {
      return res.status(403).json({ message: "Account has been deleted" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    // Ensure wallets exist (optional but helpful)
    await ensureCompanyWallet({ initialBalance: 0 });
    await ensurePersonalWallet(user.id, { initialBalance: 0 });

    const accessToken = jwt.sign(
      {
        account_Id: user.id,
        email: user.email,
        role: user.role, // 'admin' | 'user'
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign(
      { account_Id: user.id },
      process.env.REFRESH_SECRET_KEY,
      { expiresIn: "7d" },
    );

    await saveRefreshToken(user.id, refreshToken);
    return res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("[login] error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function refreshToken(req, res) {
  try {
    const incomingRefreshToken = req.body?.refreshToken;
    if (!incomingRefreshToken) {
      return res.status(401).json({ error: "No refresh token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_SECRET_KEY,
      );
    } catch {
      return res.status(403).json({ error: "Invalid refresh token" });
    }

    const userId = String(decoded?.account_Id || "").trim();
    if (!userId) {
      return res.status(403).json({ error: "Invalid refresh token payload" });
    }

    // Compare token stored in DB
    const storedToken = await getRefreshTokenByUserId(userId);
    if (!storedToken || storedToken !== incomingRefreshToken) {
      return res.status(403).json({ error: "Refresh token mismatch" });
    }

    const user = await getAccountById(userId);
    if (!user || user.is_deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    const newAccessToken = jwt.sign(
      {
        account_Id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" },
    );

    const newRefreshToken = jwt.sign(
      { account_Id: user.id },
      process.env.REFRESH_SECRET_KEY,
      { expiresIn: "7d" },
    );

    await saveRefreshToken(user.id, newRefreshToken);
    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("[refreshToken] error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  register,
  login,
  refreshToken,
};
