const bcrypt = require("bcrypt");
const crypto = require("crypto");

function genId(prefix = "acc") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function genWalletId(prefix = "wal") {
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = function insertDefaultAdminAndUserAccount(db) {
  const now = Math.floor(Date.now() / 1000);

  const defaults = [
    {
      email: "ceo@amnhacso.com",
      plainPassword: "ceo@amnhacso.com",
      full_name: "Thomas Bui",
      avatar_url: "/avatars/admin.png",
      description: "Default CEO admin account",
      role: "admin",
    },
    {
      email: "khanh.qv@ansnetwork.vn",
      plainPassword: "khanh.qv@ansnetwork.vn",
      full_name: "Khanh QV",
      avatar_url: "/avatars/user.png",
      description: "Default user account",
      role: "user",
    },
  ];

  db.serialize(() => {
    defaults.forEach((u) => {
      db.get(
        `SELECT id FROM account WHERE email = ? AND is_deleted = 0`,
        [u.email],
        async (err, row) => {
          if (err) {
            console.error("Error checking default account:", err.message);
            return;
          }
          if (row) {
            console.log(`Account already exists: ${u.email}`);
            return;
          }

          try {
            const hashed = await bcrypt.hash(u.plainPassword, 10);
            const accountId = genId("acc");

            db.run(
              `INSERT INTO account (
                id,
                email,
                password,
                full_name,
                avatar_url,
                description,
                role,
                refresh_token,
                is_deleted,
                created_at,
                updated_at,
                deleted_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                accountId,
                u.email,
                hashed,
                u.full_name || null,
                u.avatar_url || null,
                u.description || null,
                u.role,
                null, // refresh_token
                0, // is_deleted
                now,
                now,
                0, // SỬA: deleted_at phải là 0 (hoặc số) thay vì null
              ],
              (err2) => {
                if (err2) {
                  console.error(`Error inserting ${u.email}:`, err2.message);
                } else {
                  console.log(
                    `Default account created: ${u.email} (${u.role})`,
                  );

                  // Tạo ví cho account vừa tạo
                  createWalletForAccount(db, u, accountId, now);
                }
              },
            );
          } catch (hashError) {
            console.error(`Hashing error for ${u.email}:`, hashError.message);
          }
        },
      );
    });
  });
};

// Hàm tạo ví cho account
function createWalletForAccount(db, user, accountId, now) {
  const walletId = genWalletId("wal");

  // Admin tạo ví COMPANY, User tạo ví PERSONAL
  const walletType = user.role === "admin" ? "COMPANY" : "PERSONAL";

  db.run(
    `INSERT INTO wallet_account (
      id,
      type,
      owner_account_id,
      balance,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      walletId,
      walletType,
      walletType === "PERSONAL" ? accountId : null,
      0,
      now,
      now,
      0,
    ],
    (err) => {
      if (err) {
        console.error(`Error creating wallet for ${user.email}:`, err.message);
      } else {
        console.log(`Wallet created for ${user.email} (${walletType})`);
      }
    },
  );
}
