function parseDurationToSeconds(duration) {
  const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  const minutes = parseInt(match?.[1] || "0");
  const seconds = parseInt(match?.[2] || "0");
  return minutes * 60 + seconds;
}
function splitIntoBatches(arr, batchSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    result.push(arr.slice(i, i + batchSize));
  }
  return result;
}
function vcbDateStrToUnix(dateStr) {
  const parts = String(dateStr).trim().split(/\s+/);
  if (parts.length < 3) throw new Error("Invalid VCB date format");
  const [mdy, hms, ampmRaw] = parts;
  const ampm = ampmRaw.toUpperCase();

  const [M, D, Y] = mdy.split("/").map((s) => parseInt(s, 10));
  const [h0, m, s] = hms.split(":").map((n) => parseInt(n, 10));
  if (!Y || !M || !D || [h0, m, s].some((x) => !Number.isFinite(x))) {
    throw new Error("Invalid date/time parts");
  }

  let H = h0 % 12;
  if (ampm === "PM") H += 12;
  if (ampm !== "AM" && ampm !== "PM") throw new Error("Missing AM/PM");

  const UTC_PLUS_7 = 7 * 60 * 60 * 1000;
  const utcMs = Date.UTC(Y, M - 1, D, H, m, s) - UTC_PLUS_7;
  return Math.floor(utcMs / 1000);
}

// Nhận nhiều kiểu input & trả epoch giây
function toUnixVN(input) {
  if (input == null) {
    throw new Error("Expected a Date or VCB date string");
  }

  // 1) Date object
  if (input instanceof Date) {
    return Math.floor(input.getTime() / 1000);
  }

  // 2) number: tự nhận diện ms/giây
  if (typeof input === "number" && Number.isFinite(input)) {
    // >= 1e12: likely milliseconds (13 chữ số)
    if (input >= 1e12) return Math.floor(input / 1000);
    // >= 1e9: giây (10 chữ số hiện đại)
    if (input >= 1e9) return Math.floor(input);
    throw new Error("Number too small to be a valid epoch");
  }

  // 3) string
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) throw new Error("Empty date string");
    // VCB format có AM/PM:
    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$/i.test(s)) {
      return vcbDateStrToUnix(s);
    }
    // ISO hoặc chuỗi khác để Date tự parse (UTC/local tùy chuỗi)
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    throw new Error("Unrecognized date string format");
  }

  // 4) object: thử lấy các field phổ biến
  if (typeof input === "object") {
    if (Array.isArray(input.DateTime) && input.DateTime[0]) {
      return toUnixVN(input.DateTime[0]);
    }
    if (input.DateTime) return toUnixVN(input.DateTime);
    if (input.date) return toUnixVN(input.date);
  }

  throw new Error("Expected a Date or VCB date string");
}
function normalizePaging(page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (p - 1) * size;
  return { p, size, offset };
}

function escapeLike(s) {
  return String(s).replace(/[%_\\]/g, (m) => "\\" + m);
}
/**
 * Xây WHERE/AND ... cho tìm kiếm trên cả channel (c) và account (a)
 * @param {string} q
 * @param {"WHERE"|"AND"} leading
 * @returns {{ sql: string, params: any[] }}
 */
function buildSearchClause(q, leading = "WHERE") {
  if (typeof q !== "string" || q.trim() === "") {
    return { sql: "", params: [] };
  }
  const kw = `%${escapeLike(q.trim())}%`;
  return {
    sql: `
      ${leading}
        (
          LOWER(c.channel_name) LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(c.channel_id)   LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(c.email)        LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(c.custom_url)   LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(c.description)  LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(a.email)        LIKE LOWER(?) ESCAPE '\\' OR
          LOWER(a.full_name)    LIKE LOWER(?) ESCAPE '\\'
        )
    `,
    params: [kw, kw, kw, kw, kw, kw, kw],
  };
}

/** Map row -> kèm createdBy và build avatar URL */
function mapChannelRow(r) {
  const { acc_email, acc_full_name, acc_avatar_url, ...ch } = r;
  const avatarUrl = acc_avatar_url ? makeFileUrl(acc_avatar_url) : null;
  return {
    ...ch,
    createdBy: {
      email: acc_email ?? null,
      full_name: acc_full_name ?? null,
      avatar_url: avatarUrl,
    },
  };
}

function fromBase64Url(b64url) {
  if (!b64url) return "";
  let s = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad !== 0) s += "===";
  return Buffer.from(s, "base64").toString("utf8");
}

function normalizeKey(s) {
  return String(s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\t\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const toInt = (v, d = undefined) => {
  if (v === undefined || v === null || v === "") return d;
  const n = Number(v);
  return Number.isInteger(n) ? n : d;
};

const toNum = (v, d = undefined) => {
  if (v === undefined || v === null || v === "") return d;
  // Cho phép v là number hoặc string số (có thể có dấu phẩy ngăn cách)
  const n = Number(typeof v === "string" ? v.replace(/[\s,]/g, "") : v);
  return Number.isFinite(n) ? n : d;
};
module.exports = {
  parseDurationToSeconds,
  splitIntoBatches,
  toUnixVN,
  normalizePaging,
  escapeLike,
  buildSearchClause,
  mapChannelRow,
  fromBase64Url,
  normalizeKey,
  toInt,
  toNum,
};
