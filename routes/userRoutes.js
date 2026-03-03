const express = require("express");
const { authenticateToken } = require("../middlewares/authMiddleware");

const { getMyWallets } = require("../controllers/walletController");
const {
  listActiveCategories,
  createCategory,
  listAllActiveCategoriesController,
} = require("../controllers/categoryController");
const {
  createMyTxn,
  listMyTxns,
  getMyTxnById,
  updateMyTxn,
  deleteMyTxn,
} = require("../controllers/txnController");
const upload = require("../middlewares/upload");
const { listAllActiveCategories } = require("../models/categoryModel");

const router = express.Router();

// GET /user/wallets
router.get("/wallets", authenticateToken, getMyWallets);

// GET /user/categories
router.get("/categories", listActiveCategories);

// TXN (my)
router.post("/txns", authenticateToken, upload.single("receipt"), createMyTxn);
router.get("/txns", authenticateToken, listMyTxns);
router.get("/txns/:id", authenticateToken, getMyTxnById);
router.patch(
  "/txns/:id",
  authenticateToken,
  upload.single("receipt"),
  updateMyTxn,
);
router.delete("/txns/:id", authenticateToken, deleteMyTxn);

router.get("/categories/all", listAllActiveCategoriesController);

module.exports = router;
