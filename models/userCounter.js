const mongoose = require("mongoose");

const userCounterSchema = new mongoose.Schema({
  role: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("UserCounter", userCounterSchema);
