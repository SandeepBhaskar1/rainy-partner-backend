const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const { verifyAdminToken, verifyPlumberToken } = require("../middleware/auth");
const { APIError, asyncHandler } = require("../middleware/errorHandler");
const User = require("../models/User");
const Order = require("../models/Order");
const Product = require("../models/products");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const bcrypt = require("bcryptjs/dist/bcrypt");
const counterSchema = require("../models/counterSchema");
const fileUpload = require("express-fileupload");
const { fstat } = require("fs");

const router = express.Router();

router.get(
  "/dashboard",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const db = mongoose.connection.db;

    const totalPlumbers = await User.countDocuments({ role: "PLUMBER" });
    const approvedPlumbers = await User.countDocuments({
      role: "PLUMBER",
      kyc_status: "approved",
    });
    const pendingKYC = await User.countDocuments({
      role: "PLUMBER",
      kyc_status: "pending",
    });
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: "Pending" });
    const totalLeads = await db.collection("leads").countDocuments();
    const completedLeads = await db
      .collection("leads")
      .countDocuments({ status: "Completed" });

    const stateBreakdown = await User.aggregate([
      { $match: { role: "PLUMBER" } },
      { $group: { _id: "$address.state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      overview: {
        total_plumbers: totalPlumbers,
        approved_plumbers: approvedPlumbers,
        pending_kyc: pendingKYC,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        total_leads: totalLeads,
        completed_leads: completedLeads,
      },
      plumber_breakdown: {
        by_state: stateBreakdown,
      },
    });
  })
);

router.get(
  "/plumbers",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 999999 } = req.query;

    let filter = { role: "PLUMBER" };
    if (status) {
      filter.kyc_status = status;
    }

    const skip = (page - 1) * limit;
    const plumbers = await User.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await User.countDocuments(filter);

    res.json({
      plumbers: plumbers.map((p) => p.getProfile()),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

router.post(
  "/get-multiple-plumber-profiles",
  verifyAdminToken,
  async (req, res) => {
    try {
      const { keys } = req.body;

      if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ message: "Keys array is required" });
      }

      const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      const urlPromises = keys.map(async (key) => {
        if (!key) return { key: null, url: null };

        try {
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_DOCUMENTS,
            Key: key,
          });
          const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
          return { key, url: signedUrl };
        } catch (error) {
          console.error(`Error generating URL for key ${key}:`, error);
          return { key, url: null };
        }
      });

      const urls = await Promise.all(urlPromises);

      const urlMap = urls.reduce((acc, { key, url }) => {
        if (key && url) acc[key] = url;
        return acc;
      }, {});

      res.json({ success: true, urls: urlMap });
    } catch (error) {
      console.error("Error fetching images:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get(
  "/plumbers/filters",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const states = await User.distinct("address.state", { role: "PLUMBER" });
    const districts = await User.distinct("address.district", {
      role: "PLUMBER",
    });
    const cities = await User.distinct("address.city", { role: "PLUMBER" });

    res.json({ states, districts, cities });
  })
);

router.post(
  "/kyc/:plumberId/:action",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { plumberId, action } = req.params;

    if (!["approve", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ detail: "Action must be approve or reject" });
    }

    const plumber = await User.findOne({ id: plumberId, role: "PLUMBER" });

    if (!plumber) {
      return res.status(404).json({ detail: "Plumber not found" });
    }

    plumber.kyc_status = action === "approve" ? "approved" : "rejected";
    await plumber.save();

    res.json({
      message: `KYC ${action}d successfully`,
      plumber_id: plumberId,
      kyc_status: plumber.kyc_status,
    });
  })
);

