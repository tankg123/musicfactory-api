// models/dashboardModel.js
const { dbGet, dbAll } = require("../helpers/db");

/**
 * =============== Date helpers (UTC -> YYYY-MM-DD) ===============
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toYmdUTC(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function startOfDayUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDaysUTC(d, days) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function startOfMonthUTC(d) {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfMonthUTC(d) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + 1, 1);
  x.setUTCHours(0, 0, 0, 0);
  return addDaysUTC(x, -1);
}
function startOfYearUTC(d) {
  const x = new Date(d);
  x.setUTCMonth(0, 1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfYearUTC(d) {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + 1, 0, 1);
  x.setUTCHours(0, 0, 0, 0);
  return addDaysUTC(x, -1);
}
// week start Monday (UTC)
function startOfWeekMondayUTC(d) {
  const x = startOfDayUTC(d);
  const day = x.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // Mon=0,...Sun=6
  return addDaysUTC(x, -diff);
}
function endOfWeekMondayUTC(d) {
  return addDaysUTC(startOfWeekMondayUTC(d), 6);
}

/**
 * period -> { start, end } as YYYY-MM-DD
 * - If start_day_utc/end_day_utc provided => use them (custom)
 */
function resolveRange(opts = {}) {
  const start =
    typeof opts.start_day_utc === "string" ? opts.start_day_utc.trim() : "";
  const end =
    typeof opts.end_day_utc === "string" ? opts.end_day_utc.trim() : "";
  if (start && end) return { start, end };

  const p = String(opts.period || "all")
    .trim()
    .toLowerCase();
  const now = new Date();

  if (p === "all") return { start: null, end: null };

  if (p === "today") {
    const s = toYmdUTC(startOfDayUTC(now));
    return { start: s, end: s };
  }
  if (p === "yesterday") {
    const y = addDaysUTC(startOfDayUTC(now), -1);
    const s = toYmdUTC(y);
    return { start: s, end: s };
  }

  if (p === "this_week") {
    const s = toYmdUTC(startOfWeekMondayUTC(now));
    const e = toYmdUTC(endOfWeekMondayUTC(now));
    return { start: s, end: e };
  }
  if (p === "last_week") {
    const last = addDaysUTC(now, -7);
    const s = toYmdUTC(startOfWeekMondayUTC(last));
    const e = toYmdUTC(endOfWeekMondayUTC(last));
    return { start: s, end: e };
  }

  if (p === "this_month") {
    const s = toYmdUTC(startOfMonthUTC(now));
    const e = toYmdUTC(endOfMonthUTC(now));
    return { start: s, end: e };
  }
  if (p === "last_month") {
    const lm = new Date(now);
    lm.setUTCMonth(lm.getUTCMonth() - 1);
    const s = toYmdUTC(startOfMonthUTC(lm));
    const e = toYmdUTC(endOfMonthUTC(lm));
    return { start: s, end: e };
  }

  if (p === "this_year") {
    const s = toYmdUTC(startOfYearUTC(now));
    const e = toYmdUTC(endOfYearUTC(now));
    return { start: s, end: e };
  }
  if (p === "last_year") {
    const ly = new Date(now);
    ly.setUTCFullYear(ly.getUTCFullYear() - 1);
    const s = toYmdUTC(startOfYearUTC(ly));
    const e = toYmdUTC(endOfYearUTC(ly));
    return { start: s, end: e };
  }

  // custom but missing start/end => treat as all
  return { start: null, end: null };
}

function dateWhere(alias, opts = {}) {
  const { start, end } = resolveRange(opts);
  if (!start || !end) return { sql: "", params: [] };
  return {
    sql: ` AND ${alias}.txn_date BETWEEN ? AND ? `,
    params: [start, end],
  };
}

function limitN(n, def = 10, max = 100) {
  const x = Number.isFinite(Number(n)) ? Number(n) : def;
  return Math.max(1, Math.min(max, Math.trunc(x)));
}

function groupExpr(group_by, alias = "t") {
  const g = String(group_by || "day").toLowerCase();
  // txn_date is 'YYYY-MM-DD'
  if (g === "month") return `substr(${alias}.txn_date, 1, 7)`; // YYYY-MM
  if (g === "week") return `strftime('%Y-W%W', ${alias}.txn_date)`; // Year-Week
  return `${alias}.txn_date`; // day
}

/**
 * ========================= KPI =========================
 */
async function getTotalTopup(opts = {}) {
  const w = dateWhere("t", opts);
  const row = await dbGet(
    `
    SELECT COALESCE(SUM(t.amount), 0) AS total
      FROM txn t
     WHERE t.deleted_at = 0
       AND t.type = 'TOPUP'
       ${w.sql}
    `,
    w.params,
  );
  return Number(row?.total || 0);
}

