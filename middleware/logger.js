const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Get real client IP
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    req.ip;

  // Log request
  console.log(`📥 ${req.method} ${req.originalUrl} - IP: ${ip}`);

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusEmoji = res.statusCode >= 400 ? "❌" : "✅";

    console.log(
      `📤 ${statusEmoji} ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - IP: ${ip}`
    );
  });

  next();
};

module.exports = {
  requestLogger,
};
