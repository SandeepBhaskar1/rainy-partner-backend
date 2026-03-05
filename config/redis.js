const redis = require("ioredis");

const redisClient = new redis({
    host : process.env.REDIS_HOST,
    port : process.env.REDIS_PORT,
});

redisClient.on("connect", () => {
    console.log("✅ Connected to Redis");
});

redisClient.on("error", (err) => {
    console.error("❌ Redis connection error:", err);
});