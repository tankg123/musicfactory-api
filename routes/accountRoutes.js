const express = require("express");
const { authenticateToken } = require("../middlewares/authMiddleware");
const {
  adminUpdateAccountController,
  updateMyAccountController,
  getMe,
} = require("../controllers/accountController");
const upload = require("../middlewares/upload");

const { authorize } = require("../middlewares/authorizeMiddleware");
const router = express.Router();

router.patch(
  "/me",
  authenticateToken,
  upload.single("avatar"),
  updateMyAccountController,
);

router.post(
  "/account",
  authenticateToken,
  authorize(["admin", "manager"]),
  upload.single("avatar"),
);
router.patch(
  "/account/:id",
  authenticateToken,
  authorize(["admin", "manager"]),
  upload.single("avatar"),
  adminUpdateAccountController,
);
router.get("/me", authenticateToken, getMe);
module.exports = router;
