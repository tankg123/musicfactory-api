const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadPath = path.resolve(
  __dirname,
  process.env.UPLOAD_PATH || "../../uploads"
);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `img-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = upload;