async function getTotalExpense(opts = {}) {
  const w = dateWhere("t", opts);
  const row = await dbGet(
    `
    SELECT COALESCE(SUM(t.amount), 0) AS total
      FROM txn t
     WHERE t.deleted_at = 0
       AND t.type = 'EXPENSE'
       ${w.sql}
    `,
    w.params,
  );
  return Number(row?.total || 0);
}

async function getNetBalance(opts = {}) {
  // net = topup - expense
  const w = dateWhere("t", opts);
  const row = await dbGet(
    `
    SELECT
      COALESCE(SUM(CASE WHEN t.type='TOPUP' THEN t.amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount ELSE 0 END), 0) AS net
    FROM txn t
    WHERE t.deleted_at = 0
    ${w.sql}
    `,
    w.params,
  );
  return Number(row?.net || 0);
}

async function getTxnCount(opts = {}) {
  const w = dateWhere("t", opts);
  const row = await dbGet(
    `
    SELECT COUNT(*) AS total
      FROM txn t
     WHERE t.deleted_at = 0
     ${w.sql}
    `,
    w.params,
  );
  return Number(row?.total || 0);
}

async function getCompanyWalletBalance() {
  const row = await dbGet(
    `
    SELECT COALESCE(balance, 0) AS balance
      FROM wallet_account
     WHERE type = 'COMPANY'
       AND deleted_at = 0
     LIMIT 1
    `,
  );
  return Number(row?.balance || 0);
}

/**
 * Compare two periods: returns { current, previous, diff, pct }
 * opts: { period: 'this_week'|'this_month'..., compare_with: 'last_week'|'last_month'... }
 */
async function compareExpense(opts = {}) {
  const current = await getTotalExpense(opts);
  const prevPeriod = String(opts.compare_with || "").trim();
  const previous = prevPeriod
    ? await getTotalExpense({
        ...opts,
        period: prevPeriod,
        start_day_utc: null,
        end_day_utc: null,
      })
    : 0;
  const diff = current - previous;
  const pct =
    previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100;
  return { current, previous, diff, pct };
}

async function compareTopup(opts = {}) {
  const current = await getTotalTopup(opts);
  const prevPeriod = String(opts.compare_with || "").trim();
  const previous = prevPeriod
    ? await getTotalTopup({
        ...opts,
        period: prevPeriod,
        start_day_utc: null,
        end_day_utc: null,
      })
    : 0;
  const diff = current - previous;
  const pct =
    previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100;
  return { current, previous, diff, pct };
}

/**
 * ========================= Time series =========================
 * group_by: day|week|month
 */
