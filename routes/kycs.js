const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyAdminToken, verifyToken } = require("../middleware/auth");

router.get("/kyc-approvals", verifyAdminToken, async (req, res) => {
  try {
    const {
      pendingPage = 1,
      pendingLimit = 10,
      rejectedPage = 1,
      rejectedLimit = 10,
    } = req.query;

    const penidngSkip = (pendingPage - 1) * pendingLimit;
    const rejectedSkip = (rejectedPage - 1) * rejectedLimit;

    const pending = await User.find({ kyc_status: "pending" })
    .sort({updated_at: -1}).skip(penidngSkip).limit(Number(pendingLimit));
    const pendingCount = await User.countDocuments({ kyc_status: "pending" });
    const rejected = await User.find({ kyc_status: "rejected" })
    .sort({updated_at: -1,}).skip(rejectedSkip).limit(Number(rejectedLimit));
    const rejectedCount = await User.countDocuments({ kyc_status: "rejected" });

    const formatKYCData = (kycList) => {
      return kycList.map((user) => ({
        id: user._id,
        user_id: user.user_id,
        phone: user.phone,
        name: user.name,
        address: user.address,
        aadhaar_front: user.aadhaar_front,
        aadhaar_back: user.aadhaar_back,
        license_front: user.license_front,
        license_back: user.license_back,
        status: user.kyc_status,
        needs_onboarding: user.needs_onboarding,
        agreement_status: user.agreement_status,
      }));
    };

    res.json({
      pending: formatKYCData(pending),
      pendingPegenation: {
        total: pendingCount,
        page: Number(pendingPage),
        limit: Number(pendingLimit),
        totalPages: Math.ceil(pendingCount / pendingLimit),
      },
      rejected: formatKYCData(rejected),
      rejectedPegenation: {
        total: rejectedCount,
        page: Number(rejectedPage),
        limit: Number(rejectedLimit),
        totalPages: Math.ceil(rejectedCount / rejectedLimit),
      },
    });
  } catch (error) {
    console.error("Error fetching KYC approvals:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/approve", verifyToken, async (req, res) => {
  const { id, coordinator_id } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.kyc_status = "approved";
    user.coordinator_id = coordinator_id;
    user.approvedAt = new Date();
    await user.save();

    const coordinator = await User.findById(coordinator_id);
    if (coordinator) {
      if (!Array.isArray(coordinator.assigned_plumbers)) {
        coordinator.assigned_plumbers = [];
      }

      const alreadyAssigned = coordinator.assigned_plumbers.some(
        (p) => p.toString() === user._id.toString()
      );

      if (!alreadyAssigned) {
        coordinator.assigned_plumbers.push(user._id);
        await coordinator.save();
      }
    }

    res.json({
      message: "KYC approved and plumber assigned successfully",
      id: user._id,
    });
  } catch (error) {
    console.error("Error approving KYC:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/reject", verifyToken, async (req, res) => {
  const { id } = req.body;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.kyc_status = "rejected";
    await user.save();
    res.json({ message: "KYC Rejected", id: user._id });
  } catch (error) {
    console.error("Error rejecting KYC:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const kyc = await User.findById(id);

    if (!kyc) {
      return res.status(404).json({ message: "KYC not found for this user" });
    }

    res.status(200).json(kyc);
  } catch (error) {
    console.error("💥 Error fetching KYC by ID:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
