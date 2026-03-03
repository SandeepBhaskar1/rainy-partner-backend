const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const { verifyCoordinateToken } = require("../middleware/auth");
const { APIError, asyncHandler } = require("../middleware/errorHandler");
const User = require("../models/User");
const Order = require("../models/Order");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const bcrypt = require("bcryptjs/dist/bcrypt");
const Lead = require("../models/Lead");
const { sendAssignedSMS, sendCustomerSMS } = require("../utils/fast2sms");

const router = express.Router();
const axios = require("axios");

const sendOTPViaSMS = async (phone, otp) => {
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "dlt",
        sender_id: "RAINYP",
        message: "202126",
        variables_values: otp,
        flash: 0,
        numbers: phone,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Fast2SMS Error:", error.response?.data || error.message);
    throw new Error("Failed to send OTP");
  }
};


router.get(
  "/plumbers",
  verifyCoordinateToken,
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

router.get(
  "/plumbers/filters",
  verifyCoordinateToken,
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
  "/get-multiple-plumber-profiles",
  verifyCoordinateToken,
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

router.get("/profile", verifyCoordinateToken, async (req, res) => {
  const coordinator = await User.findById(req.user.id);
  res.json(coordinator);
});

router.post("/post-leads", verifyCoordinateToken, async (req, res) => {
  try {
    const { client, model_purchased } = req.body;

    if (
      !client ||
      !client.name ||
      !client.phone ||
      !client.address ||
      !client.city ||
      !client.district ||
      !client.state ||
      !client.pincode ||
      !model_purchased
    ) {
      return res
        .status(400)
        .json({ message: "Client info and model_purchased are required" });
    }

    const newLead = new Lead({
      client: {
        name: client.name,
        phone: client.phone,
        address: client.address,
        city: client.city,
        district: client.district,
        state: client.state,
        pincode: client.pincode,
      },
      model_purchased,
    });

    await newLead.save();

    sendCustomerSMS(client.phone).catch((err) => {
      console.error("Error sending customer SMS:", err);
    });
    res
      .status(201)
      .json({ message: "Lead created successfully", lead: newLead });
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/post-leads", verifyCoordinateToken, async (req, res) => {
  try {
    const leads = await Lead.find().sort({ created_at: -1 });
    res.json(leads);
    console.log(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/plumber/:id/delete",
  verifyCoordinateToken,
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

router.put("/:leadId/assign", verifyCoordinateToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { assigned_plumber_id, status } = req.body;

    if (!assigned_plumber_id || !status) {
      return res
        .status(400)
        .json({ message: "Plumber ID and status are required" });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const plumber = await User.findById(assigned_plumber_id);
    if (!plumber) return res.status(404).json({ message: "Plumber not found" });

    lead.assigned_plumber_id = assigned_plumber_id;
    lead.status = status;

    await lead.save();

    console.log("Lead after save:", lead);

    sendAssignedSMS(plumber.phone).catch((err) => {
      console.error("Error sending assignment SMS:", err);
    });

    res.status(200).json({ message: "Plumber assigned successfully", lead });
  } catch (error) {
    console.error("Error assigning plumber:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:leadId/reassign", verifyCoordinateToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { assigned_plumber_id, status } = req.body;

    if (!assigned_plumber_id || !status) {
      return res
        .status(400)
        .json({ message: "Plumber ID and status are required" });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    lead.assigned_plumber_id = assigned_plumber_id;
    lead.status = status;

    await lead.save();

    console.log("Lead after save:", lead);

    res.status(200).json({ message: "Plumber assigned successfully", lead });
  } catch (error) {
    console.error("Error assigning plumber:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/:leadId/status-completed",
  verifyCoordinateToken,
  async (req, res) => {
    try {
      const { leadId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Status Reqquired " });
      }

      const lead = await Lead.findById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      lead.status = status;

      await lead.save();

      res.status(200).json({ message: "Installation Approved.", lead });
    } catch (error) {
      console.error("Error Approving Installation:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.put("/:leadId/cancel", verifyCoordinateToken, async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    lead.assigned_plumber_id = "";
    lead.status = "not-assigned";
    lead.cancelled_at = new Date();
    lead.cancelled_by = req.user?._id || req.user?.id || null;

    await lead.save();

    console.log("Lead after save:", lead);

    res.status(200).json({ message: "Plumber cancelled successfully", lead });
  } catch (error) {
    console.error("Error cancelling plumber:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get(
  "/orders",
  verifyCoordinateToken,
  asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 999999 } = req.query;

    let filter = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const orders = await Order.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit));

    for (let order of orders) {
      const plumber = await User.findOne({ id: order.plumber_id });
      if (plumber) {
        order.plumber_name = plumber.name;
        order.plumber_phone = plumber.phone;
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

router.post(
  "/coordinator-place-order",
  verifyCoordinateToken,
  [
    body("plumber_id").notEmpty().withMessage("Plumber ID is required"),
    body("items")
      .isArray({ min: 1 })
      .withMessage("At least one item is required"),
    body("items.*.product").notEmpty().withMessage("Product code is required"),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be at least 1"),
    body("items.*.price")
      .isFloat({ min: 0 })
      .withMessage("Price must be a positive number"),
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        detail: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { plumber_id, items, client, shipping, billing, order_created_by } =
      req.body;

    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );

    const order = new Order({
      plumber_id,
      client,
      items,
      shipping,
      billing: billing || shipping,
      total_amount: totalAmount,
      status: "Order-Placed",
      order_created_by,
    });

    await order.save();

    res.json({
      message: "Order placed successfully!",
      order_id: order._id,
      total_amount: totalAmount,
    });
  })
);

router.put(
  "/orders/:orderId/status",
  verifyCoordinateToken,
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
    const userId = req.user?.id || req.user?._id;

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
      cancelled_reason,
      cancelled_reason,
    });
  })
);

router.post(
  "/order/upload-invoice/:orderId",
  verifyCoordinateToken,
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
  verifyCoordinateToken,
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
  verifyCoordinateToken,
  asyncHandler(async (req, res) => {
    const { docType, fileType, payment_type, payment_reference } = req.body;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID not found." });
    }

    if (!req.files || !req.files.payment_proof) {
      return res.status(400).json({ message: "No payment proof file uploaded." });
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
        message: "Only PDF and image files (JPEG, JPG, PNG & PDF) are allowed." 
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

    const fileExtension = paymentProofFile.name.split('.').pop().toLowerCase();
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
  verifyCoordinateToken,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { key } = req.body;

    if (!orderId || !key) {
      return res.status(400).json({ message: "Order ID and key are required." });
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

router.post("/reset-password-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number required." });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ message: "Valid 10-digit phone number required." });
    }

    const user = await User.findOne({ phone: cleanPhone });
    if (!user) {
      return res.json({ message: "If this phone is registered, OTP has been sent." });
    }

    const lastOtpTime = user.lastOtpRequest || 0;
    if (Date.now() - lastOtpTime < 60000) {
      return res.status(429).json({ 
        message: "Please wait 1 minute before requesting another OTP." 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    try {
      await sendOTPViaSMS(cleanPhone, otp);
      
      user.resetOtp = otp;
      user.otpExpiry = otpExpiry;
      user.otpAttempts = 0;
      user.lastOtpRequest = Date.now();
      await user.save();

      console.log(`OTP sent to ${cleanPhone}: ${otp}`);
      res.json({ message: "OTP sent successfully to your phone." });
      
    } catch (smsError) {
      console.error("SMS failed:", smsError.message);
      return res.status(500).json({ 
        message: "Failed to send OTP. Please try again later." 
      });
    }

  } catch (error) {
    console.error("OTP generation error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const user = await User.findOne({ phone });

    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.resetOtp || user.otpExpiry < Date.now())
      return res.status(400).json({ message: "OTP expired." });

    if (user.resetOtp !== Number(otp))
      return res.status(400).json({ message: "Invalid OTP." });

    res.json({ message: "OTP verified successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { phone, otp, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Password doesnt match." });
    }

    const user = await User.findOne({ phone });

    if (!user) return res.status(400).json({ message: "User not found." });
    if (user.resetOtp !== Number(otp))
      return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpiry < Date.now())
      return res.status(400).json({ message: "OTP expired." });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashedPassword;

    user.resetOtp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    res.json({ message: "Password reset successful." });
  } catch (error) {
    console.error("Error resetting password.");
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