router.put(
  "/plumbers/:id/reassign-coordinator",
  verifyAdminToken,
  async (req, res) => {
    try {
      const { coordinator_id } = req.body;
      const plumberId = req.params.id;

      if (!coordinator_id) {
        return res.status(400).json({ message: "Coordinator ID required." });
      }

      const plumber = await User.findById(plumberId);
      if (!plumber) {
        return res.status(404).json({ message: "Plumber not found." });
      }

      const oldCoordinatorId = plumber.coordinator_id;
      const newCoordinatorId = coordinator_id;

      if (
        oldCoordinatorId &&
        oldCoordinatorId.toString() === newCoordinatorId.toString()
      ) {
        return res
          .status(200)
          .json({ message: "Already assigned to this coordinator." });
      }

      plumber.coordinator_id = newCoordinatorId;
      await plumber.save();

      if (oldCoordinatorId) {
        const oldCoord = await User.findById(oldCoordinatorId);
        if (oldCoord && Array.isArray(oldCoord.assigned_plumbers)) {
          oldCoord.assigned_plumbers = oldCoord.assigned_plumbers.filter(
            (p) => {
              const pid =
                typeof p === "object" && p._id
                  ? p._id.toString()
                  : p.toString();
              return pid !== plumber._id.toString();
            }
          );
          await oldCoord.save();
        }
      }

      const newCoord = await User.findById(newCoordinatorId);
      if (newCoord) {
        if (!Array.isArray(newCoord.assigned_plumbers)) {
          newCoord.assigned_plumbers = [];
        }

        const alreadyAssigned = newCoord.assigned_plumbers.some((p) => {
          const pid =
            typeof p === "object" && p._id ? p._id.toString() : p.toString();
          return pid === plumber._id.toString();
        });

        if (!alreadyAssigned) {
          newCoord.assigned_plumbers.push(plumber._id);
          await newCoord.save();
        }
      }

      res.status(200).json({
        message: "Coordinator reassigned successfully",
        plumber,
      });
    } catch (err) {
      console.error("Error reassigning coordinator:", err);
      res.status(500).json({ message: "Failed to reassign coordinator." });
    }
  }
);

