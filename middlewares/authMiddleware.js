require("dotenv").config();
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.sendStatus(401);
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token has expired" });
      }
      return res.status(403).json({ message: "Token is not valid" });
    }
    req.user = user;
    next();
  });
}
function verifySecretKey(req, res, next) {
  const providedKey = req.headers["x-api-key"];
  if (!providedKey || providedKey !== process.env.SECRET_KEY) {
    return res.status(403).json({ message: "Forbidden: Invalid Secret Key" });
  }
  next();
}
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return next();
    }
    req.user = user;
    next();
  });
}
module.exports = { authenticateToken, verifySecretKey, optionalAuth };
