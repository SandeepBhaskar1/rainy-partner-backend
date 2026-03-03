const mongoose = require("mongoose");
const Counter = require("./counterSchema");

const orderSchema = new mongoose.Schema(
  {
    _id: { 
      type: String, 
    },
    plumber_id: {
      type: String,
      ref: "User",
    },
    client: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
        match: [/^[6-9]\d{9}$/, "Please provide a valid Indian phone number"],
      },
      email: {
        type: String,
        lowercase: true,
        trim: true,
      },
    },
    items: [
      {
        product: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    shipping: {
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      district: String,
      state: String,
      pin: {
        type: String,
        required: true,
        match: [/^\d{6}$/, "Please provide a valid PIN code"],
      },
      gstInfo: String,
    },
    billing: {
      address: String,
      city: String,
      district: String,
      state: String,
      pin: String,
      gstInfo: String,
    },
    invoiceKey: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: [
        "Order-Placed",
        "Payment-Completed",
        "Dispatched",
        "Fulfilled",
        "Cancelled",
      ],
      default: "Order-Placed",
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    order_created_by: {type: mongoose.Types.ObjectId},
    awb_number: String,
    payment_status: String,
    payment_reference: String,
    payment_type: String,
    payment_proof_key: String,
    advance_paid: Number,
    fulfilled_at: Date,
    fulfilled_by: String,
    cancelledAt: Date,
    cancelled_reason: String,
    cancelledBy: String
  }, 
  { timestamps: true }
);

orderSchema.pre("save", async function (next) {
  if (this.isNew && !this._id) {
    try {
      const date = new Date();
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const todayPrefix = `ORD-${y}${m}${d}-`;
      const todayDateStr = `${y}${m}${d}`;

      const counter = await Counter.findOneAndUpdate(
        { date: todayDateStr },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      const seqStr = String(counter.seq).padStart(6, "0");
      this._id = `${todayPrefix}${seqStr}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance method to calculate total
orderSchema.methods.calculateTotal = function () {
  return this.items.reduce(
    (total, item) => total + item.quantity * item.price,
    0
  );
};

// Instance method to check if order can be fulfilled
orderSchema.methods.canBeFulfilled = function () {
  return this.status === "Dispatched";
};

// Static method to find orders by plumber
orderSchema.statics.findByPlumber = function (plumberId) {
  return this.find({ plumber_id: plumberId }).sort({ createdAt: -1 });
};

// Static method to find orders by status
orderSchema.statics.findByStatus = function (status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

module.exports = mongoose.model("Order", orderSchema);
