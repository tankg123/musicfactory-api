const fs = require("fs");
const path = require("path");
const uploadPath = path.resolve(
  __dirname,
  process.env.UPLOAD_PATH || "../../uploads"
);

function deleteFile(relativePath) {
  if (!relativePath || !relativePath.startsWith("/uploads/")) return;

  const filename = path.basename(relativePath);
  const fullPath = path.join(uploadPath, filename);

  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (!err) {
      fs.unlink(fullPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Unable to delete file:", unlinkErr);
        } else {
          console.log("File deleted:", fullPath);
        }
      });
    } else {
      console.warn("File does not exist:", fullPath);
    }
  });
}

module.exports = { deleteFile };
