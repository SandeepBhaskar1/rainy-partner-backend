const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");

const authRoutes = require("./routes/auth");
const plumberRoutes = require("./routes/plumber");
const leadsRoutes = require("./routes/leads");
const adminRoutes = require("./routes/admin");
const coordinatorRoute = require("./routes/coordinator");
const generalRoutes = require("./routes/general");
const projectRoute = require("./routes/picture");
const userRoute = require("./routes/userRegister");
const kycRoutes = require("./routes/kycs");

const { errorHandler } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/logger");
const { default: mongoose } = require("mongoose");

if (mongoose.connection.readyState === 0) {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (mongoUrl) {
    mongoose.connect(mongoUrl).catch(err => console.error("MongoDB connection error:", err));
  }
}

const app = express();


app.set("trust proxy", 1);

app.use(cookieParser());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());

const allowedOrigins = new Set([
  "http://localhost:8081",
  "exp://s14wb3g-anonymous-8081.exp.direct",
  "http://localhost:5173",
  "http://192.168.1.11:5173",
  "https://rainy-partner-admin.vercel.app",
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS policy violation: Origin not allowed -> ${origin}`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(
  fileUpload({
    limits: { fileSize: 2 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false,
    createParentPath: true,
  })
);

app.use(morgan("combined"));
app.use(requestLogger);

app.get("/", (req, res) => {
  res.send("Welcome to the Rainy Partner API V2");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", ts: new Date().toISOString() });
});

app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;

  res.json({
    status: "healthy",
    database: dbState === 1 ? "connected" : "disconnected"
  });
});

app.use("/api", projectRoute);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/coordinator", coordinatorRoute);
app.use("/api", generalRoutes);
app.use("/api/onboarding", userRoute);
app.use("/api/profile", userRoute);
app.use("/api/plumber", plumberRoutes);
app.use("/api/post-leads", leadsRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/orders", require("./routes/orders"));

app.use(errorHandler);

app.use("*", (req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

module.exports = app;