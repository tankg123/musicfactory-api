function authorize(roles = []) {
  // roles param can be a single role string (e.g. 'admin') or an array of roles (e.g. ['admin', 'manager'])
  if (typeof roles === "string") {
    roles = [roles];
  }
  return (req, res, next) => {
    // Assuming req.user is set by the authenticateToken middleware
    if (
      !req.user ||
      (roles.length && !roles.includes(req.user.account_type || req.user.role))
    ) {
      // User is not authorized
      return res.status(403).json({ message: "Forbidden" });
    }
    // User is authorized
    next();
  };
}

module.exports = { authorize };
