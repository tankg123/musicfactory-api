function makeFileUrl(filePath, baseUrl) {
  const base =
    baseUrl || process.env.PUBLIC_FILES_BASE_URL || "http://localhost:3000";

  const normalized = String(filePath).replace(/^\/+/, "");

  // Ghép base + path
  return new URL(normalized, base.endsWith("/") ? base : base + "/").toString();
}
module.exports = { makeFileUrl };
