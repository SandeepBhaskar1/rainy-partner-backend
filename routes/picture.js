const express = require("express");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { verifyToken, verifyAdminToken, verifyCoordinateToken } = require("../middleware/auth");

const router = express.Router();

router.post("/uploadurl",
  verifyToken, async (req, res) => {
  try {
    const { docType, fileType } = req.body;
    const phone = req.user?.phone;
    if (!phone) {
      return res.status(400).json({ message: "Phone number not found" });
    }

    if (!docType || !fileType) {
      return res
        .status(400)
        .json({ message: "docType and fileType required." });
    }

    const allowedFileTypes = ["jpg", "jpeg", "png"];
    if (!allowedFileTypes.includes(fileType.toLowerCase())) {
      return res.status(400).json({ message: "File Type not allowed." });
    }

    const fileName = `${phone}/${Date.now()}-${docType}.${fileType}`;

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const putObject = async (fileName, fileType) => {
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_DOCUMENTS,
        Key: fileName,
        ContentType: `image/${fileType}`,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: 120 });
      return url;
    };

    const signedUrl = await putObject(fileName, fileType);

    res.json({
      success: true,
      url: signedUrl,
    });
  } catch (error) {
    console.error("Error generating S3 URL:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/get-image", verifyToken, async (req, res) => {
  try {
    const { key } = req.body;
    const phone = req.user?.phone;

    if (!key) {
      return res.status(400).json({ message: "File key is required" });
    }

    if (!key.startsWith(`${phone}/`)) {
      return res.status(403).json({ message: "Access Denied." });
    }

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_DOCUMENTS,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.json({ success: true, url: signedUrl });
  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/installations/get-image", verifyAdminToken, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ message: "File key is required" });

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_DOCUMENTS,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ success: true, url: signedUrl });
  } catch (error) {
    console.error("Error fetching installation image:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/co-ordinator/get-image", verifyCoordinateToken, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ message: "File key is required" });

    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_DOCUMENTS,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ success: true, url: signedUrl });
  } catch (error) {
    console.error("Error fetching installation image:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
