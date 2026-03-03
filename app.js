const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const { db, initializeDatabase } = require("./database/index.js");
const http = require("http");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4013;

// initialize DataBase
initializeDatabase();

app.use(bodyParser.json());

// middleware set req.db
app.use((req, res, next) => {
  req.db = db;
  next();
});

const allowedOrigins = [
  "https://revenue.ansnetwork.vn",
  "https://expense.ansnetwork.vn",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // mobile app, postman ok
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// ------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------
const auth = require("./routes/authRoutes");
const account = require("./routes/accountRoutes");
const user = require("./routes/userRoutes");
const admin = require("./routes/adminRoutes");

app.use("/auth", auth);
app.use("/admin", admin);
app.use("/account", account);
app.use("/user", user);

// static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// HTTP server
const server = http.createServer(app);

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