async function getTopupVsExpenseSeries(opts = {}) {
  const w = dateWhere("t", opts);
  const key = groupExpr(opts.group_by, "t");
  return dbAll(
    `
    SELECT
      ${key} AS bucket,
      COALESCE(SUM(CASE WHEN t.type='TOPUP' THEN t.amount ELSE 0 END), 0) AS topup,
      COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense,
      COALESCE(SUM(CASE WHEN t.type='TOPUP' THEN t.amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount ELSE 0 END), 0) AS net
    FROM txn t
    WHERE t.deleted_at = 0
    ${w.sql}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    w.params,
  );
}

async function getDailyCumulativeBalance(opts = {}) {
  // cumulative sum over time inside period: running(net)
  // SQLite window functions require SQLite 3.25+ (usually ok). If not, tell me.
  const w = dateWhere("t", opts);
  return dbAll(
    `
    WITH daily AS (
      SELECT
        t.txn_date AS day,
        COALESCE(SUM(CASE WHEN t.type='TOPUP' THEN t.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount ELSE 0 END), 0) AS net
      FROM txn t
      WHERE t.deleted_at = 0
      ${w.sql}
      GROUP BY t.txn_date
    )
    SELECT
      day,
      net,
      SUM(net) OVER (ORDER BY day ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative
    FROM daily
    ORDER BY day ASC
    `,
    w.params,
  );
}

/**
 * ========================= Breakdown / Pie =========================
 */
async function getExpenseByCategory(opts = {}) {
  const w = dateWhere("t", opts);
  const top = limitN(opts.top_limit, 10, 50);

  return dbAll(
    `
    SELECT
      COALESCE(c.name, 'Uncategorized') AS category_name,
      COALESCE(SUM(t.amount), 0) AS total
    FROM txn t
    LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at = 0
    WHERE t.deleted_at = 0
      AND t.type = 'EXPENSE'
      ${w.sql}
    GROUP BY category_name
    ORDER BY total DESC
    LIMIT ?
    `,
    [...w.params, top],
  );
}

async function getExpenseByUser(opts = {}) {
  const w = dateWhere("t", opts);
  const top = limitN(opts.top_limit, 10, 50);

  return dbAll(
    `
    SELECT
      a.id AS account_id,
      a.email,
      a.full_name,
      a.avatar_url,
      COALESCE(SUM(t.amount), 0) AS total
    FROM txn t
    JOIN account a ON a.id = t.created_by_account_id
    WHERE t.deleted_at = 0
      AND t.type = 'EXPENSE'
      ${w.sql}
    GROUP BY a.id
    ORDER BY total DESC
    LIMIT ?
    `,
    [...w.params, top],
  );
}

/**
 * ========================= Leaderboards / Tables =========================
 */
async function getRecentTransactions(opts = {}) {
  const w = dateWhere("t", opts);
  const top = limitN(opts.top_limit, 10, 100);

  return dbAll(
    `
    SELECT
      t.id,
      t.txn_date,
      t.type,
      t.amount,
      CASE WHEN t.type='TOPUP' THEN t.amount ELSE -t.amount END AS signed_amount,
      w.type AS wallet_type,
      COALESCE(c.name, 'Uncategorized') AS category_name,
      t.description,
      t.receipt_url,

      a.id AS actor_id,
      a.email AS actor_email,
      a.full_name AS actor_full_name,
      a.avatar_url AS actor_avatar_url
    FROM txn t
    JOIN account a ON a.id = t.created_by_account_id
    LEFT JOIN wallet_account w ON w.id = t.wallet_account_id AND w.deleted_at = 0
    LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at = 0
    WHERE t.deleted_at = 0
    ${w.sql}
    ORDER BY t.created_at DESC
    LIMIT ?
    `,
    [...w.params, top],
  );
}

async function getLargestExpenses(opts = {}) {
  const w = dateWhere("t", opts);
  const top = limitN(opts.top_limit, 10, 100);

  return dbAll(
    `
    SELECT
      t.id,
      t.txn_date,
      t.amount,
      w.type AS wallet_type,
      COALESCE(c.name, 'Uncategorized') AS category_name,
      t.description,

      a.id AS actor_id,
      a.email AS actor_email,
      a.full_name AS actor_full_name,
      a.avatar_url AS actor_avatar_url
    FROM txn t
    JOIN account a ON a.id = t.created_by_account_id
    LEFT JOIN wallet_account w ON w.id = t.wallet_account_id AND w.deleted_at = 0
    LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at = 0
    WHERE t.deleted_at = 0
      AND t.type = 'EXPENSE'
      ${w.sql}
    ORDER BY t.amount DESC, t.created_at DESC
    LIMIT ?
    `,
    [...w.params, top],
  );
}

/**
 * ========================= Convenience: One-shot dashboard summary =========================
 * returns KPI + some default charts/tables
 */
async function getDashboardSummary(opts = {}) {
  const [
    company_balance,
    total_topup,
    total_expense,
    net,
    txn_count,
    by_category,
    by_user,
    recent,
    topup_vs_expense_series,
  ] = await Promise.all([
    getCompanyWalletBalance(),
    getTotalTopup(opts),
    getTotalExpense(opts),
    getNetBalance(opts),
    getTxnCount(opts),
    getExpenseByCategory({ ...opts, top_limit: opts.top_limit || 8 }),
    getExpenseByUser({ ...opts, top_limit: opts.top_limit || 8 }),
    getRecentTransactions({ ...opts, top_limit: opts.top_limit || 10 }),
    getTopupVsExpenseSeries({ ...opts, group_by: opts.group_by || "day" }),
  ]);

  return {
    kpi: {
      company_balance,
      total_topup,
      total_expense,
      net,
      txn_count,
    },
    charts: {
      topup_vs_expense_series,
      expense_by_category: by_category,
      expense_by_user: by_user,
    },
    tables: {
      recent_transactions: recent,
    },
  };
}

module.exports = {
  // KPI
  getTotalTopup,
  getTotalExpense,
  getNetBalance,
  getCompanyWalletBalance,
  getTxnCount,
  compareTopup,
  compareExpense,

  // charts
  getTopupVsExpenseSeries,
  getDailyCumulativeBalance,

  // breakdown
  getExpenseByCategory,
  getExpenseByUser,

  // tables
  getRecentTransactions,
  getLargestExpenses,

  // bundle
  getDashboardSummary,
};
