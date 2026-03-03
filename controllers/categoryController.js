// controllers/categoryController.js
const categoryModel = require("../models/categoryModel");

// GET /user/categories  (paging)
async function listActiveCategories(req, res) {
  try {
    const result = await categoryModel.listCategories({
      ...req.query,
      is_active: true,
    });
    return res.json(result);
  } catch (err) {
    console.error("[listActiveCategories] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// GET /user/categories/all (no paging)
async function listAllActiveCategoriesController(req, res) {
  try {
    const data = await categoryModel.listAllActiveCategories();
    return res.json({ data });
  } catch (err) {
    console.error("[listAllActiveCategories] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// ===== Optional Admin CRUD =====

// POST /admin/categories
async function createCategory(req, res) {
  try {
    const { name, is_active = 1 } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const id = await categoryModel.createCategory({ name, is_active });
    const row = await categoryModel.getCategoryById(id);
    return res.status(201).json({ message: "Created", data: row });
  } catch (err) {
    console.error("[createCategory] error:", err);
    const msg = err?.message || "Server error";
    const code = msg.includes("exists") ? 409 : 500;
    return res.status(code).json({ error: msg });
  }
}

// PATCH /admin/categories/:id
async function updateCategory(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await categoryModel.updateCategory(id, req.body || {});
    if (!ok) return res.json({ message: "No changes" });

    const row = await categoryModel.getCategoryById(id);
    return res.json({ message: "Updated", data: row });
  } catch (err) {
    console.error("[updateCategory] error:", err);
    const msg = err?.message || "Server error";
    const code = msg.includes("exists") ? 409 : 500;
    return res.status(code).json({ error: msg });
  }
}

// POST /admin/categories/:id/delete (soft delete)
async function deleteCategory(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await categoryModel.deleteCategory(id);
    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[deleteCategory] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

// POST /admin/categories/:id/restore
async function restoreCategory(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await categoryModel.restoreCategory(id);
    return res.json({ success: !!ok });
  } catch (err) {
    console.error("[restoreCategory] error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = {
  // user
  listActiveCategories,
  listAllActiveCategoriesController,

  // admin (optional)
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
};
