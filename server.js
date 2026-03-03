require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 8001;
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("❌ MONGO_URL is not set in environment. Exiting.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("✅ Connected to MongoDB");

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    const shutdown = (signal) => async () => {
      console.log(`\n⚠️  ${signal} received — shutting down gracefully`);

      server.close(async () => {
        console.log("🔌 HTTP server closed");
        try {
          await mongoose.connection.close();
          console.log("🔌 MongoDB connection closed");
          process.exit(0);
        } catch (err) {
          console.error("Error closing MongoDB:", err);
          process.exit(1);
        }
      });

      setTimeout(() => {
        console.error("⏰ Forced shutdown after 30s");
        process.exit(1);
      }, 30_000);
    };

    process.on("SIGTERM", shutdown("SIGTERM"));
    process.on("SIGINT",  shutdown("SIGINT"));

    process.on("unhandledRejection", (reason) => {
      console.error("❌ Unhandled rejection:", reason);
      server.close(() => process.exit(1));
    });

    process.on("uncaughtException", (err) => {
      console.error("❌ Uncaught exception:", err);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  });

mongoose.connection.on("error",        (err) => console.error("MongoDB error:", err));
mongoose.connection.on("disconnected", ()    => console.warn("⚠️  MongoDB disconnected"));
mongoose.connection.on("reconnected",  ()    => console.log("🔄 MongoDB reconnected"));