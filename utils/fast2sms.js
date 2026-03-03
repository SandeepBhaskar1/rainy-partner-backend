const express = require('express');
const axios = require('axios');

const sendAssignedSMS = async (phone) => {
  try {
    console.log("📤 Sending message via Fast2SMS to:", { phone });

    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "dlt",
        sender_id: "RAINYP",
        message: "202127",
        flash: 0,
        numbers: phone,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log("Sending assigning message to:", phone, "via Fast2SMS API");

    console.log("✅ Fast2SMS Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Fast2SMS Error:", error.response?.data || error.message);
    throw new Error("Failed to send OTP");
  }
};

const sendCustomerSMS = async (phone) => {
  try {
    console.log("📤 Sending message via Fast2SMS to:", { phone });

    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "dlt",
        sender_id: "RAINYP",
        message: "202703",
        flash: 0,
        numbers: phone,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log("Sending customer message to:", phone, "via Fast2SMS API");

    console.log("✅ Fast2SMS Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Fast2SMS Error:", error.response?.data || error.message);
    throw new Error("Failed to send OTP");
  }
};

module.exports = {
  sendAssignedSMS,
  sendCustomerSMS
};