router.post(
  "/admin-place-order",
  verifyAdminToken,
  [
    body("plumber_id").notEmpty().withMessage("Plumber ID is required"),
    body("items")
      .isArray({ min: 1 })
      .withMessage("At least one item is required"),
    body("items.*.product")
      .notEmpty()
      .withMessage("Product code or ID is required"),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be at least 1"),
    body("client.name")
      .trim()
      .notEmpty()
      .withMessage("Customer name is required"),
    body("client.phone")
      .matches(/^[6-9]\d{9}$/)
      .withMessage("Valid phone number is required"),
    body("shipping.address")
      .trim()
      .notEmpty()
      .withMessage("Shipping address is required"),
    body("shipping.city").trim().notEmpty().withMessage("City is required"),
    body("shipping.pin")
      .matches(/^\d{6}$/)
      .withMessage("Valid PIN code is required"),
  ],
  asyncHandler(async (req, res) => {
    console.log("🟢 Admin-place-order route hit");
    console.log("📦 Incoming order body:", JSON.stringify(req.body, null, 2));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        detail: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { plumber_id, items, client, shipping, billing } = req.body;
    const admin_id = req.user?._id || req.user?.id;

    const plumber = await User.findOne({
      _id: plumber_id,
      role: "PLUMBER",
      is_active: true,
    });
    if (!plumber) {
      return res.status(404).json({ detail: "Plumber not found or inactive" });
    }

    const productIds = items.map((i) => i.product);
    const productDocs = await Product.find({
      code: { $in: productIds },
    });

    if (productDocs.length === 0) {
      return res.status(400).json({ detail: "No valid products found" });
    }

    const validatedItems = items.map((item) => {
      const productDoc = productDocs.find(
        (p) =>
          p._id?.toString() === item.product?.toString() ||
          p.code === item.product
      );

      if (!productDoc) {
        throw new Error(`Invalid product: ${item.product}`);
      }

      return {
        product: productDoc.code,
        name: productDoc.name,
        quantity: item.quantity,
        price: productDoc.mrp,
        subtotal: item.quantity * productDoc.mrp,
      };
    });

    const totalAmount = validatedItems.reduce((sum, i) => sum + i.subtotal, 0);

    const today = new Date().toISOString().split("T")[0];
    const counter = await counterSchema.findOneAndUpdate(
      { date: today },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const order_number = `ORD-${today.replace(/-/g, "")}-${String(
      counter.seq
    ).padStart(4, "0")}`;

    const order = new Order({
      order_number,
      plumber_id,
      client,
      items: validatedItems,
      shipping,
      billing: billing || shipping,
      total_amount: totalAmount,
      status: "Order-Placed",
      order_created_by: admin_id,
    });

    await order.save();

    res.status(201).json({
      message: "Order placed successfully!",
      order_id: order._id,
      order_number,
      total_amount: totalAmount,
    });
  })
);

router.get(
  "/orders",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;

    let filter = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const plumberIds = orders.map((o) => o.plumber_id);

    const plumbers = await User.find({ id: { $in: plumberIds } }).select(
      "id name phone"
    );

    const plumberMap = Object.fromEntries(plumbers.map((p) => [p.id, p]));

    for (let order of orders) {
      const p = plumberMap[order.plumber_id];
      if (p) {
        order.plumber_name = p.name;
        order.plumber_phone = p.phone;
      }
    }

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

router.put(
  "/orders/:orderId/status",
  verifyAdminToken,
  [
    body("status")
      .isIn([
        "Order-Placed",
        "Payment-Completed",
        "Dispatched",
        "Fulfilled",
        "Cancelled",
      ])
      .withMessage("Invalid status"),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        detail: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;
    const {
      status,
      awb_number,
      fulfilled_at,
      cancelledAt,
      cancelledBy,
      cancelled_reason,
    } = req.body;
    const userId = req.user?._id || req.user?.id;

    const order = await Order.findOne({ _id: orderId });

    if (!order) {
      return res.status(404).json({ detail: "Order not found" });
    }

    order.status = status;
    if (awb_number) {
      order.awb_number = awb_number;
    }

    if (order.status === "Fulfilled" && fulfilled_at) {
      order.fulfilled_at = new Date(fulfilled_at);
    }

    if (order.status === "Cancelled") {
      order.cancelled_reason = cancelled_reason;
      order.cancelledAt = cancelledAt || Date.now();
      order.cancelledBy = cancelledBy || userId;
    }

    await order.save();

    res.json({
      message: "Order status updated successfully",
      order_id: orderId,
      status,
      cancelledAt,
      cancelledBy,
      cancelled_reason,
    });
  })
);

router.get(
  "/leads",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const db = mongoose.connection.db;
    const { status, page = 1, limit = 999999 } = req.query;

    let filter = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const leads = await db
      .collection("leads")
      .find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    const total = await db.collection("leads").countDocuments(filter);

    res.json({
      leads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

router.post(
  "/order/upload-invoice/:orderId",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { docType, fileType } = req.body;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID not found." });
    }

    if (!req.files || !req.files.invoice) {
      return res.status(400).json({ message: "No invoice file uploaded." });
    }

    const invoiceFile = req.files.invoice;

    if (invoiceFile.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "Only PDF files are allowed." });
    }

    if (invoiceFile.size > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "File size exceeds 2MB limit." });
    }

    const order = await Order.findOne({
      $or: [{ order_id: orderId }, { id: orderId }, { _id: orderId }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.invoiceKey) {
      try {
        const s3Delete = new S3Client({
          region: process.env.AWS_REGION,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        });

        await s3Delete.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET_INVOICES,
            Key: order.invoiceKey,
          })
        );
      } catch (error) {
        console.error("Error deleting old invoice:", error);
      }
    }

    const fileName = `invoices/invoice-${orderId}-${Date.now()}.pdf`;

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    try {
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_INVOICES,
        Key: fileName,
        Body: invoiceFile.data,
        ContentType: "application/pdf",
      });

      await s3.send(command);

      order.invoiceKey = fileName;
      await order.save();

      res.json({
        success: true,
        message: "Invoice uploaded successfully",
        data: {
          invoiceKey: fileName,
          orderId: order._id,
        },
      });
    } catch (error) {
      console.error("Error uploading to S3:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.post(
  "/order/get-invoice/:orderId",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    try {
      const { key } = req.body;

      if (!key) {
        return res.status(400).json({ message: "File key is required" });
      }

      const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_INVOICES,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      res.json({ success: true, url: signedUrl });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.post(
  "/order/get-invoice-user/:orderId",
  verifyPlumberToken,
  asyncHandler(async (req, res) => {
    try {
      const { key } = req.body;

      if (!key) {
        return res.status(400).json({ message: "File key is required" });
      }

      const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_INVOICES,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      res.json({ success: true, url: signedUrl });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.post(
  "/order/upload-payment-proof/:orderId",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { docType, fileType, payment_type, payment_reference } = req.body;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID not found." });
    }

    if (!req.files || !req.files.payment_proof) {
      return res
        .status(400)
        .json({ message: "No payment proof file uploaded." });
    }

    const paymentProofFile = req.files.payment_proof;

    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedMimeTypes.includes(paymentProofFile.mimetype)) {
      return res.status(400).json({
        message: "Only PDF and image files (JPEG, JPG, PNG & PDF) are allowed.",
      });
    }

    if (paymentProofFile.size > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "File size exceeds 5MB limit." });
    }

    const order = await Order.findOne({
      $or: [{ order_id: orderId }, { id: orderId }, { _id: orderId }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.payment_proof_key) {
      try {
        const s3Delete = new S3Client({
          region: process.env.AWS_REGION,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        });

        await s3Delete.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET_PAYMENT_PROOFS,
            Key: order.payment_proof_key,
          })
        );
      } catch (error) {
        console.error("Error deleting old payment proof:", error);
      }
    }

    const fileExtension = paymentProofFile.name.split(".").pop().toLowerCase();
    const fileName = `payment-proofs/payment-${orderId}-${Date.now()}.${fileExtension}`;

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    try {
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_PAYMENT_PROOFS,
        Key: fileName,
        Body: paymentProofFile.data,
        ContentType: paymentProofFile.mimetype,
      });

      await s3.send(command);

      order.payment_proof_key = fileName;

      if (payment_type) order.payment_type = payment_type;
      if (payment_reference) order.payment_reference = payment_reference;

      await order.save();

      res.json({
        success: true,
        message: "Payment proof uploaded successfully",
        paymentProofKey: fileName,
        data: {
          paymentProofKey: fileName,
          orderId: order._id,
        },
      });
    } catch (error) {
      console.error("Error uploading to S3:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.post(
  "/order/get-payment-proof/:orderId",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { key } = req.body;

    if (!orderId || !key) {
      return res
        .status(400)
        .json({ message: "Order ID and key are required." });
    }

    const order = await Order.findOne({
      $or: [{ order_id: orderId }, { id: orderId }, { _id: orderId }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.payment_proof_key !== key) {
      return res.status(403).json({ message: "Invalid payment proof key." });
    }

    try {
      const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_PAYMENT_PROOFS,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      res.json({
        success: true,
        url: signedUrl,
      });
    } catch (error) {
      console.error("Error getting payment proof:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.get(
  "/jobs/pending-review",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const db = mongoose.connection.db;

    const jobs = await db
      .collection("leads")
      .find({ status: "under_review" })
      .toArray();

    for (let job of jobs) {
      const plumberId = job.completion_submitted_by || job.assigned_plumber_id;
      if (plumberId) {
        const plumber = await User.findOne({ id: plumberId });
        if (plumber) {
          job.plumber_name = plumber.name || "Unknown";
          job.plumber_phone = plumber.phone || "Unknown";
        }
      }
    }

    res.json(jobs);
  })
);

router.post(
  "/jobs/:jobId/approve-completion",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const db = mongoose.connection.db;

    const result = await db.collection("leads").updateOne(
      { id: jobId, status: "under_review" },
      {
        $set: {
          status: "Completed",
          completed_at: new Date(),
          approved_by: req.user.id,
          approved_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ detail: "Job not found or not under review" });
    }

    res.json({ message: "Job completion approved successfully" });
  })
);

router.post(
  "/jobs/:jobId/reject-completion",
  verifyAdminToken,
  [
    body("reason")
      .trim()
      .notEmpty()
      .withMessage("Rejection reason is required"),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        detail: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { jobId } = req.params;
    const { reason } = req.body;
    const db = mongoose.connection.db;

    const result = await db.collection("leads").updateOne(
      { id: jobId, status: "under_review" },
      {
        $set: {
          status: "Assigned",
          rejection_reason: reason,
          rejected_by: req.user.id,
          rejected_at: new Date(),
          completion_images: null,
          completion_submitted_at: null,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ detail: "Job not found or not under review" });
    }

    res.json({
      message: "Job completion rejected",
      reason,
    });
  })
);

router.post(
  "/co-ordinator-registeration",
  verifyAdminToken,
  async (req, res) => {
    const { name, phone, email, password } = req.body;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existing = await User.findOne({
      $or: [{ email }, { phone }],
      role: "COORDINATOR",
    });

    if (existing) {
      return res.status(400).json({
        message: "Coordinator with this email or phone already exists.",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    try {
      const coordinator = new User({
        phone,
        name,
        email,
        password_hash,
        role: "COORDINATOR",
        needs_onboarding: false,
        kyc_status: "approved",
      });
      await coordinator.save();
      res.status(201).json({
        message: "Coordinator Created Successfully.",
        coordinator: coordinator.getProfile(),
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
);

router.get("/co-ordinators", verifyAdminToken, async (req, res) => {
  try {
    const coordinators = await User.find({ role: "COORDINATOR" }).select(
      "-password_hash"
    );

    res.status(200).json({
      message: "Coordinators fetched successfully",
      coordinators,
    });
  } catch (err) {
    console.error("Error fetching coordinators:", err);
    res.status(500).json({ error: "Failed to fetch coordinators" });
  }
});

router.put(
  "/plumber/:id/delete",
  verifyAdminToken,
  asyncHandler(async (req, res) => {
    const plumber = await User.findOne({ _id: req.params.id, role: "PLUMBER" });

    if (!plumber) {
      return res.status(404).json({ message: "Plumber not found" });
    }

    plumber.is_active = false;
    plumber.kyc_status = "deleted";
    plumber.deleted_at = new Date();
    plumber.deleted_by = req.user.id;
    await plumber.save();

    res.json({ message: "Plumber marked as deleted successfully" });
  })
);

module.exports = router;
