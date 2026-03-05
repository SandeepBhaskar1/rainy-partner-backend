const { MongoMemoryServer } = require("mongodb-memory-server");

module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET_KEY = "test-jwt-secret";
  process.env.JWT_REFRESH_SECRET_KEY = "test-refresh-secret";
  process.env.JWT_EXPIRES_IN = "15m";
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
  process.env.PORT = "8001";
  global.__MONGOD__ = mongod;
};