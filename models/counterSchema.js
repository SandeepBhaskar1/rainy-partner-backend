const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  date: { type: String, unique: true }, 
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
