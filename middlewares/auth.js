const jwt = require("jsonwebtoken");
const { getAccountById } = require("../models/accountModel");

function extractToken(req) {
  // Ưu tiên Authorization header
  const h = req.headers["authorization"] || req.headers["Authorization"];
  if (h && typeof h === "string") {
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  // Fallback cookie (nếu có cookie-parser)
  if (req.cookies && req.cookies.access_token) {
    return String(req.cookies.access_token);
  }
  // (Không khuyến khích) Fallback query param cho debug
  if (req.query && req.query.accessToken) {
    return String(req.query.accessToken);
  }
  return null;
}

function tokenError(res, code, message) {
  return res.status(code).json({ status: "error", message });
}

async function attachUserFromToken(req, res, next, { required = true } = {}) {
  const token = extractToken(req);
  if (!token) {
    if (required) return tokenError(res, 401, "Unauthorized");
    // optional
    req.user = null;
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (e) {
    if (required) {
      if (e?.name === "TokenExpiredError") {
        return tokenError(res, 401, "Token expired");
      }
      return tokenError(res, 401, "Invalid token");
    }
    // optional flow: không gắn user nếu token lỗi
    req.user = null;
    return next();
  }

  // payload mong đợi: { account_Id, email, role }
  const accountId = String(payload.account_Id || "").trim();
  if (!accountId) {
    if (required) return tokenError(res, 401, "Invalid token payload");
    req.user = null;
    return next();
  }

  // Luôn read DB để cập nhật trạng thái mới nhất (role/is_active/is_deleted)
  const acc = await getAccountById(accountId);
  if (!acc || acc.is_deleted) {
    if (required) return tokenError(res, 403, "Account disabled or not found");
    req.user = null;
    return next();
  }

  // bạn có thể chặn luôn user inactive tuỳ policy; ở requireActiveVerified bên dưới sẽ check kỹ hơn
  req.user = {
    account_Id: acc.id,
    email: acc.email,
    role: acc.role,
    is_active: !!acc.is_active,
    is_verified: !!acc.is_verified,
  };

  return next();
}

// ---- Public middlewares ----

// Bắt buộc đăng nhập
function requireAuth(req, res, next) {
  return attachUserFromToken(req, res, next, { required: true });
}

// Không bắt buộc, nếu có token hợp lệ sẽ gắn req.user
function optionalAuth(req, res, next) {
  return attachUserFromToken(req, res, next, { required: false });
}

// Bắt buộc có vai trò trong danh sách
function requireRole(...roles) {
  const allow = roles.map((r) => String(r || "").toLowerCase());
  return (req, res, next) => {
    requireAuth(req, res, async function afterAuth(err) {
      if (err) return; // đề phòng middleware dạng khác
      const role = String(req.user?.role || "").toLowerCase();
      if (!allow.includes(role)) {
        return tokenError(res, 403, "Forbidden");
      }
      return next();
    });
  };
}

// Chuyên biệt cho admin
function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

// Tuỳ chọn: yêu cầu user còn hoạt động & đã verify
function requireActiveVerified(req, res, next) {
  requireAuth(req, res, function afterAuth(err) {
    if (err) return;
    if (!req.user?.is_active) {
      return tokenError(res, 403, "Account is inactive");
    }
    if (!req.user?.is_verified) {
      return tokenError(res, 403, "Account is not verified");
    }
    return next();
  });
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireActiveVerified,
};
