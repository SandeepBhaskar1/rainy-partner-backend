const mongoose = require("mongoose");

beforeAll(async () => {
  const start = Date.now();
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - start > 10000) throw new Error("Mongoose never connected");
    await new Promise(r => setTimeout(r, 100));
  }

  // Clean DB once before this suite's tests run
  const collections = mongoose.connection.collections;
  if (collections.users) await collections.users.deleteMany({});
  if (collections.usercounters) await collections.usercounters.deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});