const express = require("express");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/authorizeMiddleware");
const dashboardController = require("../controllers/dashboardController");
const {
  // accounts
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  restoreAccount,
  hardDeleteAccount,

  // wallets
  listWallets,
  dashboard,

  // txns + categories
  listTxns,
  listCategories,
} = require("../controllers/adminController");
const upload = require("../middlewares/upload");
const {
  updateCategory,
  deleteCategory,
  restoreCategory,
  createCategory,
} = require("../controllers/categoryController");

const router = express.Router();

// router.use(authenticateToken, authorize(["admin"]));

// dashboard
router.get("/dashboard", dashboard);

// accounts
router.get("/accounts", listAccounts);
router.get("/accounts/:id", getAccount);

router.post("/accounts", upload.single("avatar"), createAccount);
router.patch("/accounts/:id", updateAccount);
router.post("/accounts/:id/delete", deleteAccount);
router.post("/accounts/:id/restore", restoreAccount);
router.delete("/accounts/:id", hardDeleteAccount);

// wallets
router.get("/wallets", listWallets);

// txns
router.get("/txns", listTxns);

// categories (list only; nếu muốn CRUD admin thì mình thêm luôn)
router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.patch("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);
router.patch("/categories/restore/:id", restoreCategory);

// === Dashboard routes (ADMIN) ===
router.get("/dashboard/summary", dashboardController.getSummary);
router.get("/dashboard/kpi", dashboardController.getKpi);
router.get("/dashboard/compare", dashboardController.getCompare);

router.get(
  "/dashboard/series/topup-expense",
  dashboardController.getTopupVsExpenseSeries,
);
router.get(
  "/dashboard/series/cumulative",
  dashboardController.getCumulativeBalance,
);

router.get(
  "/dashboard/breakdown/category",
  dashboardController.getExpenseByCategory,
);
router.get("/dashboard/breakdown/user", dashboardController.getExpenseByUser);

router.get(
  "/dashboard/table/recent",
  dashboardController.getRecentTransactions,
);
router.get(
  "/dashboard/table/largest-expenses",
  dashboardController.getLargestExpenses,
);
module.exports = router;
