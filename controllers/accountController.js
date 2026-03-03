// controllers/accountController.js
const {
  getAccountDetailsById,
  updateAccountById,
  getAccountById,
} = require("../models/accountModel");
const { deleteFile } = require("../utils/deleteFile");
const { makeFileUrl } = require("../utils/url");

// helpers
function toBoolOrUndef(v) {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}
function normRoleOrUndef(v) {
  if (v === undefined) return undefined;
  const r = String(v || "")
    .trim()
    .toUpperCase();
  if (r === "admin" || r === "user") return r;
  return undefined;
}

// PATCH /me
async function updateMyAccountController(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim(); // TEXT
    if (!accountId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const before = await getAccountById(accountId);
    if (!before) {
      return res
        .status(404)
        .json({ status: "error", message: "Account not found" });
    }

    // avatar_url: ưu tiên file tải lên; nếu body có key avatar_url nhưng rỗng -> set null (xoá)
    let avatar_url;
    if (req.file) {
      avatar_url = `/uploads/${req.file.filename}`;
    } else if (Object.prototype.hasOwnProperty.call(req.body, "avatar_url")) {
      avatar_url = req.body.avatar_url || null;
    }

    const payload = {
      full_name: Object.prototype.hasOwnProperty.call(req.body, "full_name")
        ? req.body.full_name
        : undefined,
      description: Object.prototype.hasOwnProperty.call(req.body, "description")
        ? req.body.description
        : undefined,
      avatar_url, // undefined | null | string
      // KHÔNG cho user tự đổi role/is_deleted/email
    };

    const changed = await updateAccountById(accountId, payload);
    if (!changed) {
      return res.status(200).json({ status: "success", message: "No changes" });
    }

    // Xoá avatar cũ nếu vừa upload file mới và trước đó là file local
    if (
      req.file &&
      before.avatar_url &&
      String(before.avatar_url).startsWith("/uploads/")
    ) {
      deleteFile(before.avatar_url);
    }

    const data = await getAccountDetailsById(accountId);
    if (data?.avatar_url) data.avatar_url = makeFileUrl(data.avatar_url);

    return res.status(200).json({ status: "success", data });
  } catch (err) {
    console.error("[updateMyAccountController] error:", err);
    return res
      .status(500)
      .json({ status: "error", message: err?.message || "Server error" });
  }
}

// PATCH /admin/accounts/:id  (admin cập nhật)
async function adminUpdateAccountController(req, res) {
  try {
    // kiểm tra quyền admin
    const meRole = String(req.user?.role || "").toUpperCase();
    if (meRole !== "admin") {
      return res.status(403).json({ status: "error", message: "Forbidden" });
    }

    const id = String(req.params.id || "").trim(); // TEXT id
    if (!id) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid account id" });
    }

    const before = await getAccountById(id);
    if (!before) {
      return res
        .status(404)
        .json({ status: "error", message: "Account not found" });
    }

    // avatar_url: ưu tiên file
    let avatar_url;
    if (req.file) {
      avatar_url = `/uploads/${req.file.filename}`;
    } else if (Object.prototype.hasOwnProperty.call(req.body, "avatar_url")) {
      avatar_url = req.body.avatar_url || null;
    }

    const payload = {
      // admin có thể sửa profile
      full_name: Object.prototype.hasOwnProperty.call(req.body, "full_name")
        ? req.body.full_name
        : undefined,
      description: Object.prototype.hasOwnProperty.call(req.body, "description")
        ? req.body.description
        : undefined,
      avatar_url,

      // admin-only fields
      role: normRoleOrUndef(req.body.role),
      is_deleted: toBoolOrUndef(req.body.is_deleted),
      // (optional) email: nếu bạn muốn cho admin đổi email thì mở dòng dưới
      // email: Object.prototype.hasOwnProperty.call(req.body, "email") ? req.body.email : undefined,
    };

    const changed = await updateAccountById(id, payload);
    if (!changed) {
      return res.status(200).json({ status: "success", message: "No changes" });
    }

    if (
      req.file &&
      before.avatar_url &&
      String(before.avatar_url).startsWith("/uploads/")
    ) {
      deleteFile(before.avatar_url);
    }

    const data = await getAccountDetailsById(id);
    if (data?.avatar_url) data.avatar_url = makeFileUrl(data.avatar_url);

    return res.status(200).json({ status: "success", data });
  } catch (err) {
    console.error("[adminUpdateAccountController] error:", err);
    return res
      .status(500)
      .json({ status: "error", message: err?.message || "Server error" });
  }
}

// GET /me
async function getMe(req, res) {
  try {
    const accountId = String(req.user?.account_Id || "").trim();
    if (!accountId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const existingUser = await getAccountById(accountId);
    if (!existingUser) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { password, refresh_token, ...safe } = existingUser;

    if (safe.avatar_url) {
      safe.avatar_url = makeFileUrl(safe.avatar_url);
    }

    return res.json({ user: safe });
  } catch (err) {
    console.error("getMe error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Error fetching profile" });
  }
}

module.exports = {
  getMe,
  updateMyAccountController,
  adminUpdateAccountController,
};
