// controllers/dashboardController.js
const dashboardModel = require("../models/dashboardModel");

function parseTopLimit(v, def = 10) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(100, Math.trunc(n)));
}

function normalizeOpts(q = {}) {
  const opts = {
    period: q.period,
    start_day_utc: q.start_day_utc,
    end_day_utc: q.end_day_utc,
    group_by: q.group_by,
    top_limit: parseTopLimit(q.top_limit, 10),
  };
  return opts;
}

// GET /admin/dashboard/summary
async function getSummary(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getDashboardSummary(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getSummary] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/kpi
async function getKpi(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const [company_balance, total_topup, total_expense, net, txn_count] =
      await Promise.all([
        dashboardModel.getCompanyWalletBalance(),
        dashboardModel.getTotalTopup(opts),
        dashboardModel.getTotalExpense(opts),
        dashboardModel.getNetBalance(opts),
        dashboardModel.getTxnCount(opts),
      ]);

    return res.json({
      data: {
        company_balance,
        total_topup,
        total_expense,
        net,
        txn_count,
      },
    });
  } catch (err) {
    console.error("[dashboard:getKpi] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/compare
// Query: metric=expense|topup, period=this_week, compare_with=last_week (optional)
async function getCompare(req, res) {
  try {
    const metric = String(req.query?.metric || "expense").toLowerCase();
    const period = req.query?.period || "this_week";
    const compare_with =
      req.query?.compare_with ||
      (period === "this_week" ? "last_week" : "last_month");

    const base = {
      period,
      compare_with,
      start_day_utc: req.query?.start_day_utc,
      end_day_utc: req.query?.end_day_utc,
    };

    const data =
      metric === "topup"
        ? await dashboardModel.compareTopup(base)
        : await dashboardModel.compareExpense(base);

    return res.json({ data: { metric, period, compare_with, ...data } });
  } catch (err) {
    console.error("[dashboard:getCompare] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/series/topup-expense
// Query: period, start_day_utc, end_day_utc, group_by=day|week|month
async function getTopupVsExpenseSeries(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getTopupVsExpenseSeries(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getTopupVsExpenseSeries] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/series/cumulative
// Query: period, start_day_utc, end_day_utc
async function getCumulativeBalance(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getDailyCumulativeBalance(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getCumulativeBalance] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/breakdown/category
// Query: period, start_day_utc, end_day_utc, top_limit
async function getExpenseByCategory(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getExpenseByCategory(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getExpenseByCategory] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/breakdown/user
// Query: period, start_day_utc, end_day_utc, top_limit
async function getExpenseByUser(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getExpenseByUser(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getExpenseByUser] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/table/recent
// Query: period, start_day_utc, end_day_utc, top_limit
async function getRecentTransactions(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getRecentTransactions(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getRecentTransactions] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /admin/dashboard/table/largest-expenses
// Query: period, start_day_utc, end_day_utc, top_limit
async function getLargestExpenses(req, res) {
  try {
    const opts = normalizeOpts(req.query || {});
    const data = await dashboardModel.getLargestExpenses(opts);
    return res.json({ data });
  } catch (err) {
    console.error("[dashboard:getLargestExpenses] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = {
  getSummary,
  getKpi,
  getCompare,
  getTopupVsExpenseSeries,
  getCumulativeBalance,
  getExpenseByCategory,
  getExpenseByUser,
  getRecentTransactions,
  getLargestExpenses,
};
